const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { promisify } = require('node:util');

const PORT = 32149;
const SESSION_LENGTH = 32;
const USER_SESSION_DAYS = 30;
const ADMIN_SESSION_HOURS = 8;
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const ADMIN_LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const scrypt = promisify(crypto.scrypt);
const adminSessions = new Map();
const adminAttempts = new Map();
const userAttempts = new Map();

class ApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const isAllowedOrigin = (value) => {
    if (typeof value !== 'string') return false;
    try {
        const origin = new URL(value);
        return ['localhost', '127.0.0.1'].includes(origin.hostname) &&
            ['32148', '32150', '32153', '8081'].includes(origin.port);
    } catch {
        return false;
    }
};

const corsHeaders = (origin) => ({
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(isAllowedOrigin(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
});

const jsonResponse = (response, body, status = 200, origin) => {
    response.writeHead(status, corsHeaders(origin));
    response.end(JSON.stringify(body));
};

const hashPassword = async (password, salt = crypto.randomBytes(16).toString('hex')) => ({
    salt,
    hash: (await scrypt(password, salt, 64)).toString('hex'),
});

const verifyPassword = async (password, salt, expectedHash) => {
    const actual = await scrypt(password, salt, 64);
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const randomToken = () => crypto.randomBytes(SESSION_LENGTH).toString('base64url');

const normalizeUsername = (value) => {
    if (typeof value !== 'string') {
        throw new ApiError(400, 'INVALID_USERNAME', 'Informe um nome de usuário válido.');
    }
    const username = value.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(username)) {
        throw new ApiError(400, 'INVALID_USERNAME', 'O usuário deve ter de 3 a 32 caracteres e usar apenas letras, números, ponto, traço ou sublinhado.');
    }
    return username;
};

const accountPassword = (value) => {
    if (typeof value !== 'string' || value.length < 6 || value.length > 128) {
        throw new ApiError(400, 'INVALID_ACCOUNT_PASSWORD', 'A senha deve ter entre 6 e 128 caracteres.');
    }
    return value;
};

const addCalendarDuration = (date, months) => {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
};

const expiryFrom = (duration, base = new Date()) => {
    const expiresAt = new Date(base);
    if (typeof duration === 'string') {
        const match = duration.match(/^(\d+):(minutes|hours|days|weeks|months|years)$/);
        if (match) {
            const amount = Number(match[1]);
            const unit = match[2];
            const maximums = {
                minutes: 52_596_000,
                hours: 876_600,
                days: 36_525,
                weeks: 5_218,
                months: 1_200,
                years: 100,
            };
            if (!Number.isSafeInteger(amount) || amount < 1 || amount > maximums[unit]) {
                throw new ApiError(400, 'INVALID_DURATION', 'A duração da assinatura excede o limite permitido.');
            }
            if (unit === 'minutes') expiresAt.setTime(expiresAt.getTime() + amount * 60_000);
            else if (unit === 'hours') expiresAt.setTime(expiresAt.getTime() + amount * 3_600_000);
            else if (unit === 'days') expiresAt.setUTCDate(expiresAt.getUTCDate() + amount);
            else if (unit === 'weeks') expiresAt.setUTCDate(expiresAt.getUTCDate() + amount * 7);
            else addCalendarDuration(expiresAt, amount * (unit === 'years' ? 12 : 1));
            return expiresAt.toISOString();
        }
    }
    switch (duration) {
        case 'week':
            expiresAt.setUTCDate(expiresAt.getUTCDate() + 7);
            break;
        case '30d':
            expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);
            break;
        case '90d':
            expiresAt.setUTCDate(expiresAt.getUTCDate() + 90);
            break;
        case '6m':
        case '1y': {
            addCalendarDuration(expiresAt, duration === '6m' ? 6 : 12);
            break;
        }
        default:
            throw new ApiError(400, 'INVALID_DURATION', 'Escolha um prazo de assinatura válido.');
    }
    return expiresAt.toISOString();
};

const publicAccount = ({ id, username, expiresAt, createdAt, suspended }) => ({
    id,
    username,
    expiresAt,
    createdAt,
    suspended,
});

const isLoopback = (address = '') => {
    const normalized = address.toLowerCase().replace(/^::ffff:/, '');
    return normalized === '127.0.0.1' || normalized === '::1';
};

const readRequestBody = (request) => new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
        body += chunk;
        if (Buffer.byteLength(body) > 16_384) {
            reject(new ApiError(413, 'REQUEST_TOO_LARGE', 'A solicitação excede o tamanho permitido.'));
            request.destroy();
        }
    });
    request.on('end', () => {
        try {
            resolve(JSON.parse(body));
        } catch {
            reject(new ApiError(400, 'INVALID_REQUEST', 'O formato da solicitação não é válido.'));
        }
    });
    request.on('error', reject);
});

const createLocalAccountServer = ({ dataDirectory, configPath, host = '0.0.0.0', port = PORT }) => {
    const dbPath = path.join(dataDirectory, 'accounts.json');
    let database = {
        accounts: [],
        settings: { addonsTabVisible: false, maintenanceEnabled: false, maintenanceMessage: '' },
        version: 1,
    };
    let writeQueue = Promise.resolve();

    const persist = async (nextDatabase) => {
        const temporaryPath = `${dbPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        await fs.promises.writeFile(temporaryPath, JSON.stringify(nextDatabase, null, 2), { mode: 0o600 });
        await fs.promises.rename(temporaryPath, dbPath);
        database = nextDatabase;
    };

    const mutate = (operation) => {
        const next = writeQueue.then(async () => {
            const result = await operation(database);
            await persist(database);
            return result;
        });
        writeQueue = next.then(() => undefined, () => undefined);
        return next;
    };

    const getAdminConfig = async () => {
        try {
            const config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
            if (
                typeof config.username !== 'string' ||
                typeof config.passwordSalt !== 'string' ||
                typeof config.passwordHash !== 'string'
            ) {
                throw new Error('The local admin configuration is invalid.');
            }
            return config;
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new ApiError(503, 'SERVER_NOT_CONFIGURED', 'Configure o usuário administrador no computador servidor e reinicie o painel.');
            }
            throw error;
        }
    };

    const requireAdmin = async (body, request) => {
        if (!isLoopback(request.socket.remoteAddress)) {
            throw new ApiError(403, 'ADMIN_LOCAL_ONLY', 'O painel administrativo só pode ser usado no computador servidor.');
        }
        const claims = adminSessions.get(tokenHash(typeof body.token === 'string' ? body.token : ''));
        if (!claims || claims.expiresAt <= Date.now()) {
            throw new ApiError(401, 'ADMIN_SESSION_REQUIRED', 'A sessão administrativa expirou. Entre novamente.');
        }
        return claims;
    };

    const createAdminSession = (username) => {
        const token = randomToken();
        const expiresAt = Date.now() + ADMIN_SESSION_HOURS * 3_600_000;
        adminSessions.set(tokenHash(token), { username, expiresAt });
        return { token, expiresAt };
    };

    const requireLoopback = (request) => {
        if (!isLoopback(request.socket.remoteAddress)) {
            throw new ApiError(403, 'ADMIN_LOCAL_ONLY', 'O painel administrativo só pode ser usado no computador servidor.');
        }
    };

    const getAccountForUser = async (token) => {
        const hash = tokenHash(token);
        const account = database.accounts.find(({ sessions }) => sessions.some((session) =>
            session.tokenHash === hash && session.expiresAt > Date.now()
        ));
        if (!account) {
            throw new ApiError(401, 'INVALID_SESSION', 'Sua sessão não é mais válida. Entre novamente.');
        }
        if (account.suspended) {
            throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'Esta conta foi suspensa. Fale com o administrador.');
        }
        if (new Date(account.expiresAt).getTime() <= Date.now()) {
            throw new ApiError(403, 'ACCOUNT_EXPIRED', 'Sua assinatura venceu. Fale com o administrador.');
        }
        return account;
    };

    const handleAction = async (body, request) => {
        const action = body.action;
        if (action === 'login') {
            const username = normalizeUsername(body.username);
            const password = typeof body.password === 'string' ? body.password : '';
            const attemptKey = `${request.socket.remoteAddress || 'unknown'}:${username}`;
            const attempts = userAttempts.get(attemptKey);
            if (attempts?.blockedUntil > Date.now()) {
                throw new ApiError(429, 'LOGIN_RATE_LIMITED', 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.');
            }
            const account = database.accounts.find((item) => item.username === username);
            if (!account || !(await verifyPassword(password, account.passwordSalt, account.passwordHash))) {
                const failedAttempts = (attempts?.failedAttempts || 0) + 1;
                userAttempts.set(attemptKey, {
                    failedAttempts,
                    blockedUntil: failedAttempts >= 10 ? Date.now() + ADMIN_LOGIN_LOCKOUT_MS : 0,
                });
                throw new ApiError(401, 'INVALID_CREDENTIALS', 'Usuário ou senha incorretos.');
            }
            userAttempts.delete(attemptKey);
            if (account.suspended) {
                throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'Esta conta foi suspensa. Fale com o administrador.');
            }
            if (new Date(account.expiresAt).getTime() <= Date.now()) {
                throw new ApiError(403, 'ACCOUNT_EXPIRED', 'Sua assinatura venceu. Fale com o administrador.');
            }
            const token = randomToken();
            const expiresAt = Date.now() + USER_SESSION_DAYS * 86_400_000;
            await mutate((db) => {
                const current = db.accounts.find((item) => item.id === account.id);
                current.sessions = current.sessions.filter((session) => session.expiresAt > Date.now());
                current.sessions.push({ tokenHash: tokenHash(token), expiresAt });
            });
            return {
                account: publicAccount(account),
                session: { accessToken: token, expiresAt },
            };
        }

        if (action === 'session') {
            if (typeof body.accessToken !== 'string') {
                throw new ApiError(401, 'INVALID_SESSION', 'Sua sessão não é mais válida. Entre novamente.');
            }
            const account = await getAccountForUser(body.accessToken);
            return { account: publicAccount(account) };
        }

        if (action === 'logout') {
            if (typeof body.accessToken !== 'string') {
                throw new ApiError(400, 'INVALID_SESSION', 'Não foi possível encerrar a sessão.');
            }
            const hash = tokenHash(body.accessToken);
            await mutate((db) => {
                db.accounts.forEach((account) => {
                    account.sessions = account.sessions.filter((session) => session.tokenHash !== hash);
                });
            });
            return { success: true };
        }

        if (action === 'appSettings') {
            return {
                addonsTabVisible: database.settings.addonsTabVisible === true,
                maintenanceEnabled: database.settings.maintenanceEnabled === true,
                maintenanceMessage: database.settings.maintenanceMessage || '',
            };
        }

        if (action === 'adminLogin') {
            requireLoopback(request);
            const address = request.socket.remoteAddress || 'unknown';
            const attempts = adminAttempts.get(address);
            if (attempts?.blockedUntil > Date.now()) {
                throw new ApiError(429, 'ADMIN_LOGIN_RATE_LIMITED', 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.');
            }
            const admin = await getAdminConfig();
            const username = typeof body.username === 'string' ? body.username.trim() : '';
            const password = typeof body.password === 'string' ? body.password : '';
            const matches = username.toLowerCase() === admin.username.toLowerCase() &&
                await verifyPassword(password, admin.passwordSalt, admin.passwordHash);
            if (!matches) {
                const failedAttempts = (attempts?.failedAttempts || 0) + 1;
                adminAttempts.set(address, {
                    failedAttempts,
                    blockedUntil: failedAttempts >= ADMIN_LOGIN_MAX_ATTEMPTS ? Date.now() + ADMIN_LOGIN_LOCKOUT_MS : 0,
                });
                throw new ApiError(401, 'INVALID_CREDENTIALS', 'Usuário ou senha administrativa incorretos.');
            }
            adminAttempts.delete(address);
            return createAdminSession(admin.username);
        }

        if (action === 'adminStatus') {
            requireLoopback(request);
            try {
                await getAdminConfig();
                return { configured: true };
            } catch (error) {
                if (error instanceof ApiError && error.code === 'SERVER_NOT_CONFIGURED') {
                    return { configured: false };
                }
                throw error;
            }
        }

        if (action === 'adminSetup') {
            requireLoopback(request);
            try {
                await getAdminConfig();
                throw new ApiError(409, 'ADMIN_ALREADY_CONFIGURED', 'O administrador já foi configurado neste computador.');
            } catch (error) {
                if (!(error instanceof ApiError) || error.code !== 'SERVER_NOT_CONFIGURED') throw error;
            }
            const username = typeof body.username === 'string' ? body.username.trim() : '';
            normalizeUsername(username);
            const password = typeof body.password === 'string' ? body.password : '';
            if (password.length < 6) {
                throw new ApiError(400, 'INVALID_ADMIN_PASSWORD', 'A senha administrativa deve ter pelo menos 6 caracteres.');
            }
            const passwordDigest = await hashPassword(password);
            const temporaryPath = `${configPath}.${process.pid}.tmp`;
            await fs.promises.writeFile(temporaryPath, JSON.stringify({
                username,
                passwordSalt: passwordDigest.salt,
                passwordHash: passwordDigest.hash,
            }, null, 2), { mode: 0o600 });
            await fs.promises.rename(temporaryPath, configPath);
            return { configured: true };
        }

        if (action === 'adminSession' || action === 'adminAppSettings' || action === 'adminList' || action === 'adminCreate' || action === 'adminUpdate' || action === 'adminUpdateAppSettings') {
            await requireAdmin(body, request);
        }

        if (action === 'adminSession') return { username: adminSessions.get(tokenHash(body.token)).username };
        if (action === 'adminAppSettings') return {
            addonsTabVisible: database.settings.addonsTabVisible === true,
            maintenanceEnabled: database.settings.maintenanceEnabled === true,
            maintenanceMessage: database.settings.maintenanceMessage || '',
        };

        if (action === 'adminUpdateAppSettings') {
            const hasAddonSetting = body.addonsTabVisible !== undefined;
            const hasMaintenanceSetting = body.maintenanceEnabled !== undefined;
            const hasMaintenanceMessage = body.maintenanceMessage !== undefined;
            if ((!hasAddonSetting && !hasMaintenanceSetting && !hasMaintenanceMessage) ||
                (hasAddonSetting && typeof body.addonsTabVisible !== 'boolean') ||
                (hasMaintenanceSetting && typeof body.maintenanceEnabled !== 'boolean') ||
                (hasMaintenanceMessage && (typeof body.maintenanceMessage !== 'string' || body.maintenanceMessage.length > 300))) {
                throw new ApiError(400, 'INVALID_APP_SETTINGS', 'As opções do aplicativo não são válidas.');
            }
            await mutate((db) => {
                if (hasAddonSetting) db.settings.addonsTabVisible = body.addonsTabVisible;
                if (hasMaintenanceSetting) db.settings.maintenanceEnabled = body.maintenanceEnabled;
                if (hasMaintenanceMessage) db.settings.maintenanceMessage = body.maintenanceMessage.trim();
            });
            return {
                addonsTabVisible: database.settings.addonsTabVisible,
                maintenanceEnabled: database.settings.maintenanceEnabled,
                maintenanceMessage: database.settings.maintenanceMessage || '',
            };
        }

        if (action === 'adminList') {
            return { accounts: database.accounts.map(publicAccount) };
        }

        if (action === 'adminCreate') {
            const username = normalizeUsername(body.username);
            const password = accountPassword(body.password);
            if (database.accounts.some((account) => account.username === username)) {
                throw new ApiError(409, 'USERNAME_TAKEN', 'Esse nome de usuário já está sendo usado.');
            }
            const passwordDigest = await hashPassword(password);
            const account = {
                id: crypto.randomUUID(),
                username,
                passwordSalt: passwordDigest.salt,
                passwordHash: passwordDigest.hash,
                expiresAt: expiryFrom(body.duration),
                createdAt: new Date().toISOString(),
                suspended: false,
                sessions: [],
            };
            await mutate((db) => {
                if (db.accounts.some((item) => item.username === username)) {
                    throw new ApiError(409, 'USERNAME_TAKEN', 'Esse nome de usuário já está sendo usado.');
                }
                db.accounts.unshift(account);
            });
            return { account: publicAccount(account) };
        }

        if (action === 'adminUpdate') {
            if (typeof body.id !== 'string') {
                throw new ApiError(400, 'INVALID_ACCOUNT', 'A conta selecionada não é válida.');
            }
            const account = database.accounts.find((item) => item.id === body.id);
            if (!account) throw new ApiError(404, 'USER_NOT_FOUND', 'A conta não foi encontrada.');

            if (body.updateAction === 'delete') {
                await mutate((db) => {
                    db.accounts = db.accounts.filter((item) => item.id !== account.id);
                });
                return { success: true };
            }
            if (body.updateAction === 'resetPassword') {
                const password = accountPassword(body.password);
                const passwordDigest = await hashPassword(password);
                await mutate((db) => {
                    const current = db.accounts.find((item) => item.id === account.id);
                    current.passwordSalt = passwordDigest.salt;
                    current.passwordHash = passwordDigest.hash;
                    current.sessions = [];
                });
                return { account: publicAccount(account) };
            }
            if (body.updateAction === 'suspend' || body.updateAction === 'activate') {
                await mutate((db) => {
                    const current = db.accounts.find((item) => item.id === account.id);
                    current.suspended = body.updateAction === 'suspend';
                    current.sessions = [];
                });
                return { account: publicAccount(account) };
            }
            if (body.updateAction === 'renew') {
                const startAt = Math.max(Date.now(), new Date(account.expiresAt).getTime());
                const expiresAt = expiryFrom(body.duration, new Date(startAt));
                await mutate((db) => {
                    db.accounts.find((item) => item.id === account.id).expiresAt = expiresAt;
                });
                return { account: publicAccount({ ...account, expiresAt }) };
            }
            throw new ApiError(400, 'INVALID_ACTION', 'A ação solicitada não é válida.');
        }

        throw new ApiError(400, 'INVALID_ACTION', 'A solicitação não é válida.');
    };

    const server = http.createServer(async (request, response) => {
        if (request.method === 'OPTIONS') {
            response.writeHead(204, corsHeaders(request.headers.origin));
            response.end();
            return;
        }
        if (request.method !== 'POST' || request.url !== '/api') {
            jsonResponse(response, { error: { code: 'NOT_FOUND', message: 'Endpoint não encontrado.' } }, 404, request.headers.origin);
            return;
        }
        try {
            const body = await readRequestBody(request);
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
                throw new ApiError(400, 'INVALID_REQUEST', 'O formato da solicitação não é válido.');
            }
            const result = await handleAction(body, request);
            jsonResponse(response, result, 200, request.headers.origin);
        } catch (error) {
            if (error instanceof ApiError) {
                jsonResponse(response, { error: { code: error.code, message: error.message } }, error.status, request.headers.origin);
            } else {
                console.error('Local Cine Resenha account server error:', error);
                jsonResponse(response, {
                    error: { code: 'SERVER_ERROR', message: 'O servidor local não conseguiu concluir a solicitação.' },
                }, 500, request.headers.origin);
            }
        }
    });

    const start = async () => {
        await fs.promises.mkdir(dataDirectory, { recursive: true });
        try {
            const saved = JSON.parse(await fs.promises.readFile(dbPath, 'utf8'));
            if (!Array.isArray(saved.accounts) || !saved.settings || typeof saved.settings !== 'object') {
                throw new Error(`The account data file is invalid: ${dbPath}`);
            }
            database = saved;
            database.settings.addonsTabVisible = database.settings.addonsTabVisible === true;
            database.settings.maintenanceEnabled = database.settings.maintenanceEnabled === true;
            database.settings.maintenanceMessage = typeof database.settings.maintenanceMessage === 'string' ?
                database.settings.maintenanceMessage : '';
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            await persist(database);
        }
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, host, resolve);
        });
        return server;
    };

    return {
        server,
        start,
        close: () => new Promise((resolve, reject) => {
            if (!server.listening) {
                resolve();
                return;
            }
            server.close((error) => error ? reject(error) : resolve());
        }),
    };
};

module.exports = { createLocalAccountServer, hashPassword, verifyPassword, PORT };

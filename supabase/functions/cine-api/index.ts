declare const Deno: {
    env: { get(name: string): string | undefined },
    serve(handler: (request: Request) => Response | Promise<Response>): void,
};

const corsOrigins = new Set([
    "http://127.0.0.1:32148",
    "http://localhost:32148",
    "http://127.0.0.1:32153",
    "http://localhost:32153",
    "http://127.0.0.1:32150",
    "http://localhost:32150",
    "http://127.0.0.1:32153",
    "http://localhost:32153",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
]);
const passwordIterations = 310_000;
const userSessionMilliseconds = 30 * 24 * 60 * 60 * 1000;
const adminSessionMilliseconds = 8 * 60 * 60 * 1000;
const loginLockoutMilliseconds = 15 * 60 * 1000;
const usernamePattern = /^[a-z0-9._-]{3,32}$/;
const responseHeaders = (origin: string | null) => ({
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-cine-setup-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...(origin && corsOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
});

class ApiError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const json = (body: unknown, status = 200, origin: string | null = null) =>
    new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });

const requiredEnv = (name: string) => {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing required Supabase function secret: ${name}`);
    return value.replace(/\/+$/, "");
};

const supabaseUrl = () => requiredEnv("SUPABASE_URL");
const serviceKey = () => requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const dbRequest = async <T>(
    table: string,
    method: string,
    query: Record<string, string> = {},
    body?: unknown,
    prefer?: string,
): Promise<T> => {
    const url = new URL(`/rest/v1/${table}`, supabaseUrl());
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    const headers: Record<string, string> = {
        apikey: serviceKey(),
        Authorization: `Bearer ${serviceKey()}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;

    const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
        let details: { code?: string, message?: string } = {};
        try {
            details = JSON.parse(text);
        } catch {
            throw new Error(`Supabase database request failed with status ${response.status}.`);
        }
        if (response.status === 409 || details.code === "23505") {
            throw new ApiError(409, "USERNAME_TAKEN", "Esse nome de usuário já está sendo usado.");
        }
        console.error("Supabase database request failed:", response.status, details.code, details.message);
        throw new Error("O banco de dados online não conseguiu concluir a solicitação.");
    }
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
};

const selectRows = <T>(table: string, query: Record<string, string>) =>
    dbRequest<T[]>(table, "GET", { select: "*", ...query });

const insertRows = <T>(table: string, body: unknown) =>
    dbRequest<T[]>(table, "POST", {}, body, "return=representation");

const updateRows = <T>(table: string, query: Record<string, string>, body: unknown) =>
    dbRequest<T[]>(table, "PATCH", query, body, "return=representation");

const deleteRows = (table: string, query: Record<string, string>) =>
    dbRequest<void>(table, "DELETE", query);

type AnnouncementRow = {
    id: string,
    message: string,
    updated_at: string,
};

const listAnnouncements = async () => {
    const rows = await selectRows<AnnouncementRow>("app_announcements", { order: "created_at.desc" });
    return rows.map(({ id, message, updated_at }) => ({ id, message, updatedAt: updated_at }));
};

const getAppSettingsResponse = async () => {
    const [rows, announcements] = await Promise.all([
        selectRows<{
            addons_tab_visible: boolean,
            maintenance_enabled: boolean,
            maintenance_message: string | null,
        }>("app_settings", { singleton: "eq.true", limit: "1" }),
        listAnnouncements(),
    ]);
    return {
        addonsTabVisible: rows[0]?.addons_tab_visible === true,
        maintenanceEnabled: rows[0]?.maintenance_enabled === true,
        maintenanceMessage: rows[0]?.maintenance_message || "",
        announcements,
    };
};

const parseAnnouncementId = (value: unknown) => {
    if (typeof value !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        throw new ApiError(400, "INVALID_ANNOUNCEMENT", "O aviso selecionado não é válido.");
    }
    return value;
};

const base64Url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

const secureRandomBytes = (length: number) => crypto.getRandomValues(new Uint8Array(length));
const sha256 = async (value: string) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};
const randomToken = () => base64Url(secureRandomBytes(32));
const tokenDigest = sha256;

const hashPassword = async (
    password: string,
    salt: Uint8Array = secureRandomBytes(16),
    iterations = passwordIterations,
) => {
    const saltBytes = Uint8Array.from(salt);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const digest = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
        key,
        256,
    );
    return {
        salt: base64Url(saltBytes),
        hash: base64Url(new Uint8Array(digest)),
        iterations,
    };
};

const dummyPasswordDigest = hashPassword("not-a-real-account-password", new Uint8Array(16));

const decodeBase64Url = (value: string) => {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const constantTimeEqual = (left: Uint8Array, right: Uint8Array) => {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
        difference |= left[index] ^ right[index];
    }
    return difference === 0;
};

const verifyPassword = async (
    password: string,
    salt: string,
    expectedHash: string,
    iterations: number,
) => {
    const actual = decodeBase64Url((await hashPassword(password, decodeBase64Url(salt), iterations)).hash);
    const expected = decodeBase64Url(expectedHash);
    return constantTimeEqual(actual, expected);
};

const normalizeUsername = (value: unknown) => {
    if (typeof value !== "string") {
        throw new ApiError(400, "INVALID_USERNAME", "Informe um nome de usuário válido.");
    }
    const username = value.trim().toLowerCase();
    if (!usernamePattern.test(username)) {
        throw new ApiError(400, "INVALID_USERNAME", "O usuário deve ter de 3 a 32 caracteres e usar apenas letras, números, ponto, traço ou sublinhado.");
    }
    return username;
};

const accountPassword = (value: unknown) => {
    if (typeof value !== "string" || value.length < 6 || value.length > 128) {
        throw new ApiError(400, "INVALID_ACCOUNT_PASSWORD", "A senha deve ter entre 6 e 128 caracteres.");
    }
    return value;
};

const addCalendarDuration = (date: Date, months: number) => {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
};

const expiryFrom = (duration: unknown, base: Date) => {
    if (typeof duration !== "string") {
        throw new ApiError(400, "INVALID_DURATION", "Escolha a validade da conta.");
    }
    const match = duration.match(/^(\d+):(days|weeks|months|years)$/);
    if (!match) throw new ApiError(400, "INVALID_DURATION", "Escolha uma validade permitida.");
    const amount = Number(match[1]);
    const unit = match[2];
    const maximums: Record<string, number> = {
        days: 36_525,
        weeks: 5_218,
        months: 1_200,
        years: 100,
    };
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > maximums[unit]) {
        throw new ApiError(400, "INVALID_DURATION", "A validade da conta excede o limite permitido.");
    }
    const expiresAt = new Date(base);
    if (unit === "days") expiresAt.setUTCDate(expiresAt.getUTCDate() + amount);
    else if (unit === "weeks") expiresAt.setUTCDate(expiresAt.getUTCDate() + amount * 7);
    else addCalendarDuration(expiresAt, amount * (unit === "years" ? 12 : 1));
    return expiresAt.toISOString();
};

const publicAccount = ({ id, username, expires_at, created_at, suspended, is_admin }: Record<string, unknown>) => ({
    id,
    username,
    expiresAt: expires_at,
    createdAt: created_at,
    suspended,
    role: is_admin === true ? "admin" as const : "user" as const,
});

const digestIdentifier = sha256;

const checkLoginRate = async (key: string) => {
    const rows = await selectRows<{ failed_attempts: number, blocked_until: string | null }>(
        "login_attempts",
        { attempt_key: `eq.${key}`, limit: "1" },
    );
    const attempt = rows[0];
    if (attempt?.blocked_until && new Date(attempt.blocked_until).getTime() > Date.now()) {
        throw new ApiError(429, "LOGIN_RATE_LIMITED", "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.");
    }
    return attempt;
};

const recordFailedLogin = async (key: string, previousFailures: number) => {
    const failedAttempts = previousFailures + 1;
    const blockedUntil = failedAttempts >= 5 ?
        new Date(Date.now() + loginLockoutMilliseconds).toISOString() :
        null;
    await dbRequest("login_attempts", "POST", {}, {
        attempt_key: key,
        failed_attempts: failedAttempts,
        blocked_until: blockedUntil,
    }, "resolution=merge-duplicates,return=minimal");
};

const clearLoginFailures = (key: string) => deleteRows("login_attempts", { attempt_key: `eq.${key}` });

const createSession = async (owner: "account_id" | "admin_id", id: string, duration: number) => {
    await deleteRows("api_sessions", { expires_at: `lt.${new Date().toISOString()}` });
    const token = randomToken();
    const expiresAt = Date.now() + duration;
    await insertRows("api_sessions", {
        token_hash: await tokenDigest(token),
        [owner]: id,
        expires_at: new Date(expiresAt).toISOString(),
    });
    return { token, expiresAt };
};

const requireAdmin = async (token: unknown) => {
    if (typeof token !== "string" || !token) {
        throw new ApiError(401, "ADMIN_SESSION_REQUIRED", "Entre novamente no painel administrativo.");
    }
    const sessions = await selectRows<{ admin_id: string | null, account_id: string | null, expires_at: string }>(
        "api_sessions",
        { token_hash: `eq.${await tokenDigest(token)}`, limit: "1" },
    );
    const session = sessions[0];
    if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
        throw new ApiError(401, "ADMIN_SESSION_REQUIRED", "A sessão administrativa expirou. Entre novamente.");
    }
    if (session.admin_id) {
        const admins = await selectRows<{ username: string }>(
            "admin_credentials",
            { id: `eq.${session.admin_id}`, limit: "1" },
        );
        if (!admins[0]) throw new ApiError(401, "ADMIN_SESSION_REQUIRED", "A sessão administrativa expirou. Entre novamente.");
        const username = admins[0].username;
        return { id: session.admin_id, username, canCreateAdmin: username === "jhow" };
    }
    if (session.account_id) {
        const accounts = await selectRows<Record<string, unknown>>(
            "accounts",
            { id: `eq.${session.account_id}`, limit: "1" },
        );
        const account = accounts[0];
        if (!account || account.is_admin !== true || account.suspended ||
            (account.expires_at && new Date(String(account.expires_at)).getTime() <= Date.now())) {
            throw new ApiError(401, "ADMIN_SESSION_REQUIRED", "A sessão administrativa expirou. Entre novamente.");
        }
        return {
            id: session.account_id,
            username: String(account.username),
            canCreateAdmin: String(account.username) === "jhow",
        };
    }
    throw new ApiError(401, "ADMIN_SESSION_REQUIRED", "A sessão administrativa expirou. Entre novamente.");
};

const requireUser = async (token: unknown) => {
    if (typeof token !== "string" || !token) {
        throw new ApiError(401, "INVALID_SESSION", "Sua sessão não é mais válida. Entre novamente.");
    }
    const sessions = await selectRows<{ admin_id: string | null, account_id: string | null, expires_at: string }>(
        "api_sessions",
        { token_hash: `eq.${await tokenDigest(token)}`, limit: "1" },
    );
    const session = sessions[0];
    if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
        throw new ApiError(401, "INVALID_SESSION", "Sua sessão não é mais válida. Entre novamente.");
    }
    if (session.admin_id) {
        const admins = await selectRows<Record<string, unknown>>(
            "admin_credentials",
            { id: `eq.${session.admin_id}`, limit: "1" },
        );
        if (!admins[0]) throw new ApiError(401, "INVALID_SESSION", "Sua sessão não é mais válida. Entre novamente.");
        return publicAccount({
            ...admins[0],
            expires_at: null,
            suspended: false,
            is_admin: true,
        });
    }
    if (!session.account_id) {
        throw new ApiError(401, "INVALID_SESSION", "Sua sessão não é mais válida. Entre novamente.");
    }
    const accounts = await selectRows<Record<string, unknown>>(
        "accounts",
        { id: `eq.${session.account_id}`, limit: "1" },
    );
    const account = accounts[0];
    if (!account) throw new ApiError(401, "INVALID_SESSION", "Sua sessão não é mais válida. Entre novamente.");
    if (account.suspended) throw new ApiError(403, "ACCOUNT_SUSPENDED", "Esta conta foi suspensa. Fale com o administrador.");
    if (account.expires_at && new Date(String(account.expires_at)).getTime() <= Date.now()) {
        throw new ApiError(403, "ACCOUNT_EXPIRED", "Sua assinatura venceu. Fale com o administrador.");
    }
    return account;
};

const accountById = async (id: unknown) => {
    if (typeof id !== "string") throw new ApiError(400, "INVALID_ACCOUNT", "A conta selecionada não é válida.");
    const rows = await selectRows<Record<string, unknown>>("accounts", { id: `eq.${id}`, limit: "1" });
    if (!rows[0]) throw new ApiError(404, "USER_NOT_FOUND", "A conta não foi encontrada.");
    return rows[0];
};

const createAccount = async (body: Record<string, unknown>, isAdmin = false) => {
    const username = normalizeUsername(body.username);
    if (isAdmin && username === "jhow") {
        throw new ApiError(400, "RESERVED_ADMIN_USERNAME", "O nome jhow é reservado para o administrador principal.");
    }
    const existingAdmin = await selectRows<{ id: string }>(
        "admin_credentials",
        { username: `eq.${username}`, select: "id", limit: "1" },
    );
    if (existingAdmin.length > 0) {
        throw new ApiError(409, "USERNAME_TAKEN", "Esse nome de usuário já está sendo usado.");
    }
    const password = accountPassword(body.password);
    const createdAt = new Date();
    const digest = await hashPassword(password);
    const rows = await insertRows<Record<string, unknown>>("accounts", {
        username,
        password_salt: digest.salt,
        password_hash: digest.hash,
        password_iterations: digest.iterations,
        expires_at: isAdmin ? null : expiryFrom(body.duration, createdAt),
        created_at: createdAt.toISOString(),
        suspended: false,
        is_admin: isAdmin,
    });
    if (!rows[0]) throw new Error("Supabase did not return the created account.");
    return { account: publicAccount(rows[0]) };
};

const handleAction = async (body: Record<string, unknown>, request: Request) => {
    const action = body.action;
    if (action === "appUpdateCheck") {
        // Older installed clients still poll this action; return no update to avoid error notifications.
        return { updateAvailable: false };
    }
    if (action === "adminStatus") {
        const admins = await selectRows<{ id: string }>("admin_credentials", { select: "id", limit: "1" });
        return { configured: admins.length > 0 };
    }

    if (action === "adminSetup") {
        const setupKey = Deno.env.get("CINE_ADMIN_SETUP_KEY");
        const suppliedKey = request.headers.get("x-cine-setup-key") || "";
        if (!setupKey || !constantTimeEqual(new TextEncoder().encode(suppliedKey), new TextEncoder().encode(setupKey))) {
            throw new ApiError(403, "ADMIN_SETUP_NOT_ALLOWED", "A chave de configuração do administrador não é válida.");
        }
        const existing = await selectRows<{ id: string }>("admin_credentials", { select: "id", limit: "1" });
        if (existing.length > 0) {
            throw new ApiError(409, "ADMIN_ALREADY_CONFIGURED", "O administrador já foi configurado neste projeto.");
        }
        const username = normalizeUsername(body.username);
        const password = typeof body.password === "string" ? body.password : "";
        if (password.length < 12) {
            throw new ApiError(400, "INVALID_ADMIN_PASSWORD", "A senha administrativa deve ter pelo menos 12 caracteres.");
        }
        const digest = await hashPassword(password);
        try {
            await insertRows("admin_credentials", {
                username,
                password_salt: digest.salt,
                password_hash: digest.hash,
                password_iterations: digest.iterations,
            });
        } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
                throw new ApiError(409, "ADMIN_ALREADY_CONFIGURED", "O administrador já foi configurado neste projeto.");
            }
            throw error;
        }
        return { configured: true };
    }

    if (action === "adminLogin") {
        const username = normalizeUsername(body.username);
        const password = typeof body.password === "string" ? body.password : "";
        const address = request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "unknown";
        const attemptKey = await digestIdentifier(`admin:${address}:${username}`);
        const attempts = await checkLoginRate(attemptKey);
        const admins = await selectRows<Record<string, unknown>>(
            "admin_credentials",
            { username: `eq.${username}`, limit: "1" },
        );
        const accountAdmins = admins.length === 0 ? await selectRows<Record<string, unknown>>(
            "accounts",
            { username: `eq.${username}`, is_admin: "eq.true", limit: "1" },
        ) : [];
        const admin = admins[0] || accountAdmins[0];
        const matches = admin ? await verifyPassword(
            password,
            String(admin.password_salt),
            String(admin.password_hash),
            Number(admin.password_iterations),
        ) : await verifyPassword(
            password,
            (await dummyPasswordDigest).salt,
            (await dummyPasswordDigest).hash,
            (await dummyPasswordDigest).iterations,
        );
        if (!admin || !matches || admin.suspended === true ||
            (admin.expires_at && new Date(String(admin.expires_at)).getTime() <= Date.now())) {
            await recordFailedLogin(attemptKey, attempts?.failed_attempts || 0);
            throw new ApiError(401, "INVALID_CREDENTIALS", "Usuário ou senha administrativa incorretos.");
        }
        await clearLoginFailures(attemptKey);
        const session = admins[0] ?
            await createSession("admin_id", String(admin.id), adminSessionMilliseconds) :
            await createSession("account_id", String(admin.id), adminSessionMilliseconds);
        return { ...session, username, canCreateAdmin: username === "jhow" };
    }

    if (action === "login") {
        const username = normalizeUsername(body.username);
        const password = typeof body.password === "string" ? body.password : "";
        const address = request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "unknown";
        const attemptKey = await digestIdentifier(`user:${address}:${username}`);
        const attempts = await checkLoginRate(attemptKey);
        const accounts = await selectRows<Record<string, unknown>>(
            "accounts",
            { username: `eq.${username}`, limit: "1" },
        );
        const account = accounts[0];
        const legacyAdmins = account ? [] : await selectRows<Record<string, unknown>>(
            "admin_credentials",
            { username: `eq.${username}`, limit: "1" },
        );
        const adminCredential = legacyAdmins[0];
        const credential = account || adminCredential;
        const matches = credential ? await verifyPassword(
            password,
            String(credential.password_salt),
            String(credential.password_hash),
            Number(credential.password_iterations),
        ) : await verifyPassword(
            password,
            (await dummyPasswordDigest).salt,
            (await dummyPasswordDigest).hash,
            (await dummyPasswordDigest).iterations,
        );
        if (!credential || !matches) {
            await recordFailedLogin(attemptKey, attempts?.failed_attempts || 0);
            throw new ApiError(401, "INVALID_CREDENTIALS", "Usuário ou senha incorretos.");
        }
        if (adminCredential) {
            await clearLoginFailures(attemptKey);
            const session = await createSession("admin_id", String(adminCredential.id), userSessionMilliseconds);
            return {
                account: publicAccount({
                    ...adminCredential,
                    expires_at: null,
                    suspended: false,
                    is_admin: true,
                }),
                session: { accessToken: session.token, expiresAt: session.expiresAt },
            };
        }
        if (account.suspended) throw new ApiError(403, "ACCOUNT_SUSPENDED", "Esta conta foi suspensa. Fale com o administrador.");
        if (account.expires_at && new Date(String(account.expires_at)).getTime() <= Date.now()) {
            throw new ApiError(403, "ACCOUNT_EXPIRED", "Sua assinatura venceu. Fale com o administrador.");
        }
        await clearLoginFailures(attemptKey);
        const session = await createSession("account_id", String(account.id), userSessionMilliseconds);
        return { account: publicAccount(account), session: { accessToken: session.token, expiresAt: session.expiresAt } };
    }

    if (action === "session") {
        return { account: publicAccount(await requireUser(body.accessToken)) };
    }

    if (action === "logout") {
        if (typeof body.accessToken !== "string") throw new ApiError(400, "INVALID_SESSION", "Não foi possível encerrar a sessão.");
        await deleteRows("api_sessions", { token_hash: `eq.${await tokenDigest(body.accessToken)}` });
        return { success: true };
    }

    if (action === "appSettings") {
        return await getAppSettingsResponse();
    }

    const admin = await requireAdmin(body.token);
    if (action === "adminSession") return { username: admin.username, canCreateAdmin: admin.canCreateAdmin };

    if (action === "adminAppSettings") {
        return await getAppSettingsResponse();
    }

    if (action === "adminUpdateAppSettings") {
        const changes: Record<string, boolean | string> = {};
        if (body.addonsTabVisible !== undefined) {
            if (typeof body.addonsTabVisible !== "boolean") {
                throw new ApiError(400, "INVALID_APP_SETTINGS", "A opção da aba de add-ons não é válida.");
            }
            changes.addons_tab_visible = body.addonsTabVisible;
        }
        if (body.maintenanceEnabled !== undefined) {
            if (typeof body.maintenanceEnabled !== "boolean") {
                throw new ApiError(400, "INVALID_APP_SETTINGS", "O estado da manutenção não é válido.");
            }
            changes.maintenance_enabled = body.maintenanceEnabled;
        }
        if (body.maintenanceMessage !== undefined) {
            if (typeof body.maintenanceMessage !== "string" || body.maintenanceMessage.length > 300) {
                throw new ApiError(400, "INVALID_APP_SETTINGS", "A mensagem de manutenção deve ter até 300 caracteres.");
            }
            changes.maintenance_message = body.maintenanceMessage.trim();
        }
        if (Object.keys(changes).length === 0) {
            throw new ApiError(400, "INVALID_APP_SETTINGS", "Informe uma opção válida para atualizar.");
        }
        await updateRows(
            "app_settings",
            { singleton: "eq.true" },
            changes,
        );
        return await getAppSettingsResponse();
    }

    if (action === "adminCreateAnnouncement") {
        if (typeof body.message !== "string" || body.message.trim().length === 0 || body.message.length > 500) {
            throw new ApiError(400, "INVALID_ANNOUNCEMENT", "O aviso deve ter de 1 a 500 caracteres.");
        }
        const rows = await insertRows<AnnouncementRow>("app_announcements", {
            message: body.message.trim(),
        });
        if (!rows[0]) throw new Error("Supabase did not return the created announcement.");
        return {
            announcement: {
                id: rows[0].id,
                message: rows[0].message,
                updatedAt: rows[0].updated_at,
            },
        };
    }

    if (action === "adminUpdateAnnouncement") {
        const id = parseAnnouncementId(body.id);
        if (typeof body.message !== "string" || body.message.trim().length === 0 || body.message.length > 500) {
            throw new ApiError(400, "INVALID_ANNOUNCEMENT", "O aviso deve ter de 1 a 500 caracteres.");
        }
        const rows = await updateRows<AnnouncementRow>(
            "app_announcements",
            { id: `eq.${id}` },
            { message: body.message.trim(), updated_at: new Date().toISOString() },
        );
        if (!rows[0]) throw new ApiError(404, "ANNOUNCEMENT_NOT_FOUND", "Esse aviso não existe mais.");
        return {
            announcement: {
                id: rows[0].id,
                message: rows[0].message,
                updatedAt: rows[0].updated_at,
            },
        };
    }

    if (action === "adminDeleteAnnouncement") {
        const id = parseAnnouncementId(body.id);
        await deleteRows("app_announcements", { id: `eq.${id}` });
        return { success: true };
    }

    if (action === "adminList") {
        const accounts = await selectRows<Record<string, unknown>>("accounts", { order: "created_at.desc" });
        const admins = await selectRows<Record<string, unknown>>("admin_credentials", { order: "created_at.desc" });
        const now = Date.now();
        const eligibleAccountIds = new Set(accounts
            .filter((account) =>
                !account.suspended &&
                (!account.expires_at || new Date(String(account.expires_at)).getTime() > now))
            .map((account) => String(account.id)));
        const sessions = await selectRows<{ account_id: string }>("api_sessions", {
            account_id: "not.is.null",
            expires_at: `gt.${new Date().toISOString()}`,
            select: "account_id",
        });
        const activeSessions = new Map<string, number>();
        sessions.forEach(({ account_id }) => {
            if (eligibleAccountIds.has(account_id)) {
                activeSessions.set(account_id, (activeSessions.get(account_id) || 0) + 1);
            }
        });
        const adminSessions = await selectRows<{ admin_id: string }>("api_sessions", {
            admin_id: "not.is.null",
            expires_at: `gt.${new Date().toISOString()}`,
            select: "admin_id",
        });
        const activeAdminSessions = new Map<string, number>();
        adminSessions.forEach(({ admin_id }) => {
            activeAdminSessions.set(admin_id, (activeAdminSessions.get(admin_id) || 0) + 1);
        });
        return {
            accounts: [
                ...admins.map((admin) => ({
                    id: String(admin.id),
                    username: String(admin.username),
                    expiresAt: null,
                    createdAt: String(admin.created_at || new Date().toISOString()),
                    suspended: false,
                    activeSessions: activeAdminSessions.get(String(admin.id)) || 0,
                    role: "admin" as const,
                })),
                ...accounts.map((account) => ({
                    ...publicAccount(account),
                    activeSessions: activeSessions.get(String(account.id)) || 0,
                    role: account.is_admin === true ? "admin" as const : "user" as const,
                })),
            ],
        };
    }

    if (action === "adminCreate") {
        const isAdmin = body.isAdmin === true;
        return await createAccount(body, isAdmin);
    }

    if (action === "adminUpdate") {
        const account = await accountById(body.id);
        const id = String(account.id);
        if (account.is_admin === true && !admin.canCreateAdmin) {
            throw new ApiError(403, "ADMIN_ACCOUNT_MANAGEMENT_NOT_ALLOWED", "Somente o administrador principal pode alterar acessos administrativos.");
        }
        if (body.updateAction === "delete") {
            await deleteRows("accounts", { id: `eq.${id}` });
            return { success: true };
        }
        if (body.updateAction === "resetPassword") {
            const password = accountPassword(body.password);
            const digest = await hashPassword(password);
            const rows = await updateRows<Record<string, unknown>>(
                "accounts",
                { id: `eq.${id}` },
                {
                    password_salt: digest.salt,
                    password_hash: digest.hash,
                    password_iterations: digest.iterations,
                },
            );
            await deleteRows("api_sessions", { account_id: `eq.${id}` });
            return { account: publicAccount(rows[0]) };
        }
        if (body.updateAction === "updateUsername") {
            const username = normalizeUsername(body.username);
            const existingAdmin = await selectRows<{ id: string }>(
                "admin_credentials",
                { username: `eq.${username}`, select: "id", limit: "1" },
            );
            if (existingAdmin.length > 0) {
                throw new ApiError(409, "USERNAME_TAKEN", "Esse nome de usuário já está sendo usado.");
            }
            const rows = await updateRows<Record<string, unknown>>(
                "accounts",
                { id: `eq.${id}` },
                { username },
            );
            if (!rows[0]) throw new ApiError(404, "USER_NOT_FOUND", "A conta não foi encontrada.");
            return { account: publicAccount(rows[0]) };
        }
        if (body.updateAction === "logoutSessions") {
            await deleteRows("api_sessions", { account_id: `eq.${id}` });
            return { success: true };
        }
        if (body.updateAction === "suspend" || body.updateAction === "activate") {
            const rows = await updateRows<Record<string, unknown>>(
                "accounts",
                { id: `eq.${id}` },
                { suspended: body.updateAction === "suspend" },
            );
            await deleteRows("api_sessions", { account_id: `eq.${id}` });
            return { account: publicAccount(rows[0]) };
        }
        throw new ApiError(400, "INVALID_ACTION", "A ação solicitada não é válida.");
    }

    throw new ApiError(400, "INVALID_ACTION", "A solicitação não é válida.");
};

Deno.serve(async (request) => {
    const origin = request.headers.get("origin");
    if (request.method === "OPTIONS") {
        if (origin && !corsOrigins.has(origin)) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: responseHeaders(origin) });
    }
    if (request.method !== "POST") {
        return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } }, 405, origin);
    }
    if (origin && !corsOrigins.has(origin)) {
        return json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origem não permitida." } }, 403, origin);
    }

    try {
        const contentLength = Number(request.headers.get("content-length") || 0);
        if (contentLength > 16_384) {
            throw new ApiError(413, "REQUEST_TOO_LARGE", "A solicitação excede o tamanho permitido.");
        }
        const body = await request.json();
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new ApiError(400, "INVALID_REQUEST", "O formato da solicitação não é válido.");
        }
        const result = await handleAction(body as Record<string, unknown>, request);
        return json(result, 200, origin);
    } catch (error) {
        if (error instanceof ApiError) {
            return json({ error: { code: error.code, message: error.message } }, error.status, origin);
        }
        console.error("Cine Resenha cloud account service error:", error);
        return json({
            error: { code: "SERVER_ERROR", message: "O servidor online não conseguiu concluir a solicitação." },
        }, 500, origin);
    }
});

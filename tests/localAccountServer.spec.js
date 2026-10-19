const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createLocalAccountServer } = require('../desktop/local-account-server.cjs');
const { afterEach, beforeEach, describe, expect, it } = require('@jest/globals');

describe('local account server', () => {
    let dataDirectory;
    let server;
    let baseUrl;
    let adminToken;

    const request = async (action, values = {}) => {
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...values }),
        });
        return { status: response.status, body: await response.json() };
    };

    beforeEach(async () => {
        dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'cine-resenha-local-'));
        const passwordSalt = crypto.randomBytes(16).toString('hex');
        const passwordHash = crypto.scryptSync('test-admin-password', passwordSalt, 64).toString('hex');
        await fs.writeFile(path.join(dataDirectory, 'admin.json'), JSON.stringify({
            username: 'local-admin',
            passwordSalt,
            passwordHash,
        }));

        server = createLocalAccountServer({
            dataDirectory,
            configPath: path.join(dataDirectory, 'admin.json'),
            host: '127.0.0.1',
            port: 0,
        });
        await server.start();
        baseUrl = `http://127.0.0.1:${server.server.address().port}/api`;
        const login = await request('adminLogin', { username: 'local-admin', password: 'test-admin-password' });
        expect(login.status).toBe(200);
        adminToken = login.body.token;
    });

    afterEach(async () => {
        await server.close();
        await fs.rm(dataDirectory, { recursive: true, force: true });
    });

    it('creates accounts, validates user sessions, and persists only password hashes', async () => {
        const created = await request('adminCreate', {
            token: adminToken,
            username: 'cliente.teste',
            password: 'senha-escolhida',
            duration: '30d',
        });
        expect(created.status).toBe(200);
        expect(created.body.account.username).toBe('cliente.teste');
        expect(created.body.temporaryPassword).toBeUndefined();

        const persisted = await fs.readFile(path.join(dataDirectory, 'accounts.json'), 'utf8');
        expect(persisted).not.toContain('senha-escolhida');

        const userLogin = await request('login', {
            username: 'CLIENTE.TESTE',
            password: 'senha-escolhida',
        });
        expect(userLogin.status).toBe(200);

        const session = await request('session', {
            accessToken: userLogin.body.session.accessToken,
        });
        expect(session.status).toBe(200);
        expect(session.body.account.username).toBe('cliente.teste');

        const suspended = await request('adminUpdate', {
            token: adminToken,
            id: created.body.account.id,
            updateAction: 'suspend',
        });
        expect(suspended.status).toBe(200);
        const revoked = await request('session', {
            accessToken: userLogin.body.session.accessToken,
        });
        expect(revoked.body.error.code).toBe('INVALID_SESSION');
    });

    it('stores the global add-ons tab setting for public clients', async () => {
        expect((await request('appSettings')).body).toMatchObject({
            addonsTabVisible: false,
            maintenanceEnabled: false,
            maintenanceMessage: '',
        });
        const updated = await request('adminUpdateAppSettings', {
            token: adminToken,
            addonsTabVisible: true,
        });
        expect(updated.body.addonsTabVisible).toBe(true);
        expect((await request('appSettings')).body.addonsTabVisible).toBe(true);

        const maintenance = await request('adminUpdateAppSettings', {
            token: adminToken,
            maintenanceEnabled: true,
            maintenanceMessage: 'Voltamos logo.',
        });
        expect(maintenance.body.maintenanceEnabled).toBe(true);
        expect((await request('appSettings')).body.maintenanceMessage).toBe('Voltamos logo.');
    });

    it('allows recreating a username after its account is deleted', async () => {
        const first = await request('adminCreate', {
            token: adminToken,
            username: 'reusable.user',
            password: 'chosen-password',
            duration: '30d',
        });
        expect(first.status).toBe(200);

        const deleted = await request('adminUpdate', {
            token: adminToken,
            id: first.body.account.id,
            updateAction: 'delete',
        });
        expect(deleted.status).toBe(200);
        expect((await request('adminList', { token: adminToken })).body.accounts).toHaveLength(0);

        const recreated = await request('adminCreate', {
            token: adminToken,
            username: 'reusable.user',
            password: 'chosen-password',
            duration: '30d',
        });
        expect(recreated.status).toBe(200);
        expect(recreated.body.account.username).toBe('reusable.user');
    });

    it('sets an account password chosen by the admin and requires a chosen password on reset', async () => {
        const created = await request('adminCreate', {
            token: adminToken,
            username: 'password.user',
            password: 'initial-password',
            duration: '30:days',
        });
        expect(created.status).toBe(200);
        expect((await request('login', {
            username: 'password.user',
            password: 'initial-password',
        })).status).toBe(200);

        const invalidReset = await request('adminUpdate', {
            token: adminToken,
            id: created.body.account.id,
            updateAction: 'resetPassword',
        });
        expect(invalidReset.status).toBe(400);

        const reset = await request('adminUpdate', {
            token: adminToken,
            id: created.body.account.id,
            updateAction: 'resetPassword',
            password: 'new-chosen-password',
        });
        expect(reset.status).toBe(200);
        expect(reset.body.temporaryPassword).toBeUndefined();
        expect((await request('login', {
            username: 'password.user',
            password: 'new-chosen-password',
        })).status).toBe(200);
        expect((await request('login', {
            username: 'password.user',
            password: 'initial-password',
        })).status).toBe(401);
    });

    it.each([
        ['week', 7 * 86_400_000],
        ['30d', 30 * 86_400_000],
        ['90d', 90 * 86_400_000],
    ])('sets the selected %s account duration', async (duration, expectedMilliseconds) => {
        const result = await request('adminCreate', {
            token: adminToken,
            username: `duration.${duration}`,
            password: 'duration-password',
            duration,
        });

        expect(result.status).toBe(200);
        const actualMilliseconds = new Date(result.body.account.expiresAt).getTime() -
            new Date(result.body.account.createdAt).getTime();
        expect(Math.abs(actualMilliseconds - expectedMilliseconds)).toBeLessThan(2_000);
    });

    it.each([
        ['6m', 6],
        ['1y', 12],
    ])('sets the selected %s calendar duration', async (duration, months) => {
        const result = await request('adminCreate', {
            token: adminToken,
            username: `duration.${duration}`,
            password: 'duration-password',
            duration,
        });
        const expectedExpiry = new Date(result.body.account.createdAt);
        const day = expectedExpiry.getUTCDate();
        expectedExpiry.setUTCDate(1);
        expectedExpiry.setUTCMonth(expectedExpiry.getUTCMonth() + months);
        const lastDay = new Date(Date.UTC(
            expectedExpiry.getUTCFullYear(),
            expectedExpiry.getUTCMonth() + 1,
            0,
        )).getUTCDate();
        expectedExpiry.setUTCDate(Math.min(day, lastDay));

        expect(result.status).toBe(200);
        expect(Math.abs(new Date(result.body.account.expiresAt).getTime() - expectedExpiry.getTime())).toBeLessThan(2_000);
    });

    it.each([
        ['5:minutes', 5 * 60_000],
        ['01:minutes', 60_000],
        ['2:hours', 2 * 3_600_000],
    ])('sets a custom %s account duration', async (duration, expectedMilliseconds) => {
        const result = await request('adminCreate', {
            token: adminToken,
            username: `custom.${duration.split(':')[0]}.${duration.split(':')[1]}`,
            password: 'duration-password',
            duration,
        });
        const actualMilliseconds = new Date(result.body.account.expiresAt).getTime() -
            new Date(result.body.account.createdAt).getTime();

        expect(result.status).toBe(200);
        expect(Math.abs(actualMilliseconds - expectedMilliseconds)).toBeLessThan(2_000);
    });

    it('renews an account by the selected custom duration', async () => {
        const created = await request('adminCreate', {
            token: adminToken,
            username: 'renew.custom',
            password: 'renew-password',
            duration: '1:minutes',
        });
        const renewed = await request('adminUpdate', {
            token: adminToken,
            id: created.body.account.id,
            updateAction: 'renew',
            duration: '2:hours',
        });
        const extension = new Date(renewed.body.account.expiresAt).getTime() -
            new Date(created.body.account.expiresAt).getTime();

        expect(renewed.status).toBe(200);
        expect(Math.abs(extension - 2 * 3_600_000)).toBeLessThan(2_000);
    });

    it('allows the admin desktop origin to call the local account service', async () => {
        const response = await fetch(baseUrl, {
            method: 'OPTIONS',
            headers: {
                Origin: 'http://127.0.0.1:32150',
                'Access-Control-Request-Method': 'POST',
            },
        });

        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:32150');
    });

    it('allows the fallback desktop origin to call the local account service', async () => {
        const response = await fetch(baseUrl, {
            method: 'OPTIONS',
            headers: {
                Origin: 'http://127.0.0.1:32153',
                'Access-Control-Request-Method': 'POST',
            },
        });

        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:32153');
    });

    it('allows first-run local admin setup and stores a password hash', async () => {
        await fs.rm(path.join(dataDirectory, 'admin.json'));
        expect((await request('adminStatus')).body.configured).toBe(false);

        const setup = await request('adminSetup', {
            username: 'first-admin',
            password: 'first-run-test-password',
        });
        expect(setup.status).toBe(200);
        expect(setup.body.configured).toBe(true);

        const savedAdmin = await fs.readFile(path.join(dataDirectory, 'admin.json'), 'utf8');
        expect(savedAdmin).not.toContain('first-run-test-password');
        expect((await request('adminStatus')).body.configured).toBe(true);
        expect((await request('adminLogin', {
            username: 'first-admin',
            password: 'first-run-test-password',
        })).status).toBe(200);
    });
});

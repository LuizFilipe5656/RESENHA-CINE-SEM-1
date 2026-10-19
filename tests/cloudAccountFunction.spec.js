const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const ts = require('typescript');
const { beforeEach, describe, expect, it } = require('@jest/globals');

describe('Supabase cloud account function', () => {
    let handler;
    let tables;
    let environment;

    const makeDbResponse = (rows, status = 200) => new Response(
        status === 204 ? null : JSON.stringify(rows),
        { status, headers: { 'Content-Type': 'application/json' } },
    );

    const matches = (row, key, filter) => {
        if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
        if (filter === 'not.is.null') return row[key] !== null && row[key] !== undefined;
        if (filter.startsWith('lt.')) return new Date(row[key]) < new Date(filter.slice(3));
        if (filter.startsWith('gt.')) return new Date(row[key]) > new Date(filter.slice(3));
        return false;
    };

    const mockDatabaseFetch = async (input, init = {}) => {
        const url = new URL(input);
        const table = url.pathname.split('/').pop();
        const rows = tables[table] || [];
        const method = init.method || 'GET';
        const query = Object.fromEntries(url.searchParams);

        if (!['accounts', 'admin_credentials', 'api_sessions', 'app_settings', 'app_announcements', 'login_attempts'].includes(table)) {
            return makeDbResponse({ message: 'relation does not exist' }, 404);
        }

        if (method === 'GET') {
            let selected = rows.filter((row) => Object.entries(query)
                .filter(([key]) => !['select', 'limit', 'order'].includes(key))
                .every(([key, filter]) => matches(row, key, filter)));
            if (query.order) {
                const [key, direction] = query.order.split('.');
                selected = selected.sort((left, right) => direction === 'desc' ?
                    String(right[key]).localeCompare(String(left[key])) :
                    String(left[key]).localeCompare(String(right[key])));
            }
            if (query.limit) selected = selected.slice(0, Number(query.limit));
            if (query.select && query.select !== '*') {
                const selectedColumns = query.select.split(',');
                selected = selected.map((row) => Object.fromEntries(
                    selectedColumns.filter((column) => column in row).map((column) => [column, row[column]]),
                ));
            }
            return makeDbResponse(selected);
        }

        if (method === 'POST') {
            const record = JSON.parse(init.body);
            if (table === 'login_attempts' && init.headers.Prefer?.includes('resolution=merge-duplicates')) {
                const existing = rows.find((row) => row.attempt_key === record.attempt_key);
                if (existing) Object.assign(existing, record);
                else rows.push(record);
                return makeDbResponse(undefined, 204);
            }
            if ((table === 'accounts' && rows.some((row) => row.username === record.username)) ||
                (table === 'admin_credentials' && rows.length > 0)) {
                return makeDbResponse({ code: '23505', message: 'duplicate key' }, 409);
            }
            if (table === 'accounts') {
                record.id = `account-${rows.length + 1}`;
            }
            if (table === 'admin_credentials') {
                record.id = 'admin-1';
            }
            if (table === 'app_settings') {
                record.singleton = true;
            }
            if (table === 'app_announcements') {
                record.id = webcrypto.randomUUID();
                record.updated_at = new Date().toISOString();
                record.created_at = record.updated_at;
            }
            rows.push(record);
            return init.headers.Prefer?.includes('return=representation') ?
                makeDbResponse([record]) :
                makeDbResponse(undefined, 204);
        }

        const selected = rows.filter((row) => Object.entries(query)
            .filter(([key]) => !['select'].includes(key))
            .every(([key, filter]) => matches(row, key, filter)));
        if (method === 'PATCH') {
            const changes = JSON.parse(init.body);
            if (table === 'accounts' && changes.username &&
                rows.some((row) => row.username === changes.username && !selected.includes(row))) {
                return makeDbResponse({ code: '23505', message: 'duplicate key' }, 409);
            }
            selected.forEach((row) => Object.assign(row, changes));
            return init.headers.Prefer?.includes('return=representation') ?
                makeDbResponse(selected) :
                makeDbResponse(undefined, 204);
        }
        if (method === 'DELETE') {
            tables[table] = rows.filter((row) => !selected.includes(row));
            if (table === 'accounts') {
                const ids = new Set(selected.map((row) => row.id));
                tables.api_sessions = tables.api_sessions.filter((row) => !ids.has(row.account_id));
            }
            return makeDbResponse(undefined, 204);
        }
        return makeDbResponse({ message: 'method not allowed' }, 405);
    };

    const call = async (body, headers = {}, origin = 'http://127.0.0.1:32150') => {
        const request = new Request('https://cloud.example/functions/v1/cine-api', {
            method: 'POST',
            headers: {
                Origin: origin,
                'Content-Type': 'application/json',
                apikey: 'test-anon-key',
                ...headers,
            },
            body: JSON.stringify(body),
        });
        const response = await handler(request);
        return { status: response.status, body: await response.json() };
    };

    const preflight = async (origin) => handler(new Request('https://cloud.example/functions/v1/cine-api', {
        method: 'OPTIONS',
        headers: { Origin: origin },
    }));

    beforeEach(() => {
        environment = {
            SUPABASE_URL: 'https://cloud.example',
            SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
            CINE_ADMIN_SETUP_KEY: 'safe-one-time-setup-key',
        };
        tables = {
            accounts: [],
            admin_credentials: [],
            api_sessions: [],
            app_settings: [{ singleton: true, addons_tab_visible: false }],
            app_announcements: [],
            login_attempts: [],
        };
        const deno = {
            env: {
                get: (name) => environment[name],
            },
            serve: (callback) => {
                handler = callback;
            },
        };

        const sourcePath = path.join(__dirname, '..', 'supabase', 'functions', 'cine-api', 'index.ts');
        const source = fs.readFileSync(sourcePath, 'utf8');
        const compiled = ts.transpileModule(source, {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
            },
        }).outputText;
        vm.runInNewContext(compiled, {
            Deno: deno,
            fetch: mockDatabaseFetch,
            crypto: webcrypto,
            Request,
            Response,
            Headers,
            URL,
            TextEncoder,
            TextDecoder,
            btoa,
            atob,
            console,
        }, { filename: sourcePath });
    });

    it('requires the one-time setup key and secures the first admin account', async () => {
        expect((await call({ action: 'adminStatus' })).body.configured).toBe(false);
        expect((await call({
            action: 'adminSetup',
            username: 'cloud-admin',
            password: 'a-strong-admin-password',
        }, { 'x-cine-setup-key': 'wrong-key' })).status).toBe(403);

        const setup = await call({
            action: 'adminSetup',
            username: 'cloud-admin',
            password: 'a-strong-admin-password',
        }, { 'x-cine-setup-key': 'safe-one-time-setup-key' });

        expect(setup.status).toBe(200);
        expect(tables.admin_credentials[0].password_hash).not.toBe('a-strong-admin-password');
        expect((await call({ action: 'adminStatus' })).body.configured).toBe(true);
    });

    it('revokes an admin session when the admin logs out', async () => {
        await call({
            action: 'adminSetup',
            username: 'logout-admin',
            password: 'a-strong-admin-password',
        }, { 'x-cine-setup-key': 'safe-one-time-setup-key' });
        const admin = await call({
            action: 'adminLogin',
            username: 'logout-admin',
            password: 'a-strong-admin-password',
        });
        expect(admin.status).toBe(200);

        const loggedOut = await call({ action: 'logout', accessToken: admin.body.token });
        expect(loggedOut.status).toBe(200);
        expect((await call({ action: 'adminList', token: admin.body.token })).status).toBe(401);
    });

    it('does not allow account creation with the setup key outside the admin panel', async () => {
        const response = await call({
            action: 'keyCreateAccount',
            username: 'wrong.key',
            password: 'user-password-1',
        }, { 'x-cine-setup-key': 'wrong-key' });
        expect(response.status).toBe(401);
        expect(tables.accounts).toHaveLength(0);
        expect(tables.admin_credentials).toHaveLength(0);
    });

    it('returns administrator and user accounts with separate role labels and session counts', async () => {
        await call({
            action: 'adminSetup',
            username: 'role-admin',
            password: 'a-strong-admin-password',
        }, { 'x-cine-setup-key': 'safe-one-time-setup-key' });
        const admin = await call({
            action: 'adminLogin',
            username: 'role-admin',
            password: 'a-strong-admin-password',
        });
        const created = await call({
            action: 'adminCreate',
            token: admin.body.token,
            username: 'role.user',
            password: 'chosen-user-password',
            duration: '30:days',
        });
        await call({
            action: 'login',
            username: 'role.user',
            password: 'chosen-user-password',
        });

        const listed = await call({ action: 'adminList', token: admin.body.token });
        expect(listed.status).toBe(200);
        expect(listed.body.accounts).toEqual(expect.arrayContaining([
            expect.objectContaining({ username: 'role-admin', role: 'admin', activeSessions: 1 }),
            expect.objectContaining({ username: 'role.user', role: 'user', activeSessions: 1 }),
        ]));
        expect(listed.body.accounts.find(({ id }) => id === created.body.account.id).role).toBe('user');
    });

    it('allows panel admins to create panel admins which remain usable in the app', async () => {
        await call({
            action: 'adminSetup',
            username: 'jhow',
            password: 'a-strong-admin-password',
        }, { 'x-cine-setup-key': 'safe-one-time-setup-key' });
        const root = await call({
            action: 'adminLogin',
            username: 'jhow',
            password: 'a-strong-admin-password',
        });
        expect(root.body.canCreateAdmin).toBe(true);

        const createdAdmin = await call({
            action: 'adminCreate',
            token: root.body.token,
            username: 'panel.admin',
            password: 'panel-admin-password',
            isAdmin: true,
        });
        expect(createdAdmin.status).toBe(200);
        expect(createdAdmin.body.account.role).toBe('admin');
        expect(createdAdmin.body.account.expiresAt).toBeNull();

        const appLogin = await call({
            action: 'login',
            username: 'panel.admin',
            password: 'panel-admin-password',
        });
        expect(appLogin.status).toBe(200);
        expect((await call({
            action: 'session',
            accessToken: appLogin.body.session.accessToken,
        })).body.account.username).toBe('panel.admin');

        const panelLogin = await call({
            action: 'adminLogin',
            username: 'panel.admin',
            password: 'panel-admin-password',
        });
        expect(panelLogin.status).toBe(200);
        expect(panelLogin.body.canCreateAdmin).toBe(false);
        expect((await call({
            action: 'adminSession',
            token: panelLogin.body.token,
        })).body.canCreateAdmin).toBe(false);

        const secondAdmin = await call({
            action: 'adminCreate',
            token: panelLogin.body.token,
            username: 'another.admin',
            password: 'another-admin-password',
            isAdmin: true,
        });
        expect(secondAdmin.status).toBe(200);
        expect(secondAdmin.body.account).toMatchObject({ role: 'admin', expiresAt: null });
        expect((await call({
            action: 'adminCreate',
            token: panelLogin.body.token,
            username: 'regular.user',
            password: 'regular-user-password',
            duration: '30:days',
        })).status).toBe(200);
        expect((await call({
            action: 'adminList',
            token: panelLogin.body.token,
        })).body.accounts).toEqual(expect.arrayContaining([
            expect.objectContaining({ username: 'panel.admin', role: 'admin' }),
            expect.objectContaining({ username: 'regular.user', role: 'user' }),
        ]));
    });

    it('lets the main admin use the app and manage panel admin accounts', async () => {
        await call({
            action: 'adminSetup',
            username: 'jhow',
            password: 'a-strong-admin-password',
        }, { 'x-cine-setup-key': 'safe-one-time-setup-key' });
        const rootAppLogin = await call({
            action: 'login',
            username: 'jhow',
            password: 'a-strong-admin-password',
        });
        expect(rootAppLogin.status).toBe(200);
        expect(rootAppLogin.body.account).toMatchObject({
            username: 'jhow',
            role: 'admin',
            expiresAt: null,
        });
        expect((await call({
            action: 'session',
            accessToken: rootAppLogin.body.session.accessToken,
        })).body.account.username).toBe('jhow');

        const rootPanelLogin = await call({
            action: 'adminLogin',
            username: 'jhow',
            password: 'a-strong-admin-password',
        });
        const createdAdmin = await call({
            action: 'adminCreate',
            token: rootPanelLogin.body.token,
            username: 'managed.admin',
            password: 'initial-admin-password',
            isAdmin: true,
        });
        expect(createdAdmin.status).toBe(200);
        const otherAdminLogin = await call({
            action: 'adminLogin',
            username: 'managed.admin',
            password: 'initial-admin-password',
        });
        expect(otherAdminLogin.status).toBe(200);

        const changedPassword = await call({
            action: 'adminUpdate',
            token: rootPanelLogin.body.token,
            id: createdAdmin.body.account.id,
            updateAction: 'resetPassword',
            password: 'replacement-admin-password',
        });
        expect(changedPassword.status).toBe(200);
        expect((await call({
            action: 'adminLogin',
            username: 'managed.admin',
            password: 'initial-admin-password',
        })).status).toBe(401);
        expect((await call({
            action: 'login',
            username: 'managed.admin',
            password: 'replacement-admin-password',
        })).body.account.role).toBe('admin');

        const updatedAdminLogin = await call({
            action: 'adminLogin',
            username: 'managed.admin',
            password: 'replacement-admin-password',
        });
        expect(updatedAdminLogin.status).toBe(200);
        expect((await call({
            action: 'adminUpdate',
            token: updatedAdminLogin.body.token,
            id: createdAdmin.body.account.id,
            updateAction: 'resetPassword',
            password: 'unauthorized-password',
        })).status).toBe(403);
    });

    it('allows the app preview origin and rejects unlisted origins', async () => {
        const allowed = await preflight('http://127.0.0.1:32153');
        expect(allowed.status).toBe(204);
        expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:32153');

        const denied = await preflight('http://127.0.0.1:32154');
        expect(denied.status).toBe(403);
    });

    it('lets an admin enable maintenance and publishes the message to app clients', async () => {
        await call({
            action: 'adminSetup',
            username: 'maintenance-admin',
            password: 'a-strong-admin-password',
        }, { 'x-cine-setup-key': 'safe-one-time-setup-key' });
        const admin = await call({
            action: 'adminLogin',
            username: 'maintenance-admin',
            password: 'a-strong-admin-password',
        });

        const enabled = await call({
            action: 'adminUpdateAppSettings',
            token: admin.body.token,
            maintenanceEnabled: true,
            maintenanceMessage: 'Voltamos em breve.',
        });
        expect(enabled.status).toBe(200);
        expect(enabled.body.maintenanceEnabled).toBe(true);
        expect(enabled.body.maintenanceMessage).toBe('Voltamos em breve.');
        expect((await call({ action: 'appSettings' })).body).toMatchObject({
            maintenanceEnabled: true,
            maintenanceMessage: 'Voltamos em breve.',
        });

        const disabled = await call({
            action: 'adminUpdateAppSettings',
            token: admin.body.token,
            maintenanceEnabled: false,
        });
        expect(disabled.body.maintenanceEnabled).toBe(false);
        expect((await call({ action: 'appSettings' })).body.maintenanceEnabled).toBe(false);
    });

    it('lets an admin create, edit and delete app announcements', async () => {
        await call({
            action: 'adminSetup',
            username: 'announcement-admin',
            password: 'a-strong-admin-password',
        }, { 'x-cine-setup-key': 'safe-one-time-setup-key' });
        const admin = await call({
            action: 'adminLogin',
            username: 'announcement-admin',
            password: 'a-strong-admin-password',
        });

        const created = await call({
            action: 'adminCreateAnnouncement',
            token: admin.body.token,
            message: 'Mensagem inicial',
        });
        expect(created.status).toBe(200);
        expect(created.body.announcement.message).toBe('Mensagem inicial');
        expect((await call({ action: 'appSettings' })).body.announcements).toEqual([
            created.body.announcement,
        ]);

        const edited = await call({
            action: 'adminUpdateAnnouncement',
            token: admin.body.token,
            id: created.body.announcement.id,
            message: 'Mensagem editada',
        });
        expect(edited.status).toBe(200);
        expect(edited.body.announcement.message).toBe('Mensagem editada');
        expect(edited.body.announcement.updatedAt).not.toBe(created.body.announcement.updatedAt);
        expect((await call({ action: 'appSettings' })).body.announcements[0].message).toBe('Mensagem editada');

        const deleted = await call({
            action: 'adminDeleteAnnouncement',
            token: admin.body.token,
            id: created.body.announcement.id,
        });
        expect(deleted.status).toBe(200);
        expect((await call({ action: 'appSettings' })).body.announcements).toEqual([]);
    });

    it('silently disables legacy client update checks', async () => {
        expect(await call({ action: 'appUpdateCheck', currentVersion: '1.0.8' })).toMatchObject({
            status: 200,
            body: { updateAvailable: false },
        });
    });

    it('creates expiring user accounts, validates sessions, and allows username reuse after deletion', async () => {
        await call({
            action: 'adminSetup',
            username: 'cloud-admin',
            password: 'a-strong-admin-password',
        }, { 'x-cine-setup-key': 'safe-one-time-setup-key' });
        const adminLogin = await call({
            action: 'adminLogin',
            username: 'cloud-admin',
            password: 'a-strong-admin-password',
        });
        expect(adminLogin.status).toBe(200);

        const created = await call({
            action: 'adminCreate',
            token: adminLogin.body.token,
            username: 'remote.user',
            password: 'chosen-cloud-password',
            duration: '90:days',
        });
        expect(created.status).toBe(200);
        expect(created.body.temporaryPassword).toBeUndefined();
        expect(created.body.account.expiresAt).not.toBeNull();
        expect(new Date(created.body.account.expiresAt).getTime())
            .toBeGreaterThan(new Date(created.body.account.createdAt).getTime());
        expect(tables.accounts[0].password_hash).not.toBe('chosen-cloud-password');

        const login = await call({
            action: 'login',
            username: 'remote.user',
            password: 'chosen-cloud-password',
        });
        expect(login.status).toBe(200);
        expect((await call({
            action: 'session',
            accessToken: login.body.session.accessToken,
        })).body.account.username).toBe('remote.user');

        expect((await call({
            action: 'adminUpdate',
            token: adminLogin.body.token,
            id: created.body.account.id,
            updateAction: 'delete',
        })).status).toBe(200);
        expect((await call({
            action: 'adminCreate',
            token: adminLogin.body.token,
            username: 'remote.user',
            password: 'recreated-cloud-password',
            duration: '30:days',
        })).status).toBe(200);
    });

    it('lets admins monitor sessions and manage usernames, passwords, and account access', async () => {
        await call({
            action: 'adminSetup',
            username: 'manage-admin',
            password: 'a-strong-admin-password',
        }, { 'x-cine-setup-key': 'safe-one-time-setup-key' });
        const admin = await call({
            action: 'adminLogin',
            username: 'manage-admin',
            password: 'a-strong-admin-password',
        });
        const created = await call({
            action: 'adminCreate',
            token: admin.body.token,
            username: 'managed.user',
            password: 'chosen-user-password',
            duration: '30:days',
        });
        const firstLogin = await call({
            action: 'login',
            username: 'managed.user',
            password: 'chosen-user-password',
        });

        const listed = await call({ action: 'adminList', token: admin.body.token });
        expect(listed.body.accounts.find(({ id }) => id === created.body.account.id)).toMatchObject({
            username: 'managed.user',
            activeSessions: 1,
        });
        expect(listed.body.accounts.find(({ id }) => id === created.body.account.id).expiresAt).not.toBeNull();

        const renamed = await call({
            action: 'adminUpdate',
            token: admin.body.token,
            id: created.body.account.id,
            updateAction: 'updateUsername',
            username: 'renamed.user',
        });
        expect(renamed.status).toBe(200);
        expect(renamed.body.account.username).toBe('renamed.user');

        const changedPassword = await call({
            action: 'adminUpdate',
            token: admin.body.token,
            id: created.body.account.id,
            updateAction: 'resetPassword',
            password: 'new-user-password',
        });
        expect(changedPassword.status).toBe(200);
        expect((await call({
            action: 'session',
            accessToken: firstLogin.body.session.accessToken,
        })).status).toBe(401);
        expect((await call({
            action: 'login',
            username: 'renamed.user',
            password: 'new-user-password',
        })).status).toBe(200);

        const secondLogin = await call({
            action: 'login',
            username: 'renamed.user',
            password: 'new-user-password',
        });
        expect((await call({
            action: 'adminUpdate',
            token: admin.body.token,
            id: created.body.account.id,
            updateAction: 'logoutSessions',
        })).body.success).toBe(true);
        expect((await call({
            action: 'session',
            accessToken: secondLogin.body.session.accessToken,
        })).status).toBe(401);
        const refreshedAccounts = (await call({ action: 'adminList', token: admin.body.token })).body.accounts;
        expect(refreshedAccounts.find(({ id }) => id === created.body.account.id).activeSessions).toBe(0);

        expect((await call({
            action: 'adminUpdate',
            token: admin.body.token,
            id: created.body.account.id,
            updateAction: 'suspend',
        })).status).toBe(200);
        expect((await call({
            action: 'login',
            username: 'renamed.user',
            password: 'new-user-password',
        })).status).toBe(403);
        expect((await call({
            action: 'adminUpdate',
            token: admin.body.token,
            id: created.body.account.id,
            updateAction: 'activate',
        })).status).toBe(200);
    });

    it('requires validity for regular accounts and gives admin accounts permanent access', async () => {
        await call({
            action: 'adminSetup',
            username: 'cloud-admin',
            password: 'a-strong-admin-password',
        }, { 'x-cine-setup-key': 'safe-one-time-setup-key' });
        const adminLogin = await call({
            action: 'adminLogin',
            username: 'cloud-admin',
            password: 'a-strong-admin-password',
        });
        const created = await call({
            action: 'adminCreate',
            token: adminLogin.body.token,
            username: 'minute.user',
            password: 'chosen-minute-password',
        });
        expect(created.status).toBe(400);

        const regularUser = await call({
            action: 'adminCreate',
            token: adminLogin.body.token,
            username: 'valid.user',
            password: 'chosen-minute-password',
            duration: '30:days',
        });
        expect(regularUser.status).toBe(200);
        expect(regularUser.body.account.expiresAt).not.toBeNull();

        expect((await call({
            action: 'login',
            username: 'valid.user',
            password: 'chosen-minute-password',
        })).status).toBe(200);
    });

});

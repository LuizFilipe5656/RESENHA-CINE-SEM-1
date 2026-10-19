import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    adminCreateAccount,
    adminCreateAnnouncement,
    adminDeleteAnnouncement,
    adminGetAppSettings,
    adminListAccounts,
    adminLogin,
    adminRevokeSession,
    adminSetup,
    adminStatus,
    adminValidateSession,
    adminUpdateAppSettings,
    adminUpdateAnnouncement,
    adminUpdateAccount,
    CineAppSettings,
    SubscriptionAccount,
} from '../auth/api';
import styles from './AdminApp.less';

const ADMIN_SESSION_KEY = 'cine-resenha-admin-session';
const DURATION_UNITS = [
    { value: 'days', label: 'dias', max: 36_525 },
    { value: 'weeks', label: 'semanas', max: 5_218 },
    { value: 'months', label: 'meses', max: 1_200 },
    { value: 'years', label: 'anos', max: 100 },
];
const accountDuration = (amount: string, unit: string) => `${amount}:${unit}`;

type AdminSession = {
    token: string,
    expiresAt: number,
    username: string,
    canCreateAdmin: boolean,
};

type CreatedCredentials = {
    username: string,
    password: string,
    expiresAt?: string | null,
    isAdmin?: boolean,
};

const formatDate = (value: string) => new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
}).format(new Date(value));

const AdminLogin = ({ onLogin, initialError }: {
    onLogin: (username: string, password: string, rememberPassword: boolean) => Promise<void>,
    initialError: string,
}) => {
    const { t } = useTranslation();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(initialError);
    const [loading, setLoading] = useState(false);
    const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
    const [setupKey, setSetupKey] = useState('');
    const [rememberPassword, setRememberPassword] = useState(false);
    const [credentialStorageAvailable, setCredentialStorageAvailable] = useState(false);

    useEffect(() => {
        let mounted = true;
        void adminStatus().then((result) => {
            if (mounted) setSetupRequired(!result.configured);
        }).catch((statusError) => {
            if (mounted) {
                setSetupRequired(false);
                setError(statusError instanceof Error ? statusError.message : 'Não foi possível conectar ao servidor online.');
            }
        });
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (setupRequired !== false) return undefined;
        const bridge = window.cineResenhaWindow;
        if (!bridge) return undefined;

        let mounted = true;
        void Promise.all([
            bridge.isCredentialStorageAvailable(),
            bridge.getRememberedAdminCredentials(),
        ]).then(([available, credentials]) => {
            if (!mounted) return;
            setCredentialStorageAvailable(available);
            if (available && credentials) {
                setUsername(credentials.username);
                setPassword(credentials.password);
                setRememberPassword(true);
            }
        }).catch((storageError) => {
            console.error('Could not load remembered admin credentials:', storageError);
            if (mounted) setError('Não foi possível carregar as credenciais lembradas com segurança.');
        });
        return () => {
            mounted = false;
        };
    }, [setupRequired]);

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        setError('');
        try {
            if (setupRequired) {
                await adminSetup(username.trim(), password, setupKey);
            }
            await onLogin(username.trim(), password, rememberPassword && !setupRequired);
        } catch (loginError) {
            setError(loginError instanceof Error ? loginError.message : 'Não foi possível entrar no painel.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className={styles['admin-login-page']}>
            <section className={styles['admin-login-card']}>
                <Brand />
                <div className={styles['login-heading']}>
                    <span className={styles['eyebrow']}>{setupRequired ?
                        t('CINE_ADMIN_SETUP_EYEBROW', { defaultValue: 'CONFIGURAÇÃO INICIAL' }) :
                        t('CINE_ADMIN_RESTRICTED', { defaultValue: 'ÁREA RESTRITA' })}</span>
                    <h1>{setupRequired ?
                        t('CINE_ADMIN_SETUP_TITLE', { defaultValue: 'Criar acesso administrador' }) :
                        t('CINE_ADMIN_PANEL_TITLE', { defaultValue: 'Painel de administração' })}</h1>
                    <p>{setupRequired ?
                        t('CINE_ADMIN_SETUP_SUBTITLE', { defaultValue: 'Primeiro acesso: escolha o usuário e a senha do administrador e informe a chave de configuração criada no Supabase.' }) :
                        t('CINE_ADMIN_PANEL_SUBTITLE', { defaultValue: 'Entre para gerenciar contas e assinaturas.' })}</p>
                </div>
                <form className={styles['admin-form']} onSubmit={onSubmit}>
                    <label>
                        <span>{t('CINE_ADMIN_USERNAME', { defaultValue: 'Usuário administrador' })}</span>
                        <input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} />
                    </label>
                    <label>
                        <span>{t('CINE_PASSWORD', { defaultValue: 'Senha' })}</span>
                        <input type="password" autoComplete="current-password" required minLength={setupRequired ? 12 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} />
                    </label>
                    {!setupRequired && credentialStorageAvailable && (
                        <label className={styles['remember-password']}>
                            <input
                                type="checkbox"
                                checked={rememberPassword}
                                onChange={(event) => setRememberPassword(event.target.checked)}
                            />
                            <span>{t('CINE_ADMIN_REMEMBER_PASSWORD', { defaultValue: 'Lembrar senha neste computador' })}</span>
                        </label>
                    )}
                    {setupRequired && (
                        <label>
                            <span>{t('CINE_ADMIN_SETUP_KEY', { defaultValue: 'Chave de configuração do Supabase' })}</span>
                            <input type="password" autoComplete="off" required value={setupKey} onChange={(event) => setSetupKey(event.target.value)} />
                        </label>
                    )}
                    {(error || initialError) && <div className={styles['alert-error']} role="alert">{error || initialError}</div>}
                    <button className={styles['primary-button']} type="submit" disabled={loading || setupRequired === null}>
                        {loading ? t('CINE_CHECKING_ACCESS', { defaultValue: 'Verificando…' }) : setupRequired ?
                            t('CINE_ADMIN_SETUP_SUBMIT', { defaultValue: 'Criar administrador e entrar' }) :
                            t('CINE_ADMIN_LOGIN_SUBMIT', { defaultValue: 'Entrar no painel' })}
                        <span aria-hidden={true}>→</span>
                    </button>
                </form>
                <div className={styles['login-footnote']}>{t('CINE_ADMIN_CREDENTIALS_NOTE', { defaultValue: 'As credenciais de administrador são configuradas somente no servidor.' })}</div>
            </section>
        </main>
    );
};

const Brand = () => {
    const { t } = useTranslation();
    return (
        <div className={styles['admin-brand']}>
            <div className={styles['brand-icon']}><img src={require('/assets/icon.png')} alt="" /></div>
            <div>
                <div className={styles['brand-title']}>{t('CINE_BRAND', { defaultValue: 'CINE RESENHA' })}</div>
                <div className={styles['brand-subtitle']}>{t('CINE_ADMIN_BRAND_SUBTITLE', { defaultValue: 'PAINEL DE ADMIN SECO' })}</div>
            </div>
        </div>
    );
};

const AdminApp = () => {
    const { t } = useTranslation();
    const [session, setSession] = useState<AdminSession | null>(null);
    const [accounts, setAccounts] = useState<SubscriptionAccount[]>([]);
    const [accountTab, setAccountTab] = useState<'user' | 'admin'>('user');
    const [appSettings, setAppSettings] = useState<CineAppSettings>({
        addonsTabVisible: false,
        maintenanceEnabled: false,
        maintenanceMessage: '',
        announcements: [],
    });
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [pageError, setPageError] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [createAdminAccess, setCreateAdminAccess] = useState(false);
    const [durationAmount, setDurationAmount] = useState('30');
    const [durationUnit, setDurationUnit] = useState('days');
    const [newCredentials, setNewCredentials] = useState<CreatedCredentials | null>(null);
    const [copied, setCopied] = useState(false);
    const [editingPasswordAccountId, setEditingPasswordAccountId] = useState<string | null>(null);
    const [editingPassword, setEditingPassword] = useState('');
    const [editingUsernameAccountId, setEditingUsernameAccountId] = useState<string | null>(null);
    const [editingUsername, setEditingUsername] = useState('');
    const [maintenanceMessage, setMaintenanceMessage] = useState('');
    const [announcementDraft, setAnnouncementDraft] = useState('');
    const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);

    const loadAccounts = useCallback(async (token: string) => {
        const result = await adminListAccounts(token);
        if (!Array.isArray(result.accounts)) {
            throw new Error('A função cine-api no Supabase está desatualizada. Publique a versão atual para carregar os usuários.');
        }
        setAccounts(result.accounts.map((account) => ({
            ...account,
            role: account.role === 'admin' ? 'admin' : 'user',
        })));
    }, []);

    const loadAppSettings = useCallback(async (token: string) => {
        const result = await adminGetAppSettings(token);
        if (!Array.isArray(result.announcements)) {
            throw new Error('Atualize a função cine-api no Supabase para carregar a lista de avisos.');
        }
        setAppSettings(result);
        setMaintenanceMessage(result.maintenanceMessage);
    }, []);

    const login = useCallback(async (adminUsername: string, password: string, rememberPassword: boolean) => {
        const result = await adminLogin(adminUsername, password);
        const authenticatedUsername = result.username || adminUsername.trim().toLowerCase();
        const nextSession = {
            token: result.token,
            expiresAt: result.expiresAt,
            username: authenticatedUsername,
            canCreateAdmin: result.canCreateAdmin ?? authenticatedUsername.toLowerCase() === 'jhow',
        };
        await Promise.all([
            loadAccounts(nextSession.token),
            loadAppSettings(nextSession.token),
        ]);
        window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(nextSession));
        setPageError('');
        if (window.cineResenhaWindow) {
            try {
                await window.cineResenhaWindow.setRememberedAdminCredentials(rememberPassword ?
                    { username: adminUsername, password } :
                    null);
            } catch (storageError) {
                console.error('Could not persist remembered admin credentials:', storageError);
                setPageError('Você entrou no painel, mas não foi possível salvar a senha neste computador.');
            }
        }
        setSession(nextSession);
    }, [loadAccounts, loadAppSettings]);

    useEffect(() => {
        const restore = async () => {
            const saved = window.localStorage.getItem(ADMIN_SESSION_KEY);
            if (!saved) {
                setLoading(false);
                return;
            }

            try {
                const stored = JSON.parse(saved) as AdminSession;
                if (!stored.token || stored.expiresAt <= Date.now()) {
                    throw new Error('A sessão do painel expirou. Entre novamente.');
                }
                const access = await adminValidateSession(stored.token);
                const authenticatedUsername = access.username || stored.username || '';
                const restoredSession = {
                    ...stored,
                    username: authenticatedUsername,
                    canCreateAdmin: access.canCreateAdmin ?? authenticatedUsername.toLowerCase() === 'jhow',
                };
                await Promise.all([
                    loadAccounts(stored.token),
                    loadAppSettings(stored.token),
                ]);
                setSession(restoredSession);
                window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(restoredSession));
            } catch (restoreError) {
                window.localStorage.removeItem(ADMIN_SESSION_KEY);
                setPageError(restoreError instanceof Error ? restoreError.message : 'Não foi possível validar o acesso administrativo.');
            } finally {
                setLoading(false);
            }
        };
        void restore();
    }, [loadAccounts, loadAppSettings]);

    useEffect(() => {
        if (!session) return undefined;
        const timeout = window.setTimeout(() => {
            window.localStorage.removeItem(ADMIN_SESSION_KEY);
            setSession(null);
            setPageError('A sessão administrativa expirou. Entre novamente.');
        }, Math.max(0, session.expiresAt - Date.now()));
        return () => window.clearTimeout(timeout);
    }, [session]);

    useEffect(() => {
        if (!session) return undefined;
        const interval = window.setInterval(() => {
            void loadAccounts(session.token).catch((refreshError) => {
                setPageError(refreshError instanceof Error ? refreshError.message : 'Não foi possível atualizar as sessões.');
            });
        }, 30_000);
        return () => window.clearInterval(interval);
    }, [session, loadAccounts]);

    const logout = async () => {
        const currentSession = session;
        window.localStorage.removeItem(ADMIN_SESSION_KEY);
        setSession(null);
        setAccounts([]);
        if (currentSession) {
            try {
                await adminRevokeSession(currentSession.token);
            } catch (logoutError) {
                console.error('Could not revoke the admin session on the server:', logoutError);
            }
        }
    };

    const refreshAccounts = async () => {
        if (!session) return;
        setPageError('');
        try {
            await loadAccounts(session.token);
        } catch (refreshError) {
            setPageError(refreshError instanceof Error ? refreshError.message : 'Não foi possível atualizar as contas.');
        }
    };

    const updateAddonVisibility = async () => {
        if (!session) return;
        setSavingSettings(true);
        setPageError('');
        try {
            const updated = await adminUpdateAppSettings(session.token, {
                addonsTabVisible: !appSettings.addonsTabVisible,
            });
            setAppSettings(updated);
        } catch (settingsError) {
            setPageError(settingsError instanceof Error ? settingsError.message : 'Não foi possível atualizar as opções do app.');
        } finally {
            setSavingSettings(false);
        }
    };

    const updateMaintenance = async (enabled: boolean) => {
        if (!session) return;
        setSavingSettings(true);
        setPageError('');
        try {
            const updated = await adminUpdateAppSettings(session.token, {
                maintenanceEnabled: enabled,
                maintenanceMessage,
            });
            setAppSettings(updated);
            setMaintenanceMessage(updated.maintenanceMessage);
        } catch (settingsError) {
            setPageError(settingsError instanceof Error ? settingsError.message : 'Não foi possível atualizar a manutenção.');
        } finally {
            setSavingSettings(false);
        }
    };

    const saveMaintenanceMessage = async () => {
        if (!session) return;
        setSavingSettings(true);
        setPageError('');
        try {
            const updated = await adminUpdateAppSettings(session.token, { maintenanceMessage });
            setAppSettings(updated);
            setMaintenanceMessage(updated.maintenanceMessage);
        } catch (settingsError) {
            setPageError(settingsError instanceof Error ? settingsError.message : 'Não foi possível salvar a mensagem.');
        } finally {
            setSavingSettings(false);
        }
    };

    const saveAnnouncement = async () => {
        if (!session || announcementDraft.trim().length === 0) return;
        setSavingSettings(true);
        setPageError('');
        try {
            if (editingAnnouncementId) {
                await adminUpdateAnnouncement(session.token, editingAnnouncementId, announcementDraft);
            } else {
                await adminCreateAnnouncement(session.token, announcementDraft);
            }
            await loadAppSettings(session.token);
            setAnnouncementDraft('');
            setEditingAnnouncementId(null);
        } catch (announcementError) {
            setPageError(announcementError instanceof Error ? announcementError.message : 'Não foi possível salvar o aviso.');
        } finally {
            setSavingSettings(false);
        }
    };

    const deleteAnnouncement = async (id: string) => {
        if (!session || !window.confirm('Apagar este aviso para todos os usuários?')) return;
        setSavingSettings(true);
        setPageError('');
        try {
            await adminDeleteAnnouncement(session.token, id);
            await loadAppSettings(session.token);
            if (editingAnnouncementId === id) {
                setEditingAnnouncementId(null);
                setAnnouncementDraft('');
            }
        } catch (announcementError) {
            setPageError(announcementError instanceof Error ? announcementError.message : 'Não foi possível apagar o aviso.');
        } finally {
            setSavingSettings(false);
        }
    };

    const startEditingAnnouncement = (id: string, message: string) => {
        setEditingAnnouncementId(id);
        setAnnouncementDraft(message);
    };

    const cancelAnnouncementEdit = () => {
        setEditingAnnouncementId(null);
        setAnnouncementDraft('');
    };

    const createAccount = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!session) return;
        setWorking(true);
        setPageError('');
        setNewCredentials(null);
        setCopied(false);
        try {
            const result = await adminCreateAccount(
                session.token,
                username.trim(),
                password,
                createAdminAccess,
                createAdminAccess ? undefined : accountDuration(durationAmount, durationUnit),
            );
            setNewCredentials({
                username: result.account.username,
                password,
                expiresAt: result.account.expiresAt,
                isAdmin: result.account.role === 'admin',
            });
            setUsername('');
            setPassword('');
            setCreateAdminAccess(false);
            setDurationAmount('30');
            setDurationUnit('days');
            await loadAccounts(session.token);
        } catch (createError) {
            setPageError(createError instanceof Error ? createError.message : 'Não foi possível criar a conta.');
        } finally {
            setWorking(false);
        }
    };

    const updateAccount = async (
        account: SubscriptionAccount,
        action: 'suspend' | 'activate' | 'resetPassword' | 'updateUsername' | 'logoutSessions' | 'delete',
        nextPassword?: string,
        nextUsername?: string,
    ) => {
        if (!session) return;
        if (action === 'delete' && !window.confirm(`Excluir a conta "${account.username}" permanentemente?`)) return;
        if (action === 'logoutSessions' &&
            !window.confirm(`Encerrar todas as sessões ativas de "${account.username}"?`)) return;
        if (action === 'resetPassword' && (!nextPassword || nextPassword.length < 6 || nextPassword.length > 128)) {
            setPageError('A senha deve ter entre 6 e 128 caracteres.');
            return;
        }
        if (action === 'updateUsername' && (!nextUsername || !/^[a-zA-Z0-9._-]{3,32}$/.test(nextUsername))) {
            setPageError('O nome de usuário deve ter de 3 a 32 caracteres e usar apenas letras, números, ponto, traço ou sublinhado.');
            return;
        }

        setWorking(true);
        setPageError('');
        setNewCredentials(null);
        setCopied(false);
        try {
            const result = await adminUpdateAccount(
                session.token,
                account.id,
                action,
                nextPassword || undefined,
                nextUsername?.trim(),
            );
            if (action === 'resetPassword' && nextPassword) {
                setNewCredentials({
                    username: account.username,
                    password: nextPassword,
                    expiresAt: result.account?.expiresAt,
                    isAdmin: account.role === 'admin',
                });
                setEditingPasswordAccountId(null);
                setEditingPassword('');
            }
            if (action === 'updateUsername') {
                setEditingUsernameAccountId(null);
                setEditingUsername('');
            }
            await loadAccounts(session.token);
        } catch (updateError) {
            setPageError(updateError instanceof Error ? updateError.message : 'Não foi possível atualizar a conta.');
        } finally {
            setWorking(false);
        }
    };

    const copyCredentials = async () => {
        if (!newCredentials) return;
        try {
            await navigator.clipboard.writeText(`Usuário: ${newCredentials.username}\nSenha: ${newCredentials.password}`);
            setCopied(true);
        } catch (copyError) {
            setPageError(copyError instanceof Error ? copyError.message : 'Não foi possível copiar os dados.');
        }
    };

    const accountCounts = useMemo(() => {
        const now = Date.now();
        const active = accounts.filter((account) =>
            !account.suspended &&
            (account.role === 'admin' || !account.expiresAt || new Date(account.expiresAt).getTime() > now)).length;
        const expired = accounts.filter((account) =>
            account.role === 'user' &&
            account.expiresAt && new Date(account.expiresAt).getTime() <= now).length;
        const loggedIn = accounts.filter((account) =>
            (account.activeSessions || 0) > 0).length;
        return { active, expired, loggedIn };
    }, [accounts]);

    if (loading) {
        return <main className={styles['admin-loading']}>{t('CINE_ADMIN_LOADING', { defaultValue: 'CARREGANDO O PAINEL SECAMENTE' })}</main>;
    }

    if (!session) {
        return <AdminLogin onLogin={login} initialError={pageError} />;
    }

    return (
        <main className={styles['admin-shell']}>
            <header className={styles['topbar']}>
                <Brand />
                <div className={styles['topbar-actions']}>
                    <span className={styles['admin-status']}><i /> {t('CINE_ADMIN_ROLE', { defaultValue: 'Administrador' })}: {session.username}</span>
                    <button className={styles['quiet-button']} onClick={logout}>{t('CINE_SIGN_OUT', { defaultValue: 'Sair' })}</button>
                </div>
            </header>

            <div className={styles['dashboard']}>
                <section className={styles['welcome']}>
                    <div>
                        <div className={styles['eyebrow']}>{t('CINE_ADMIN_ACCESS_EYEBROW', { defaultValue: 'GESTÃO DE LOGINS' })}</div>
                        <h1>{t('CINE_ADMIN_ACCESS_TITLE', { defaultValue: 'Assinaturas e usuários' })}</h1>

                    </div>
                    <div className={styles['welcome-badge']}>{t('CINE_ADMIN_PANEL_LABEL', { defaultValue: 'PAINEL' })}<br /><strong>{t('CINE_ADMIN_ROLE_SHORT', { defaultValue: 'ADMIN' })}</strong></div>
                </section>

                <section className={styles['stat-grid']} aria-label={t('CINE_ADMIN_ACCOUNTS_SUMMARY', { defaultValue: 'Resumo das contas' })}>
                    <div className={styles['stat-card']}><span>{t('CINE_ADMIN_TOTAL_ACCOUNTS', { defaultValue: 'Contas cadastradas' })}</span><strong>{accounts.length}</strong><i className={styles['stat-purple']} /></div>
                    <div className={styles['stat-card']}><span>{t('CINE_ADMIN_ACTIVE_ACCESS', { defaultValue: 'Acessos ativos' })}</span><strong>{accountCounts.active}</strong><i className={styles['stat-green']} /></div>
                    <div className={styles['stat-card']}><span>{t('CINE_ADMIN_EXPIRED', { defaultValue: 'Assinaturas vencidas' })}</span><strong>{accountCounts.expired}</strong><i className={styles['stat-amber']} /></div>
                    <div className={styles['stat-card']}><span>Usuários com sessão ativa</span><strong>{accountCounts.loggedIn}</strong><i className={styles['stat-green']} /></div>
                </section>

                <section className={styles['panel-card']}>
                    <div className={styles['section-heading']}>
                        <div>
                            <div className={styles['eyebrow']}>{t('CINE_ADMIN_APP_OPTIONS', { defaultValue: 'OPÇÕES DO APLICATIVO' })}</div>
                            <h2>{t('CINE_ADMIN_ANNOUNCEMENT', { defaultValue: 'Mensagem para os usuários' })}</h2>
                        </div>
                    </div>
                    <label className={styles['admin-form']}>
                        <span>{t('CINE_ADMIN_ANNOUNCEMENT_MESSAGE', { defaultValue: 'Mensagem' })}</span>
                        <textarea
                            maxLength={500}
                            value={announcementDraft}
                            onChange={(event) => setAnnouncementDraft(event.target.value)}
                            placeholder={t('CINE_ADMIN_ANNOUNCEMENT_PLACEHOLDER', { defaultValue: 'Digite o aviso para todos os usuários...' })}
                        />
                    </label>
                    <div className={styles['section-heading']}>
                        <div className={styles['table-note']}>
                            {editingAnnouncementId ?
                                t('CINE_ADMIN_ANNOUNCEMENT_EDITING', { defaultValue: 'Editando aviso: ao salvar, ele será exibido novamente para os usuários.' }) :
                                t('CINE_ADMIN_ANNOUNCEMENT_LIST_HELP', { defaultValue: 'Os avisos desta lista aparecem no app, um por vez, até cada pessoa confirmar com OK.' })}
                        </div>
                        <div className={styles['announcement-form-actions']}>
                            {editingAnnouncementId && (
                                <button
                                    className={styles['quiet-button']}
                                    type="button"
                                    disabled={savingSettings}
                                    onClick={cancelAnnouncementEdit}
                                >
                                    {t('BUTTON_CANCEL', { defaultValue: 'Cancelar' })}
                                </button>
                            )}
                            <button
                                className={styles['primary-button']}
                                type="button"
                                disabled={savingSettings || announcementDraft.trim().length === 0}
                                onClick={() => void saveAnnouncement()}
                            >
                                {savingSettings ?
                                    t('CINE_ADMIN_SAVING', { defaultValue: 'Salvando…' }) :
                                    editingAnnouncementId ?
                                        t('CINE_ADMIN_ANNOUNCEMENT_SAVE_EDIT', { defaultValue: 'Salvar edição' }) :
                                        t('CINE_ADMIN_SEND_ANNOUNCEMENT', { defaultValue: 'Enviar mensagem' })}
                            </button>
                        </div>
                    </div>
                    {pageError && <div className={styles['alert-error']} role="alert">{pageError}</div>}
                    <div className={styles['announcement-list']}>
                        <h3>{t('CINE_ADMIN_ANNOUNCEMENTS_LIST', { count: appSettings.announcements.length, defaultValue: 'Avisos cadastrados ({{count}})' })}</h3>
                        {appSettings.announcements.length === 0 ? (
                            <div className={styles['table-note']}>
                                {t('CINE_ADMIN_ANNOUNCEMENT_EMPTY', { defaultValue: 'Nenhum aviso enviado.' })}
                            </div>
                        ) : appSettings.announcements.map((announcement) => (
                            <article key={announcement.id} className={styles['announcement-item']}>
                                <div className={styles['announcement-item-content']}>
                                    <p>{announcement.message}</p>
                                    <time dateTime={announcement.updatedAt}>
                                        {formatDate(announcement.updatedAt)}
                                    </time>
                                </div>
                                <div className={styles['announcement-item-actions']}>
                                    <button
                                        className={styles['quiet-button']}
                                        type="button"
                                        disabled={savingSettings}
                                        onClick={() => startEditingAnnouncement(announcement.id, announcement.message)}
                                    >
                                        {t('BUTTON_EDIT', { defaultValue: 'Editar' })}
                                    </button>
                                    <button
                                        className={styles['quiet-button']}
                                        type="button"
                                        disabled={savingSettings}
                                        onClick={() => void deleteAnnouncement(announcement.id)}
                                    >
                                        {t('BUTTON_DELETE', { defaultValue: 'Apagar' })}
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <section className={styles['panel-card']}>
                    <div className={styles['section-heading']}>
                        <div>
                            <div className={styles['eyebrow']}>{t('CINE_ADMIN_APP_OPTIONS', { defaultValue: 'OPÇÕES DO APLICATIVO' })}</div>
                            <h2>{t('CINE_ADMIN_ADDONS_TAB_TITLE', { defaultValue: 'Aba de add-ons' })}</h2>
                        </div>
                        <button
                            className={styles['quiet-button']}
                            type="button"
                            disabled={savingSettings}
                            onClick={() => void updateAddonVisibility()}
                        >
                            {savingSettings ?
                                t('CINE_ADMIN_SAVING', { defaultValue: 'Salvando…' }) :
                                appSettings.addonsTabVisible ?
                                    t('CINE_ADMIN_HIDE_ADDONS_TAB', { defaultValue: 'Ocultar aba' }) :
                                    t('CINE_ADMIN_SHOW_ADDONS_TAB', { defaultValue: 'Mostrar aba' })}
                        </button>
                    </div>
                    <div className={styles['table-note']}>
                        {appSettings.addonsTabVisible ?
                            t('CINE_ADMIN_ADDONS_TAB_VISIBLE', { defaultValue: 'A aba Add-ons está visível no aplicativo dos usuários.' }) :
                            t('CINE_ADMIN_ADDONS_TAB_HIDDEN', { defaultValue: 'A aba Add-ons está oculta no aplicativo dos usuários.' })}
                    </div>
                </section>

                <section className={styles['panel-card']}>
                    <div className={styles['section-heading']}>
                        <div>
                            <div className={styles['eyebrow']}>{t('CINE_ADMIN_APP_OPTIONS', { defaultValue: 'OPÇÕES DO APLICATIVO' })}</div>
                            <h2>{t('CINE_ADMIN_MAINTENANCE', { defaultValue: 'Manutenção' })}</h2>
                        </div>
                        <button
                            className={styles['quiet-button']}
                            type="button"
                            disabled={savingSettings}
                            onClick={() => void updateMaintenance(!appSettings.maintenanceEnabled)}
                        >
                            {savingSettings ?
                                t('CINE_ADMIN_SAVING', { defaultValue: 'Salvando…' }) :
                                appSettings.maintenanceEnabled ?
                                    t('CINE_ADMIN_DISABLE_MAINTENANCE', { defaultValue: 'Desativar manutenção' }) :
                                    t('CINE_ADMIN_ENABLE_MAINTENANCE', { defaultValue: 'Ativar manutenção' })}
                        </button>
                    </div>
                    <label className={styles['admin-form']}>
                        <span>{t('CINE_ADMIN_MAINTENANCE_MESSAGE', { defaultValue: 'Mensagem exibida no app' })}</span>
                        <textarea
                            maxLength={300}
                            value={maintenanceMessage}
                            onChange={(event) => setMaintenanceMessage(event.target.value)}
                            placeholder={t('CINE_ADMIN_MAINTENANCE_DEFAULT', { defaultValue: 'Estamos fazendo alguns ajustes. Tente novamente mais tarde.' })}
                        />
                    </label>
                    <div className={styles['section-heading']}>
                        <div className={styles['table-note']}>
                            {appSettings.maintenanceEnabled ?
                                t('CINE_ADMIN_MAINTENANCE_ON', { defaultValue: 'A tela de manutenção está ativa para todos os usuários.' }) :
                                t('CINE_ADMIN_MAINTENANCE_OFF', { defaultValue: 'A tela de manutenção está desativada.' })}
                        </div>
                        <button
                            className={styles['quiet-button']}
                            type="button"
                            disabled={savingSettings || maintenanceMessage === appSettings.maintenanceMessage}
                            onClick={() => void saveMaintenanceMessage()}
                        >
                            {t('CINE_ADMIN_SAVE_MESSAGE', { defaultValue: 'Salvar mensagem' })}
                        </button>
                    </div>
                </section>

                <section className={styles['panel-card']}>
                    <div className={styles['section-heading']}>
                        <div>
                            <div className={styles['eyebrow']}>{t('CINE_ADMIN_NEW_ACCESS', { defaultValue: 'NOVO ACESSO' })}</div>
                            <h2>{t('CINE_ADMIN_CREATE_ACCOUNT', { defaultValue: 'Criar conta' })}</h2>
                        </div>
                        <span className={styles['section-icon']}>＋</span>
                    </div>
                    <form className={styles['create-form']} onSubmit={createAccount}>
                        <label className={styles['admin-form']}>
                            <span>{t('CINE_USERNAME', { defaultValue: 'Nome de usuário' })}</span>
                            <input
                                autoComplete={'off'}
                                required
                                minLength={3}
                                maxLength={32}
                                pattern={'[A-Za-z0-9._-]+'}
                                title={t('CINE_ADMIN_USERNAME_RULES', { defaultValue: 'Use letras, números, ponto, traço ou sublinhado.' })}
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                placeholder={t('CINE_ADMIN_USERNAME_EXAMPLE', { defaultValue: 'Ex.: marcos.silva' })}
                            />
                        </label>
                        <label className={styles['admin-form']}>
                            <span>{t('CINE_PASSWORD', { defaultValue: 'Senha' })}</span>
                            <input
                                type="password"
                                autoComplete="new-password"
                                required
                                minLength={6}
                                maxLength={128}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="Defina a senha do usuário"
                            />
                        </label>
                        {!createAdminAccess && (
                            <div className={styles['admin-form']}>
                                <span>Validade do acesso</span>
                                <div className={styles['duration-fields']}>
                                    <input
                                        aria-label="Quantidade da validade"
                                        type="number"
                                        required
                                        min={1}
                                        max={DURATION_UNITS.find((item) => item.value === durationUnit)?.max}
                                        step={1}
                                        value={durationAmount}
                                        onChange={(event) => setDurationAmount(event.target.value)}
                                    />
                                    <select
                                        aria-label="Unidade da validade"
                                        value={durationUnit}
                                        onChange={(event) => setDurationUnit(event.target.value)}
                                    >
                                        {DURATION_UNITS.map((item) => (
                                            <option key={item.value} value={item.value}>{item.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                        <div className={styles['create-account-actions']}>
                            <label
                                className={styles['create-admin-toggle']}
                                title="Conta admin: pode entrar no app e no painel admin e não tem validade."
                            >
                                <input
                                    type="checkbox"
                                    checked={createAdminAccess}
                                    onChange={(event) => setCreateAdminAccess(event.target.checked)}
                                />
                                <span>Admin</span>
                            </label>
                            <button className={styles['primary-button']} type="submit" disabled={working}>
                                {working ? t('CINE_ADMIN_CREATING', { defaultValue: 'Criando…' }) : t('CINE_ADMIN_GENERATE_LOGIN', { defaultValue: 'Gerar login' })}
                                <span aria-hidden={true}>✦</span>
                            </button>
                        </div>
                    </form>
                    {newCredentials && (
                        <div className={styles['credentials-card']} role="status">
                            <div className={styles['credential-copy']}>
                                <span className={styles['eyebrow']}>{t('CINE_ADMIN_ACCOUNT_CREDENTIALS', { defaultValue: 'DADOS DO ACESSO' })}</span>
                                <div><span>{t('CINE_USERNAME', { defaultValue: 'Usuário' })}</span><strong>{newCredentials.username}</strong></div>
                                <div><span>{t('CINE_PASSWORD', { defaultValue: 'Senha' })}</span><strong className={styles['generated-password']}>{newCredentials.password}</strong></div>
                                {newCredentials.isAdmin && <div><span>Acesso</span><strong>App e painel admin</strong></div>}
                                <div><span>{t('CINE_EXPIRES_AT', { defaultValue: 'Válida até' })}</span><strong>{newCredentials.expiresAt ? formatDate(newCredentials.expiresAt) : 'Sem vencimento'}</strong></div>
                            </div>
                            <button className={styles['copy-button']} onClick={() => void copyCredentials()}>{copied ? t('CINE_ADMIN_COPIED', { defaultValue: 'Copiado ✓' }) : t('CINE_ADMIN_COPY_CREDENTIALS', { defaultValue: 'Copiar dados' })}</button>
                        </div>
                    )}
                </section>

                <section className={styles['panel-card']}>
                    <div className={styles['section-heading']}>
                        <div>
                            <div className={styles['eyebrow']}>{t('CINE_ADMIN_CUSTOMER_BASE', { defaultValue: 'BASE DE CLIENTES' })}</div>
                            <h2>Usuários e sessões</h2>
                        </div>
                        <button className={styles['quiet-button']} onClick={() => void refreshAccounts()}>{t('CINE_ADMIN_REFRESH', { defaultValue: 'Atualizar ↻' })}</button>
                    </div>
                    <div className={styles['account-tabs']} role="tablist" aria-label="Tipo de conta">
                        <button
                            className={accountTab === 'user' ? styles['account-tab-active'] : ''}
                            type="button"
                            role="tab"
                            aria-selected={accountTab === 'user'}
                            onClick={() => setAccountTab('user')}
                        >
                            Usuários ({accounts.filter((account) => account.role === 'user').length})
                        </button>
                        <button
                            className={accountTab === 'admin' ? styles['account-tab-active'] : ''}
                            type="button"
                            role="tab"
                            aria-selected={accountTab === 'admin'}
                            onClick={() => setAccountTab('admin')}
                        >
                            Administradores ({accounts.filter((account) => account.role === 'admin').length})
                        </button>
                    </div>

                    {pageError && <div className={styles['alert-error']} role="alert">{pageError}</div>}
                    {accounts.filter((account) => account.role === accountTab).length === 0 ? (
                        <div className={styles['empty-state']}>
                            <span>◇</span>
                            <strong>{accountTab === 'admin' ? 'Nenhum administrador cadastrado' : t('CINE_ADMIN_NO_ACCOUNTS', { defaultValue: 'Nenhuma conta cadastrada' })}</strong>
                            <p>{accountTab === 'admin' ? 'Os administradores cadastrados aparecerão aqui.' : t('CINE_ADMIN_EMPTY_ACCOUNTS', { defaultValue: 'As contas que você criar aparecerão aqui.' })}</p>
                        </div>
                    ) : (
                        <div className={styles['table-scroll']}>
                            <table className={styles['accounts-table']}>
                                <thead>
                                    <tr><th>{t('CINE_USERNAME', { defaultValue: 'Usuário' })}</th><th>{t('CINE_ADMIN_STATUS', { defaultValue: 'Situação' })}</th><th>Sessões ativas</th><th>{t('CINE_EXPIRES_AT', { defaultValue: 'Vencimento' })}</th><th>{t('CINE_ADMIN_CREATED_AT', { defaultValue: 'Criada em' })}</th><th>{t('CINE_ADMIN_MANAGE', { defaultValue: 'Gerenciar' })}</th></tr>
                                </thead>
                                <tbody>
                                    {accounts.filter((item) => item.role === accountTab).map((account) => {
                                        const expired = Boolean(account.expiresAt && new Date(account.expiresAt).getTime() <= Date.now());
                                        const state = account.suspended ? 'Suspensa' :
                                            account.role === 'admin' ? 'Administrador' : expired ? 'Vencida' : 'Ativa';
                                        const canManage = account.role === 'user' ||
                                            (session.canCreateAdmin &&
                                                account.role === 'admin' &&
                                                account.username.toLowerCase() !== session.username.toLowerCase());
                                        return (
                                            <tr key={account.id}>
                                                <td><strong className={styles['account-name']}>{account.username}</strong></td>
                                                <td><span className={`${styles['status-pill']} ${account.suspended ? styles['status-suspended'] : expired ? styles['status-expired'] : styles['status-active']}`}><i />{state}</span></td>
                                                <td>{(account.activeSessions || 0) > 0 ? `${account.activeSessions} sessão(ões) ativa(s)` : 'Sem sessão ativa'}</td>
                                                <td>{account.expiresAt ? formatDate(account.expiresAt) : 'Sem vencimento'}</td>
                                                <td>{formatDate(account.createdAt)}</td>
                                                <td>
                                                    {canManage ? <div className={styles['row-actions']}>
                                                        <button disabled={working} onClick={() => void updateAccount(account, account.suspended ? 'activate' : 'suspend')}>{account.suspended ? t('CINE_ADMIN_ACTIVATE', { defaultValue: 'Ativar' }) : t('CINE_ADMIN_SUSPEND', { defaultValue: 'Suspender' })}</button>
                                                        <button
                                                            disabled={working}
                                                            onClick={() => {
                                                                setEditingUsernameAccountId(account.id);
                                                                setEditingUsername(account.username);
                                                                setPageError('');
                                                            }}
                                                        >
                                                            Editar usuário
                                                        </button>
                                                        <button
                                                            disabled={working}
                                                            onClick={() => {
                                                                setEditingPasswordAccountId(account.id);
                                                                setEditingPassword('');
                                                                setPageError('');
                                                            }}
                                                        >
                                                            {t('CINE_ADMIN_NEW_PASSWORD', { defaultValue: 'Editar senha' })}
                                                        </button>
                                                        <button
                                                            disabled={working || !(account.activeSessions || 0)}
                                                            onClick={() => void updateAccount(account, 'logoutSessions')}
                                                        >
                                                            Encerrar sessões
                                                        </button>
                                                        <button className={styles['delete-button']} disabled={working} onClick={() => void updateAccount(account, 'delete')}>{t('CINE_ADMIN_DELETE', { defaultValue: 'Excluir' })}</button>
                                                    </div> : account.role === 'admin' && !session.canCreateAdmin ? 'Somente jhow pode gerenciar' : 'Administrador principal'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {!pageError && accounts.some((account) => account.role === accountTab) && <div className={styles['table-note']}>As senhas são armazenadas protegidas.</div>}
                </section>
                {
                    editingPasswordAccountId &&
                        <div className={styles['password-dialog-backdrop']} role="presentation">
                            <form
                                className={styles['password-dialog']}
                                aria-label="Editar senha da conta"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    const account = accounts.find(({ id }) => id === editingPasswordAccountId);
                                    if (account) void updateAccount(account, 'resetPassword', editingPassword);
                                }}
                            >
                                <h2>{t('CINE_ADMIN_NEW_PASSWORD', { defaultValue: 'Editar senha' })}</h2>
                                <p>{t('CINE_ADMIN_EDIT_PASSWORD_DESCRIPTION', { defaultValue: 'Defina uma nova senha para a conta. A senha atual deixará de funcionar.' })}</p>
                                <label className={styles['admin-form']}>
                                    <span>{t('CINE_ADMIN_PASSWORD_NEW', { defaultValue: 'Nova senha' })}</span>
                                    <input
                                        type="password"
                                        autoComplete="new-password"
                                        autoFocus
                                        required
                                        minLength={6}
                                        maxLength={128}
                                        value={editingPassword}
                                        onChange={(event) => setEditingPassword(event.target.value)}
                                    />
                                </label>
                                {pageError && <div className={styles['alert-error']} role="alert">{pageError}</div>}
                                <div className={styles['password-dialog-actions']}>
                                    <button
                                        className={styles['quiet-button']}
                                        type="button"
                                        disabled={working}
                                        onClick={() => {
                                            setEditingPasswordAccountId(null);
                                            setEditingPassword('');
                                        }}
                                    >
                                        {t('CINE_CANCEL', { defaultValue: 'Cancelar' })}
                                    </button>
                                    <button className={styles['primary-button']} type="submit" disabled={working}>
                                        {working ?
                                            t('CINE_ADMIN_SAVING', { defaultValue: 'Salvando…' }) :
                                            t('CINE_ADMIN_SAVE_PASSWORD', { defaultValue: 'Salvar senha' })}
                                    </button>
                                </div>
                            </form>
                        </div>
                }
                {
                    editingUsernameAccountId &&
                        <div className={styles['password-dialog-backdrop']} role="presentation">
                            <form
                                className={styles['password-dialog']}
                                aria-label="Editar nome de usuário"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    const account = accounts.find(({ id }) => id === editingUsernameAccountId);
                                    if (account) void updateAccount(account, 'updateUsername', undefined, editingUsername);
                                }}
                            >
                                <h2>Editar usuário</h2>
                                <label className={styles['admin-form']}>
                                    <span>{t('CINE_USERNAME', { defaultValue: 'Nome de usuário' })}</span>
                                    <input
                                        autoComplete="off"
                                        autoFocus
                                        required
                                        minLength={3}
                                        maxLength={32}
                                        pattern="[A-Za-z0-9._-]+"
                                        value={editingUsername}
                                        onChange={(event) => setEditingUsername(event.target.value)}
                                    />
                                </label>
                                {pageError && <div className={styles['alert-error']} role="alert">{pageError}</div>}
                                <div className={styles['password-dialog-actions']}>
                                    <button
                                        className={styles['quiet-button']}
                                        type="button"
                                        disabled={working}
                                        onClick={() => {
                                            setEditingUsernameAccountId(null);
                                            setEditingUsername('');
                                        }}
                                    >
                                        {t('CINE_CANCEL', { defaultValue: 'Cancelar' })}
                                    </button>
                                    <button className={styles['primary-button']} type="submit" disabled={working}>
                                        {working ? t('CINE_ADMIN_SAVING', { defaultValue: 'Salvando…' }) : 'Salvar usuário'}
                                    </button>
                                </div>
                            </form>
                        </div>
                }
                <footer className={styles['dashboard-footer']}>{t('CINE_BRAND', { defaultValue: 'CINE RESENHA' })} <span>·</span> {t('CINE_ADMIN_FOOTER', { defaultValue: '2026' })}</footer>
            </div>
        </main>
    );
};

export default AdminApp;

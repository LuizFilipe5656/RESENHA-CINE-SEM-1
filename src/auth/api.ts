export type AuthSession = {
    accessToken: string,
    expiresAt: number,
};

export type SubscriptionAccount = {
    id: string,
    username: string,
    expiresAt: string | null,
    createdAt: string,
    suspended: boolean,
    activeSessions?: number,
    role?: 'user' | 'admin',
};

export type AdminAccess = {
    username: string,
    canCreateAdmin?: boolean,
};

export type AppAnnouncement = {
    id: string,
    message: string,
    updatedAt: string,
};

export type CineAppSettings = {
    addonsTabVisible: boolean,
    maintenanceEnabled: boolean,
    maintenanceMessage: string,
    announcements: AppAnnouncement[],
};

export class AuthApiError extends Error {
    code: string;

    constructor(message: string, code: string) {
        super(message);
        this.name = 'AuthApiError';
        this.code = code;
    }
}

const supabaseUrl = process.env.CINE_SUPABASE_URL?.replace(/\/+$/, '');
const supabaseAnonKey = process.env.CINE_SUPABASE_ANON_KEY;
const ACCOUNT_API_TIMEOUT_MS = 15_000;
const accountApiUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/cine-api` : null;

const parseResponse = async <T>(response: Response): Promise<T> => {
    const result = await response.json().catch(() => null) as {
        error?: { code?: string, message?: string },
    } | null;

    if (!response.ok) {
        throw new AuthApiError(
            result?.error?.message || 'O servidor online não conseguiu concluir a solicitação.',
            result?.error?.code || 'SERVER_ERROR',
        );
    }

    return result as T;
};

const callApi = async <T>(
    action: string,
    values: Record<string, unknown> = {},
    extraHeaders: Record<string, string> = {},
): Promise<T> => {
    if (!accountApiUrl || !supabaseAnonKey) {
        throw new AuthApiError(
            'O servidor online ainda não foi configurado neste build. Configure CINE_SUPABASE_URL e CINE_SUPABASE_ANON_KEY no arquivo .env e gere os instaladores novamente.',
            'SUPABASE_NOT_CONFIGURED',
        );
    }
    let response: Response;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), ACCOUNT_API_TIMEOUT_MS);
    try {
        response = await fetch(accountApiUrl, {
            method: 'POST',
            headers: {
                apikey: supabaseAnonKey,
                'Content-Type': 'application/json',
                ...extraHeaders,
            },
            body: JSON.stringify({ action, ...values }),
            signal: controller.signal,
        });
    } catch (error) {
        if (controller.signal.aborted) {
            throw new AuthApiError(
                `O servidor online não respondeu em até ${ACCOUNT_API_TIMEOUT_MS / 1000} segundos. Tente novamente em instantes.`,
                'SERVER_TIMEOUT',
            );
        }
        throw new AuthApiError(
            error instanceof Error ?
                `Não foi possível conectar ao servidor online de contas (${accountApiUrl}). Verifique sua conexão com a internet.` :
                'Não foi possível conectar ao servidor online de contas.',
            'SERVER_UNAVAILABLE',
        );
    } finally {
        window.clearTimeout(timeout);
    }
    return parseResponse<T>(response);
};

export const login = (username: string, password: string) =>
    callApi<{ session: AuthSession, account: SubscriptionAccount }>('login', { username, password });

export const validateSession = (session: AuthSession) =>
    callApi<{ account: SubscriptionAccount }>('session', { accessToken: session.accessToken });

export const revokeSession = (session: AuthSession) =>
    callApi<{ success: true }>('logout', { accessToken: session.accessToken });

export const adminLogin = (username: string, password: string) =>
    callApi<{ token: string, expiresAt: number, username?: string, canCreateAdmin?: boolean }>('adminLogin', { username, password });

export const adminStatus = () =>
    callApi<{ configured: boolean }>('adminStatus');

export const adminSetup = (username: string, password: string, setupKey: string) =>
    callApi<{ configured: boolean }>(
        'adminSetup',
        { username, password },
        { 'x-cine-setup-key': setupKey },
    );

export const adminValidateSession = (token: string) =>
    callApi<AdminAccess>('adminSession', { token });

export const adminRevokeSession = (token: string) =>
    callApi<{ success: true }>('logout', { accessToken: token });

export const adminListAccounts = (token: string) =>
    callApi<{ accounts: SubscriptionAccount[] }>('adminList', { token });

export const adminCreateAccount = (
    token: string,
    username: string,
    password: string,
    isAdmin: boolean,
    duration?: string,
) => callApi<{ account: SubscriptionAccount }>('adminCreate', { token, username, password, isAdmin, duration });

export const adminUpdateAccount = (
    token: string,
    id: string,
    action: 'suspend' | 'activate' | 'makePermanent' | 'resetPassword' | 'updateUsername' | 'logoutSessions' | 'delete',
    password?: string,
    username?: string,
) => callApi<{ account?: SubscriptionAccount, success?: true }>('adminUpdate', {
    token,
    id,
    updateAction: action,
    password,
    username,
});

export const getAppSettings = () =>
    callApi<CineAppSettings>('appSettings');

export const adminGetAppSettings = (token: string) =>
    callApi<CineAppSettings>('adminAppSettings', { token });

export const adminUpdateAppSettings = (
    token: string,
    settings: Partial<Pick<CineAppSettings,
        'addonsTabVisible' | 'maintenanceEnabled' | 'maintenanceMessage'
    >>,
) => callApi<CineAppSettings>('adminUpdateAppSettings', { token, ...settings });

export const adminCreateAnnouncement = (token: string, message: string) =>
    callApi<{ announcement: AppAnnouncement }>('adminCreateAnnouncement', { token, message });

export const adminUpdateAnnouncement = (token: string, id: string, message: string) =>
    callApi<{ announcement: AppAnnouncement }>('adminUpdateAnnouncement', { token, id, message });

export const adminDeleteAnnouncement = (token: string, id: string) =>
    callApi<{ success: true }>('adminDeleteAnnouncement', { token, id });

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { withCoreSuspender } from 'stremio/common';
import {
    AuthApiError,
    AuthSession,
    SubscriptionAccount,
    login as loginRequest,
    revokeSession,
    validateSession,
} from './api';

const STORAGE_KEY = 'cine-resenha-auth-session';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unavailable';
type StoredSession = {
    session: AuthSession,
    account: SubscriptionAccount,
};

type AuthContextValue = {
    status: AuthStatus,
    account: SubscriptionAccount | null,
    error: string | null,
    signIn: (username: string, password: string) => Promise<void>,
    signOut: () => Promise<void>,
    retry: () => void,
};

const AuthContext = createContext<AuthContextValue | null>(null);

const readStoredSession = (): StoredSession | null => {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) return null;

    try {
        const value = JSON.parse(rawValue) as StoredSession;
        if (
            typeof value.session?.accessToken !== 'string' ||
            typeof value.session?.expiresAt !== 'number'
        ) {
            throw new Error('Invalid stored session.');
        }
        return value;
    } catch (error) {
        console.error('Failed to read the saved Cine Resenha session:', error);
        window.localStorage.removeItem(STORAGE_KEY);
        return null;
    }
};

const saveStoredSession = (stored: StoredSession) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [status, setStatus] = useState<AuthStatus>('loading');
    const [stored, setStored] = useState<StoredSession | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    const verify = useCallback(async (current: StoredSession) => {
        try {
            if (current.session.expiresAt <= Date.now()) {
                throw new AuthApiError('Sua sessão expirou. Entre novamente com seu usuário e senha.', 'INVALID_SESSION');
            }
            const result = await validateSession(current.session);
            const nextStored = { session: current.session, account: result.account };
            saveStoredSession(nextStored);
            setStored(nextStored);
            setStatus('authenticated');
            setError(null);
        } catch (verifyError) {
            if (verifyError instanceof AuthApiError &&
                ['ACCOUNT_EXPIRED', 'ACCOUNT_SUSPENDED', 'INVALID_SESSION', 'USER_NOT_FOUND'].includes(verifyError.code)) {
                window.localStorage.removeItem(STORAGE_KEY);
                setStored(null);
                setStatus('unauthenticated');
                setError(verifyError.message);
                return;
            }

            setStatus('unavailable');
            setError(verifyError instanceof Error ?
                verifyError.message : 'Não foi possível verificar sua assinatura.');
        }
    }, []);

    useEffect(() => {
        const saved = readStoredSession();
        if (!saved) {
            setStored(null);
            setStatus('unauthenticated');
            return;
        }

        void verify(saved);
    }, [retryCount, verify]);

    useEffect(() => {
        if (status !== 'authenticated' || !stored) return undefined;

        const check = () => void verify(stored);
        const interval = window.setInterval(check, 60_000);
        const expirationTimeout = stored.account.expiresAt ?
            window.setTimeout(
                check,
                Math.max(0, Math.min(new Date(stored.account.expiresAt).getTime() - Date.now() + 1, 2_147_483_647)),
            ) :
            undefined;
        window.addEventListener('focus', check);

        return () => {
            window.clearInterval(interval);
            if (expirationTimeout !== undefined) window.clearTimeout(expirationTimeout);
            window.removeEventListener('focus', check);
        };
    }, [status, stored, verify]);

    const signIn = useCallback(async (username: string, password: string) => {
        setError(null);
        setStatus('unauthenticated');
        try {
            const result = await loginRequest(username, password);
            const nextStored = result;
            saveStoredSession(nextStored);
            setStored(nextStored);
            setStatus('authenticated');
        } catch (signInError) {
            setStatus('unauthenticated');
            setError(signInError instanceof Error ? signInError.message : 'Não foi possível entrar.');
            throw signInError;
        }
    }, []);

    const signOut = useCallback(async () => {
        const current = readStoredSession();
        window.localStorage.removeItem(STORAGE_KEY);
        setStored(null);
        setStatus('unauthenticated');
        setError(null);

        if (current) {
            try {
                await revokeSession(current.session);
            } catch (revokeError) {
                console.error('Failed to revoke the Cine Resenha session on the server:', revokeError);
            }
        }
    }, []);

    const retry = useCallback(() => {
        setStatus('loading');
        setRetryCount((count) => count + 1);
    }, []);

    const value = useMemo<AuthContextValue>(() => ({
        status,
        account: stored?.account ?? null,
        error,
        signIn,
        signOut,
        retry,
    }), [status, stored, error, signIn, signOut, retry]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider.');
    }
    return context;
};

const AuthProviderWithCoreSuspender = withCoreSuspender(AuthProvider);

export { AuthProviderWithCoreSuspender as AuthProvider, useAuth };

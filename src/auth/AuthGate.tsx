import React, { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthApiError } from './api';
import { useAuth } from './AuthProvider';
import { useAddonSettings } from '../addons/AddonSettingsContext';
import styles from './AuthGate.less';

const LoginScreen = () => {
    const { t } = useTranslation();
    const { signIn, status, error, retry } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setFormError(null);
        setSubmitting(true);
        try {
            await signIn(username.trim(), password);
        } catch (signInError) {
            setFormError(signInError instanceof AuthApiError && signInError.code === 'INVALID_CREDENTIALS' ?
                'Usuário ou senha incorretos. Confira os dados e tente novamente.' :
                signInError instanceof Error ? signInError.message : 'Não foi possível entrar.');
        } finally {
            setSubmitting(false);
        }
    };

    const serviceError = status === 'unavailable';
    const displayedError = formError || (serviceError ? error : null);

    return (
        <main className={styles['auth-page']}>
            <section className={styles['login-card']}>
                <form className={styles['login-form']} onSubmit={onSubmit}>
                    <label className={styles['field']}>
                        <span>{t('CINE_USERNAME', { defaultValue: 'Usuário' })}</span>
                        <input
                            autoComplete="username"
                            autoCapitalize="none"
                            autoCorrect="off"
                            required={true}
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                        />
                    </label>
                    <label className={styles['field']}>
                        <span>{t('CINE_PASSWORD', { defaultValue: 'Senha' })}</span>
                        <input
                            type="password"
                            autoComplete="current-password"
                            required={true}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                    </label>

                    {displayedError && (
                        <div className={styles['error']} role="alert">
                            {displayedError}
                        </div>
                    )}

                    <button className={styles['submit-button']} type="submit" disabled={submitting || status === 'loading'}>
                        {submitting ? t('CINE_CHECKING_ACCESS', { defaultValue: 'Verificando acesso…' }) : t('CINE_LOGIN_SUBMIT', { defaultValue: 'Entrar no Cine Resenha' })}
                        <span aria-hidden={true}>→</span>
                    </button>
                    {serviceError && (
                        <button className={styles['retry-button']} type="button" onClick={retry}>
                            {t('CINE_RETRY', { defaultValue: 'Tentar verificar novamente' })}
                        </button>
                    )}
                </form>

                <div className={styles['login-footer']}>
                    <span className={styles['secure-mark']} aria-hidden={true}>●</span>
                    {t('CINE_LOGIN_SECURITY_NOTE', { defaultValue: 'Seu acesso é protegido e verificado online.' })}
                </div>
                <div className={styles['help-note']}>
                    {t('CINE_PASSWORD_HELP', { defaultValue: 'Esqueceu a senha?' })}
                </div>
            </section>
        </main>
    );
};

const AuthGate = ({ children }: { children: React.ReactNode }) => {
    const { status } = useAuth();
    const { t } = useTranslation();
    const { addonSettingsLoaded, maintenanceEnabled, maintenanceMessage } = useAddonSettings();

    if (!addonSettingsLoaded) {
        return (
            <main className={styles['auth-loading']} role="status" aria-live="polite">
                <div className={styles['loading-mark']}><img src={require('/assets/icon.png')} alt="" /></div>
                <span>{t('CINE_MAINTENANCE_CHECKING', { defaultValue: 'Conectando ao CINE RESENHA…' })}</span>
            </main>
        );
    }

    if (maintenanceEnabled) {
        return (
            <main className={styles['maintenance-page']} role="status" aria-live="polite">
                <section className={styles['maintenance-card']}>
                    <div className={styles['maintenance-mark']}><img src={require('/assets/icon.png')} alt="" /></div>
                    <span className={styles['maintenance-eyebrow']}>{t('CINE_MAINTENANCE_STATUS', { defaultValue: 'MANUTENÇÃO PROGRAMADA' })}</span>
                    <h1>{t('CINE_MAINTENANCE_TITLE', { defaultValue: 'Voltamos em breve' })}</h1>
                    <p>{maintenanceMessage || t('CINE_MAINTENANCE_MESSAGE', { defaultValue: 'Estamos fazendo alguns ajustes para melhorar sua experiência. Tente novamente mais tarde.' })}</p>
                    <div className={styles['maintenance-indicator']}>
                        <i aria-hidden={true} />
                        {t('CINE_MAINTENANCE_WORKING', { defaultValue: 'Estamos trabalhando para você' })}
                    </div>
                </section>
            </main>
        );
    }

    if (status === 'loading') {
        return (
            <main className={styles['auth-loading']} role="status" aria-live="polite">
                <div className={styles['loading-mark']}><img src={require('/assets/icon.png')} alt="" /></div>
                <span>{t('CINE_CHECKING_SUBSCRIPTION', { defaultValue: 'Verificando sua assinatura…' })}</span>
            </main>
        );
    }

    if (status !== 'authenticated') {
        return <LoginScreen />;
    }

    return <>{children}</>;
};

export default AuthGate;

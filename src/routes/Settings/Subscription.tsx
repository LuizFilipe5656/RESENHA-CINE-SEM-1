import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from 'stremio/auth/AuthProvider';
import { Section } from './components';
import { Button } from 'stremio/components';
import styles from './Subscription.less';

const formatDate = (value: string) => new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
}).format(new Date(value));

const Subscription = forwardRef<HTMLDivElement>((_, ref) => {
    const { account, signOut } = useAuth();
    const { t } = useTranslation();
    if (!account) {
        return (
            <Section ref={ref}>
                <div className={styles['password-note']}>{t('CINE_SUBSCRIPTION_LOAD_ERROR', { defaultValue: 'Não foi possível carregar os dados da assinatura.' })}</div>
            </Section>
        );
    }

    const daysRemaining = account.expiresAt ?
        Math.max(0, Math.ceil((new Date(account.expiresAt).getTime() - Date.now()) / 86_400_000)) :
        null;

    return (
        <Section ref={ref} className={styles['subscription-section']}>
            <div className={styles['subscription-heading']}>
                <div className={styles['subscription-icon']} aria-hidden={true}>✦</div>
                <div>
                    <div className={styles['subscription-eyebrow']}>{t('CINE_ACCOUNT', { defaultValue: 'SUA CONTA' })}</div>
                    <h2>{t('CINE_MANAGE_SUBSCRIPTION', { defaultValue: 'Gerenciar assinatura' })}</h2>
                    <p>{t('CINE_SUBSCRIPTION_INFO', { defaultValue: 'Confira os dados do seu acesso ao Cine Resenha.' })}</p>
                </div>
            </div>
            <div className={styles['subscription-card']}>
                <div className={styles['subscription-row']}>
                    <div><span>{t('CINE_USERNAME', { defaultValue: 'Usuário' })}</span><strong>{account.username}</strong></div>
                    <div className={styles['active-badge']}><i /> {t('CINE_ACCESS_ACTIVE', { defaultValue: 'Acesso ativo' })}</div>
                </div>
                <div className={styles['subscription-divider']} />
                <div className={styles['subscription-details']}>
                    <div><span>{t('CINE_EXPIRES_AT', { defaultValue: 'Válida até' })}</span><strong>{account.expiresAt ? formatDate(account.expiresAt) : 'Sem vencimento'}</strong></div>
                    {daysRemaining !== null && (
                        <div><span>{t('CINE_TIME_REMAINING', { defaultValue: 'Tempo restante' })}</span><strong>{daysRemaining === 0 ? t('CINE_EXPIRES_TODAY', { defaultValue: 'Vence hoje' }) : t('CINE_DAYS_REMAINING', { count: daysRemaining, defaultValue: `${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}` })}</strong></div>
                    )}
                </div>
            </div>
            <div className={styles['password-note']}>
                <span aria-hidden={true}>⌑</span>
                <p>{t('CINE_PASSWORD_NOT_SHOWN', { defaultValue: 'Por segurança, sua senha não é exibida no aplicativo. Para redefini-la ou renovar a assinatura, fale com o administrador.' })}</p>
            </div>
            <Button className={styles['sign-out-button']} onClick={() => void signOut()}>
                {t('CINE_SIGN_OUT', { defaultValue: 'Sair da conta' })}
            </Button>
        </Section>
    );
});

export default Subscription;

import React from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { usePlatform } from 'stremio/common';
import { Button } from 'stremio/components';
import { useAuth } from 'stremio/auth/AuthProvider';
import { SECTIONS } from '../constants';
import styles from './Menu.less';

type Props = {
    selected: string,
    onSelect: (event: React.MouseEvent<HTMLDivElement>) => void,
};

const Menu = ({ selected, onSelect }: Props) => {
    const { t } = useTranslation();
    const { shell } = usePlatform();
    const platform = usePlatform();
    const { signOut } = useAuth();
    const appName = t('APP_NAME', { defaultValue: 'CINE RESENHA' });
    const settingsTitle = t('SETTINGS_MENU_TITLE', { defaultValue: 'Configurações' });

    return (
        <div className={styles['menu']}>
            <div className={styles['brand']}>
                <span className={styles['brand-mark']} />
                <span>{appName}</span>
            </div>
            <div className={styles['menu-title']}>{settingsTitle}</div>
            <Button className={classNames(styles['button'], { [styles['selected']]: selected === SECTIONS.GENERAL })} title={t('SETTINGS_NAV_GENERAL')} data-section={SECTIONS.GENERAL} onClick={onSelect}>
                { t('SETTINGS_NAV_GENERAL') }
            </Button>
            <Button className={classNames(styles['button'], { [styles['selected']]: selected === SECTIONS.INTERFACE })} title={t('INTERFACE')} data-section={SECTIONS.INTERFACE} onClick={onSelect}>
                { t('INTERFACE') }
            </Button>
            <Button className={classNames(styles['button'], { [styles['selected']]: selected === SECTIONS.PLAYER })} title={t('SETTINGS_NAV_PLAYER')} data-section={SECTIONS.PLAYER} onClick={onSelect}>
                { t('SETTINGS_NAV_PLAYER') }
            </Button>
            <Button className={classNames(styles['button'], { [styles['selected']]: selected === SECTIONS.SUBSCRIPTION })} title={t('CINE_MANAGE_SUBSCRIPTION', { defaultValue: 'Gerenciar assinatura' })} data-section={SECTIONS.SUBSCRIPTION} onClick={onSelect}>
                {t('CINE_MANAGE_SUBSCRIPTION', { defaultValue: 'Gerenciar assinatura' })}
            </Button>
            { !platform.isMobile && <Button className={classNames(styles['button'], { [styles['selected']]: selected === SECTIONS.SHORTCUTS })} title={t('SETTINGS_NAV_SHORTCUTS')} data-section={SECTIONS.SHORTCUTS} onClick={onSelect}>
                { t('SETTINGS_NAV_SHORTCUTS') }
            </Button> }

            <div className={styles['spacing']} />
            <Button
                className={classNames(styles['button'], styles['sign-out-button'])}
                title={t('CINE_SIGN_OUT', { defaultValue: 'Sair da conta' })}
                onClick={() => void signOut()}
            >
                {t('CINE_SIGN_OUT', { defaultValue: 'Sair da conta' })}
            </Button>
            <div className={styles['version-info-label']}>
                {t('APP_BRAND_VERSION', { defaultValue: 'v5 CaTaLyST' })}
            </div>
            {
                typeof shell.state.version === 'string' &&
                    <div className={styles['version-info-label']} title={shell.state.version}>
                        {t('SETTINGS_SHELL_VERSION')}: {shell.state.version}
                    </div>
            }
        </div>
    );
};

export default Menu;

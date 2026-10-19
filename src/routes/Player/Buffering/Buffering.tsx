import React, { forwardRef, useMemo } from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { Image } from 'stremio/components';
import styles from './Buffering.less';

type Props = {
    className: string,
    logo?: string | null,
    progress: number,
    title?: string | null,
    season?: number | null,
    episode?: number | null,
};

const Buffering = forwardRef<HTMLDivElement, Props>(({ className, logo, progress, title, season, episode }, ref) => {
    const { t } = useTranslation();
    const style = useMemo(() => {
        return {
            clipPath: `inset(0 ${100 - progress}% 0 0)`,
        };
    }, [progress]);

    return (
        <div ref={ref} className={classNames(className, styles['buffering'])}>
            <Image
                className={styles['logo']}
                style={style}
                src={logo}
                alt={' '}
                fallbackSrc={require('/assets/images/icon_r.svg')}
            />
            <Image
                className={classNames(styles['logo'], styles['background'])}
                src={logo}
                alt={' '}
                fallbackSrc={require('/assets/images/icon_r.svg')}
            />
            <div className={styles['details']}>
                <span className={styles['status']}>{t('PLAYER_BUFFERING_STATUS', { defaultValue: 'PREPARANDO SUA SESSÃO' })}</span>
                {title ? <span className={styles['title']}>{title}</span> : null}
                {Number.isFinite(season) && Number.isFinite(episode) ?
                    <span className={styles['episode']}>{t('PLAYER_BUFFERING_EPISODE', { defaultValue: 'Temporada' })} {season} · {t('PLAYER_BUFFERING_EPISODE_LABEL', { defaultValue: 'Episódio' })} {episode}</span>
                    :
                    null}
            </div>
        </div>
    );
});

export default Buffering;

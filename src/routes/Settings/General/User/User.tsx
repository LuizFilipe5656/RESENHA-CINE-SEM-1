import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCore } from 'stremio/core';
import { Link } from '../../components';
import useLocalProfile from 'stremio/common/useLocalProfile';
import styles from './User.less';

type Props = {
    profile: Profile,
};

const User = ({ profile }: Props) => {
    const { t } = useTranslation();
    const core = useCore();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [localProfile, updateLocalProfile, saveAvatar] = useLocalProfile();
    const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
    const [draftAvatar, setDraftAvatar] = useState<string | null>(null);
    const [draftPosition, setDraftPosition] = useState({ x: 50, y: 50, zoom: 100 });

    const isLocalMode = !profile.auth;
    const avatarPosition = useMemo(() => localProfile.avatarPosition || { x: 50, y: 50, zoom: 100 }, [localProfile.avatarPosition]);

    const avatar = useMemo(() => {
        if (isLocalMode) {
            return localProfile.avatar ?
                `url('${localProfile.avatar}')`
                :
                `radial-gradient(circle at 30% 20%, #c4b5fd, #7c3aed 48%, #1f1233 100%)`;
        }

        return profile.auth.user.avatar ?
            `url('${profile.auth.user.avatar}')`
            :
            `url('${require('/assets/images/default_avatar.png')}')`;
    }, [isLocalMode, localProfile.avatar, profile.auth]);

    const avatarStyle = useMemo(() => ({
        backgroundImage: avatar.includes('gradient') ? undefined : avatar,
        background: avatar.includes('gradient') ? avatar : undefined,
        backgroundPosition: `${avatarPosition.x}% ${avatarPosition.y}%`,
        backgroundSize: `${avatarPosition.zoom}% ${avatarPosition.zoom}%`,
    }), [avatar, avatarPosition]);

    const displayName = isLocalMode ? localProfile.displayName : (profile.auth === null ? t('ANONYMOUS_USER') : profile.auth.user.email);

    const onLogout = useCallback(() => {
        core.transport.dispatch({
            action: 'Ctx',
            args: {
                action: 'Logout'
            }
        });
    }, []);

    const onAvatarSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : null;
            if (!result) return;
            setDraftAvatar(result);
            setDraftPosition(localProfile.avatarPosition || { x: 50, y: 50, zoom: 100 });
            setAvatarEditorOpen(true);
        };
        reader.readAsDataURL(file);

        if (event.target) {
            event.target.value = '';
        }
    }, [localProfile.avatarPosition]);

    const onNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        updateLocalProfile({ displayName: event.currentTarget.value.slice(0, 24) });
    }, [updateLocalProfile]);

    const updateDraftPosition = useCallback((key: 'x' | 'y' | 'zoom', value: number) => {
        setDraftPosition((current) => ({
            ...current,
            [key]: value
        }));
    }, []);

    const applyAvatar = useCallback(() => {
        if (!draftAvatar) return;
        updateLocalProfile({
            avatar: draftAvatar,
            avatarPosition: draftPosition
        });
        setAvatarEditorOpen(false);
    }, [draftAvatar, draftPosition, updateLocalProfile]);

    return (
        <div className={styles['user']}>
            <div className={styles['user-panel-card']}>
                <div className={styles['profile-header']}>
                    <span className={styles['profile-badge']}>{t('PROFILE_ACTIVE', { defaultValue: 'Perfil ativo' })}</span>
                    <span className={styles['profile-status']}>
                        <span className={styles['status-dot']} />
                        {isLocalMode ? 'Local' : 'Conta'}
                    </span>
                </div>

                <div className={styles['user-info-content']}>
                    <div
                        className={styles['avatar-container']}
                        style={avatarStyle}
                    />

                    <div className={styles['email-logout-container']}>
                        <div className={styles['email-label-container']} title={displayName}>
                            <div className={styles['email-label']}>
                                {displayName}
                            </div>
                        </div>

                        <div className={styles['profile-subtitle']}>
                            {isLocalMode ? 'Ajuste o nome e a foto do seu perfil' : 'Gerencie sua conta e preferências'}
                        </div>
                    </div>
                </div>

                {
                    isLocalMode ?
                        <div className={styles['profile-editor']}>
                            <input
                                className={styles['name-input']}
                                value={localProfile.displayName}
                                onChange={onNameChange}
                                maxLength={24}
                                placeholder={'Seu nome'}
                            />
                            <input
                                ref={fileInputRef}
                                type={'file'}
                                accept={'image/*'}
                                hidden
                                onChange={onAvatarSelect}
                            />
                            <button type={'button'} className={styles['file-button']} onClick={() => fileInputRef.current?.click()}>
                                {t('PROFILE_CHOOSE_PHOTO', { defaultValue: 'Escolher foto' })}
                            </button>
                        </div>
                        :
                        <div className={styles['profile-actions']}>
                            <Link
                                label={t('LOG_OUT')}
                                onClick={onLogout}
                            />
                        </div>
                }
            </div>

            {
                avatarEditorOpen && draftAvatar &&
                    <div className={styles['avatar-editor-overlay']} onClick={() => setAvatarEditorOpen(false)}>
                        <div className={styles['avatar-editor-modal']} onClick={(event) => event.stopPropagation()}>
                            <div className={styles['avatar-editor-header']}>
                                <span>{t('PROFILE_EDIT_IMAGE', { defaultValue: 'Editar imagem' })}</span>
                                <button type={'button'} className={styles['close-editor']} onClick={() => setAvatarEditorOpen(false)} aria-label={'Fechar editor'}>
                                    ×
                                </button>
                            </div>

                            <div className={styles['avatar-editor-stage']}>
                                <div
                                    className={styles['avatar-editor-preview']}
                                    style={{
                                        backgroundImage: `url('${draftAvatar}')`,
                                        backgroundPosition: `${draftPosition.x}% ${draftPosition.y}%`,
                                        backgroundSize: `${draftPosition.zoom}% ${draftPosition.zoom}%`
                                    }}
                                />
                            </div>

                            <div className={styles['avatar-editor-controls']}>
                                <button type={'button'} className={styles['icon-button']} aria-label={'Ajustar foto'}>
                                    <span>◌</span>
                                </button>
                                <input type={'range'} min={0} max={100} value={draftPosition.x} onChange={(event) => updateDraftPosition('x', Number(event.currentTarget.value))} />
                                <button type={'button'} className={styles['icon-button']} aria-label={'Zoom'}>
                                    <span>◍</span>
                                </button>
                                <button type={'button'} className={styles['icon-button']} aria-label={'Posição'}>
                                    <span>✦</span>
                                </button>
                            </div>

                            <div className={styles['avatar-editor-footer']}>
                                <button type={'button'} className={styles['ghost-action']} onClick={() => setAvatarEditorOpen(false)}>{t('BUTTON_CANCEL', { defaultValue: 'Cancelar' })}</button>
                                <button type={'button'} className={styles['primary-action']} onClick={applyAvatar}>{t('BUTTON_APPLY', { defaultValue: 'Aplicar' })}</button>
                            </div>
                        </div>
                    </div>
            }
        </div>
    );
};

export default User;

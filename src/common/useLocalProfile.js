// Copyright (C) 2017-2024 Smart code 203358507

const React = require('react');

const STORAGE_KEY = 'resenha-cine-local-profile';

const defaultAvatarPosition = {
    x: 50,
    y: 50,
    zoom: 100
};

const normalizeAvatarPosition = (value) => {
    if (!value || typeof value !== 'object') {
        return { ...defaultAvatarPosition };
    }

    const x = Number.isFinite(Number(value.x)) ? Math.min(100, Math.max(0, Number(value.x))) : 50;
    const y = Number.isFinite(Number(value.y)) ? Math.min(100, Math.max(0, Number(value.y))) : 50;
    const zoom = Number.isFinite(Number(value.zoom)) ? Math.min(180, Math.max(100, Number(value.zoom))) : 100;

    return {
        x,
        y,
        zoom
    };
};

const defaultProfile = {
    id: 'visitante',
    displayName: 'Visitante',
    avatar: '',
    accent: '#a78bfa',
    avatarPosition: { ...defaultAvatarPosition }
};

const createProfileId = () => `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeProfile = (value, fallback = defaultProfile) => {
    if (!value || typeof value !== 'object') {
        return {
            ...fallback,
            id: fallback.id || createProfileId()
        };
    }

    const displayName = typeof value.displayName === 'string' && value.displayName.trim().length > 0 ? value.displayName.trim() : fallback.displayName;
    const avatar = typeof value.avatar === 'string' ? value.avatar : '';
    const accent = typeof value.accent === 'string' && value.accent.length > 0 ? value.accent : fallback.accent;
    const avatarPosition = normalizeAvatarPosition(value.avatarPosition || fallback.avatarPosition);

    return {
        id: typeof value.id === 'string' && value.id.length > 0 ? value.id : fallback.id || createProfileId(),
        displayName,
        avatar,
        accent,
        avatarPosition
    };
};

const readProfileState = () => {
    const fallbackProfile = { ...defaultProfile, id: defaultProfile.id };

    if (typeof window === 'undefined') {
        return {
            currentProfileId: fallbackProfile.id,
            profiles: [fallbackProfile]
        };
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {
                currentProfileId: fallbackProfile.id,
                profiles: [fallbackProfile]
            };
        }

        const parsed = JSON.parse(raw);
        const profiles = Array.isArray(parsed?.profiles) && parsed.profiles.length > 0 ?
            parsed.profiles.map((item) => normalizeProfile(item, fallbackProfile)) :
            [fallbackProfile];

        const currentProfileId = typeof parsed?.currentProfileId === 'string' && profiles.some((profile) => profile.id === parsed.currentProfileId) ?
            parsed.currentProfileId : profiles[0].id;

        return {
            currentProfileId,
            profiles
        };
    } catch (error) {
        console.warn('Failed to read local profiles', error);
        return {
            currentProfileId: fallbackProfile.id,
            profiles: [fallbackProfile]
        };
    }
};

const persistProfileState = (state) => {
    if (typeof window === 'undefined') {
        return;
    }

    const normalizedProfiles = (state.profiles || []).map((profile) => normalizeProfile(profile, defaultProfile));
    const nextState = {
        currentProfileId: state.currentProfileId || normalizedProfiles[0]?.id || defaultProfile.id,
        profiles: normalizedProfiles
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
};

const useLocalProfile = () => {
    const [state, setState] = React.useState(() => readProfileState());

    const profile = React.useMemo(() => {
        const current = state.profiles.find((item) => item.id === state.currentProfileId) || state.profiles[0] || defaultProfile;
        return normalizeProfile(current, defaultProfile);
    }, [state.currentProfileId, state.profiles]);

    const updateProfile = React.useCallback((nextProfile) => {
        setState((currentState) => {
            const nextProfiles = currentState.profiles.map((item) => {
                if (item.id !== currentState.currentProfileId) {
                    return item;
                }

                return normalizeProfile({ ...item, ...nextProfile }, defaultProfile);
            });

            const nextState = {
                ...currentState,
                profiles: nextProfiles
            };

            persistProfileState(nextState);
            return nextState;
        });
    }, []);

    const saveAvatar = React.useCallback(async (file) => {
        if (!file || typeof FileReader === 'undefined') {
            return null;
        }

        const reader = new FileReader();

        return new Promise((resolve, reject) => {
            reader.onload = () => {
                const result = typeof reader.result === 'string' ? reader.result : '';
                updateProfile({ avatar: result });
                resolve(result);
            };
            reader.onerror = () => reject(new Error('Failed to read avatar file'));
            reader.readAsDataURL(file);
        });
    }, [updateProfile]);

    const setCurrentProfile = React.useCallback((profileId) => {
        setState((currentState) => {
            if (!currentState.profiles.some((item) => item.id === profileId)) {
                return currentState;
            }

            const nextState = {
                ...currentState,
                currentProfileId: profileId
            };

            persistProfileState(nextState);
            return nextState;
        });
    }, []);

    const addProfile = React.useCallback((profileInput) => {
        const input = profileInput || {};
        const nextProfile = normalizeProfile({
            id: input.id || createProfileId(),
            displayName: input.displayName || `Perfil ${Date.now().toString().slice(-4)}`,
            avatar: input.avatar || '',
            accent: input.accent || '#a78bfa'
        }, defaultProfile);

        setState((currentState) => {
            const nextState = {
                currentProfileId: nextProfile.id,
                profiles: [...currentState.profiles, nextProfile]
            };

            persistProfileState(nextState);
            return nextState;
        });

        return nextProfile;
    }, []);

    const removeProfile = React.useCallback((profileId) => {
        setState((currentState) => {
            if (currentState.profiles.length <= 1) {
                return currentState;
            }

            const filteredProfiles = currentState.profiles.filter((item) => item.id !== profileId);
            const nextState = {
                currentProfileId: currentState.currentProfileId === profileId ? filteredProfiles[0].id : currentState.currentProfileId,
                profiles: filteredProfiles
            };

            persistProfileState(nextState);
            return nextState;
        });
    }, []);

    React.useEffect(() => {
        persistProfileState(state);
    }, [state]);

    return [profile, updateProfile, saveAvatar, {
        profiles: state.profiles,
        currentProfileId: state.currentProfileId,
        setCurrentProfile,
        addProfile,
        removeProfile
    }];
};

module.exports = useLocalProfile;

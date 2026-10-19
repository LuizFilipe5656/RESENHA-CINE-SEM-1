import { useMemo } from 'react';
import { useCore } from 'stremio/core';
import { INTERFACE_SCALES } from 'stremio/common/CONSTANTS';
import { normalizeInterfaceScale } from 'stremio/common/interfaceScale';

const useInterfaceOptions = (profile: Profile) => {
    const core = useCore();

    const interfaceLanguageSelect = useMemo(() => ({
        options: [{ value: 'pt-BR', label: 'Português' }],
        value: 'pt-BR',
        onSelect: () => undefined,
    }), []);

    const interfaceSize = useMemo(() => ({
        min: INTERFACE_SCALES[0],
        max: INTERFACE_SCALES[INTERFACE_SCALES.length - 1],
        step: 25,
        value: normalizeInterfaceScale(profile.settings.interfaceScale),
        options: INTERFACE_SCALES,
        onChange: (value: number) => {
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'UpdateSettings',
                    args: {
                        ...profile.settings,
                        interfaceScale: normalizeInterfaceScale(value)
                    }
                }
            });
        }
    }), [profile.settings, core.transport]);

    const escExitFullscreenToggle = useMemo(() => ({
        checked: profile.settings.escExitFullscreen,
        onClick: () => {
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'UpdateSettings',
                    args: {
                        ...profile.settings,
                        escExitFullscreen: !profile.settings.escExitFullscreen
                    }
                }
            });
        }
    }), [profile.settings]);

    const quitOnCloseToggle = useMemo(() => ({
        checked: profile.settings.quitOnClose,
        onClick: () => {
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'UpdateSettings',
                    args: {
                        ...profile.settings,
                        quitOnClose: !profile.settings.quitOnClose
                    }
                }
            });
        }
    }), [profile.settings]);

    const hideSpoilersToggle = useMemo(() => ({
        checked: profile.settings.hideSpoilers,
        onClick: () => {
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'UpdateSettings',
                    args: {
                        ...profile.settings,
                        hideSpoilers: !profile.settings.hideSpoilers
                    }
                }
            });
        }
    }), [profile.settings]);

    const gamepadSupportToggle = useMemo(() => ({
        checked: profile.settings.gamepadSupport,
        onClick: () => {
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'UpdateSettings',
                    args: {
                        ...profile.settings,
                        gamepadSupport: !profile.settings.gamepadSupport
                    }
                }
            });
        }
    }), [profile.settings]);

    return {
        interfaceLanguageSelect,
        interfaceSize,
        escExitFullscreenToggle,
        quitOnCloseToggle,
        hideSpoilersToggle,
        gamepadSupportToggle,
    };
};

export default useInterfaceOptions;

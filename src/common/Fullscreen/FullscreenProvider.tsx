// Copyright (C) 2017-2026 Smart code 203358507

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withCoreSuspender } from '../CoreSuspender';
import { getKeyboardShortcutKey } from '../Shortcuts';
import useShortcut from '../Shortcuts/useShortcut';
import useSettings from '../useSettings';
import FullscreenContext, { type FullscreenContextValue } from './FullscreenContext';
import { usePlatform } from '../Platform';

type Props = {
    children: React.ReactNode,
};

type DesktopWindowBridge = {
    setFullscreen: (fullscreen: boolean) => Promise<void>,
    onFullscreenChanged: (callback: (fullscreen: boolean) => void) => () => void,
    isCredentialStorageAvailable: () => Promise<boolean>,
    getRememberedAdminCredentials: () => Promise<{ username: string, password: string } | null>,
    setRememberedAdminCredentials: (credentials: { username: string, password: string } | null) => Promise<void>,
};

declare global {
    interface Window {
        cineResenhaWindow?: DesktopWindowBridge,
    }
}

const hasWebkitFullscreen = typeof HTMLVideoElement !== 'undefined' &&
    typeof HTMLVideoElement.prototype.webkitEnterFullscreen === 'function';

const FullscreenProvider = ({ children }: Props) => {
    const { shell } = usePlatform();
    const desktopWindow = typeof window !== 'undefined' ? window.cineResenhaWindow : undefined;
    const [settings] = useSettings();
    const escExitFullscreen = settings.escExitFullscreen;

    const videoElementRef = useRef<HTMLVideoElement | null>(null);
    const [hasVideoElement, setHasVideoElement] = useState(false);

    const [fullscreen, setFullscreen] = useState<boolean>(() => {
        if (typeof document === 'undefined') return false;
        return document.fullscreenElement === document.documentElement;
    });

    const setVideoElement = useCallback((el: HTMLVideoElement | null) => {
        videoElementRef.current = el;
        setHasVideoElement(el !== null);
    }, []);

    const supported = Boolean(desktopWindow) || shell.active || document.fullscreenEnabled === true || (hasVideoElement && hasWebkitFullscreen);

    const requestFullscreen = useCallback(async () => {
        if (desktopWindow) {
            await desktopWindow.setFullscreen(true);
        } else if (shell.active) {
            shell.send('win-set-visibility', { fullscreen: true });
        } else if (document.fullscreenEnabled) {
            try {
                await document.documentElement.requestFullscreen();
            } catch (err) {
                console.error('Error enabling fullscreen', err);
            }
        } else if (videoElementRef.current && hasWebkitFullscreen) {
            (videoElementRef.current as any).webkitEnterFullscreen();
        }
    }, [desktopWindow, shell]);

    const exitFullscreen = useCallback(() => {
        if (desktopWindow) {
            desktopWindow.setFullscreen(false).catch((error) => {
                console.error('Error exiting fullscreen', error);
            });
        } else if (shell.active) {
            shell.send('win-set-visibility', { fullscreen: false });
        } else if (document.fullscreenElement === document.documentElement) {
            document.exitFullscreen();
        } else if (videoElementRef.current && (videoElementRef.current as any).webkitDisplayingFullscreen) {
            (videoElementRef.current as any).webkitExitFullscreen();
        }
    }, [desktopWindow, shell]);

    const toggleFullscreen = useCallback(() => {
        fullscreen ? exitFullscreen() : requestFullscreen();
    }, [fullscreen, exitFullscreen, requestFullscreen]);

    useShortcut('fullscreen', toggleFullscreen);

    useEffect(() => {
        document.documentElement.classList.toggle('is-fullscreen', fullscreen);

        return () => {
            document.documentElement.classList.remove('is-fullscreen');
        };
    }, [fullscreen]);

    useEffect(() => {
        const videoElement = videoElementRef.current;

        const onWindowVisibilityChanged = (state: WindowVisibility) => {
            setFullscreen(state.isFullscreen === true);
        };

        const onFullscreenChange = () => {
            setFullscreen(document.fullscreenElement === document.documentElement);
        };

        const onWebkitFullscreenChange = () => {
            setFullscreen((videoElement as any)?.webkitDisplayingFullscreen === true);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            const keyboardKey = getKeyboardShortcutKey(event);

            if (keyboardKey === 'Escape' && escExitFullscreen) {
                exitFullscreen();
            }

            if (keyboardKey === 'F11' && (shell.active || desktopWindow)) {
                toggleFullscreen();
            }
        };

        const unsubscribeDesktopFullscreen = desktopWindow?.onFullscreenChanged(setFullscreen);
        shell.on('win-visibility-changed', onWindowVisibilityChanged);
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('fullscreenchange', onFullscreenChange);
        videoElement?.addEventListener('webkitbeginfullscreen', onWebkitFullscreenChange);
        videoElement?.addEventListener('webkitendfullscreen', onWebkitFullscreenChange);

        return () => {
            shell.off('win-visibility-changed', onWindowVisibilityChanged);
            unsubscribeDesktopFullscreen?.();
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('fullscreenchange', onFullscreenChange);
            videoElement?.removeEventListener('webkitbeginfullscreen', onWebkitFullscreenChange);
            videoElement?.removeEventListener('webkitendfullscreen', onWebkitFullscreenChange);
        };
    }, [desktopWindow, shell, toggleFullscreen, exitFullscreen, escExitFullscreen, hasVideoElement]);

    const value = useMemo<FullscreenContextValue>(
        () => [fullscreen, requestFullscreen, exitFullscreen, toggleFullscreen, supported, setVideoElement],
        [fullscreen, requestFullscreen, exitFullscreen, toggleFullscreen, supported, setVideoElement]
    );

    return (
        <FullscreenContext.Provider value={value}>
            {children}
        </FullscreenContext.Provider>
    );
};

export default withCoreSuspender(FullscreenProvider);

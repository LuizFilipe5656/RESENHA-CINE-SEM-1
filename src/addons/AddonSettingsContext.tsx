import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppAnnouncement, getAppSettings } from '../auth/api';

type AddonSettingsValue = {
    addonsTabVisible: boolean,
    addonSettingsLoaded: boolean,
    maintenanceEnabled: boolean,
    maintenanceMessage: string,
    announcements: AppAnnouncement[],
    refreshAddonSettings: () => Promise<void>,
};

const AddonSettingsContext = createContext<AddonSettingsValue>({
    addonsTabVisible: false,
    addonSettingsLoaded: false,
    maintenanceEnabled: false,
    maintenanceMessage: '',
    announcements: [],
    refreshAddonSettings: async () => undefined,
});

const AddonSettingsProvider = ({ children }: { children: React.ReactNode }) => {
    const [addonsTabVisible, setAddonsTabVisible] = useState(false);
    const [addonSettingsLoaded, setAddonSettingsLoaded] = useState(false);
    const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
    const [maintenanceMessage, setMaintenanceMessage] = useState('');
    const [announcements, setAnnouncements] = useState<AppAnnouncement[]>([]);
    const mounted = useRef(false);

    const refreshAddonSettings = useCallback(async () => {
        try {
            const settings = await getAppSettings();
            if (mounted.current) {
                setAddonsTabVisible(settings.addonsTabVisible);
                setMaintenanceEnabled(settings.maintenanceEnabled);
                setMaintenanceMessage(settings.maintenanceMessage);
                if (!Array.isArray(settings.announcements)) {
                    throw new Error('O servidor online retornou uma lista de avisos inválida.');
                }
                setAnnouncements(settings.announcements);
            }
        } finally {
            if (mounted.current) setAddonSettingsLoaded(true);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        const refresh = () => {
            void refreshAddonSettings().catch((error) => {
                if (mounted.current) console.error('Failed to load Cine Resenha add-on settings:', error);
            });
        };
        const onFocus = () => refresh();

        refresh();
        const interval = window.setInterval(refresh, 60_000);
        window.addEventListener('focus', onFocus);

        return () => {
            mounted.current = false;
            window.clearInterval(interval);
            window.removeEventListener('focus', onFocus);
        };
    }, [refreshAddonSettings]);

    const value = useMemo(() => ({
        addonsTabVisible,
        addonSettingsLoaded,
        maintenanceEnabled,
        maintenanceMessage,
        announcements,
        refreshAddonSettings,
    }), [addonsTabVisible, addonSettingsLoaded, maintenanceEnabled, maintenanceMessage, announcements, refreshAddonSettings]);
    return <AddonSettingsContext.Provider value={value}>{children}</AddonSettingsContext.Provider>;
};

const useAddonSettings = () => useContext(AddonSettingsContext);

export { AddonSettingsProvider, useAddonSettings };

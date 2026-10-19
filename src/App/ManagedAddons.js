const React = require('react');
const { useCore } = require('stremio/core');
const useToast = require('stremio/common/Toast/useToast');
const useInstalledAddons = require('../routes/Addons/useInstalledAddons');
const { REQUIRED_ADDONS, isManagedAddon } = require('../addons/managedAddons');

const fetchAddon = async ({ url, id }) => {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) {
        throw new Error(`Não foi possível carregar o manifesto do addon ${id} (HTTP ${response.status}).`);
    }

    const manifest = await response.json();
    if (!manifest || typeof manifest.id !== 'string' || !Array.isArray(manifest.types)) {
        throw new Error(`O manifesto do addon ${id} está inválido.`);
    }

    return {
        manifest: {
            ...manifest,
            behaviorHints: manifest.behaviorHints && typeof manifest.behaviorHints === 'object' ?
                manifest.behaviorHints :
                {},
        },
        transportUrl: url,
    };
};

const ManagedAddons = () => {
    const core = useCore();
    const toast = useToast();
    const urlParams = React.useMemo(() => ({}), []);
    const installedAddons = useInstalledAddons(urlParams);
    const attemptedUrls = React.useRef(new Set());

    React.useEffect(() => {
        if (installedAddons.selected === null || !Array.isArray(installedAddons.catalog)) return;

        const installed = installedAddons.catalog.filter((addon) => addon.installed);
        installed.forEach((addon) => {
            const managed = REQUIRED_ADDONS.find((requiredAddon) => isManagedAddon(addon) &&
                (addon.transportUrl === requiredAddon.url || addon.manifest?.id === requiredAddon.id));
            if (managed) attemptedUrls.current.delete(managed.url);
        });
        const missing = REQUIRED_ADDONS.filter((addon) =>
            !installed.some((installedAddon) => isManagedAddon(installedAddon) &&
                (installedAddon.transportUrl === addon.url || installedAddon.manifest?.id === addon.id))
        );

        missing.forEach(({ url, id }) => {
            if (attemptedUrls.current.has(url)) return;
            attemptedUrls.current.add(url);
            void fetchAddon({ url, id }).then((addon) => {
                core.transport.dispatch({
                    action: 'Ctx',
                    args: {
                        action: 'InstallAddon',
                        args: addon,
                    },
                });
            }).catch((error) => {
                attemptedUrls.current.delete(url);
                console.error(`Failed to install managed add-on ${id}:`, error);
                toast.show({
                    type: 'error',
                    title: `Não foi possível ativar o addon ${id}. Verifique sua conexão.`,
                    timeout: 10000,
                });
            });
        });
    }, [core.transport, installedAddons, toast]);

    return null;
};

module.exports = ManagedAddons;

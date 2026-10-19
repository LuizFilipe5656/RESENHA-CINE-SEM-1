// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { useNavigate, useParams } = require('react-router');
const { useSearchParams } = require('react-router-dom');
const classnames = require('classnames');
const { useTranslation } = require('react-i18next');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { useCore } = require('stremio/core');
const { usePlatform, useBinaryState, withCoreSuspender } = require('stremio/common');
const { AddonDetailsModal, Button, Image, MainNavBars, ModalDialog, SearchBar, SharePrompt, TextInput, MultiselectMenu } = require('stremio/components');
const useToast = require('stremio/common/Toast/useToast');
const Addon = require('./Addon');
const useInstalledAddons = require('./useInstalledAddons');
const useRemoteAddons = require('./useRemoteAddons');
const useAddonDetailsTransportUrl = require('./useAddonDetailsTransportUrl');
const useSelectableInputs = require('./useSelectableInputs');
const styles = require('./styles');
const { AddonPlaceholder } = require('./AddonPlaceholder');
const { useAddonSettings } = require('../../addons/AddonSettingsContext');
const { REQUIRED_ADDONS, isManagedAddon } = require('../../addons/managedAddons');

const PRESET_ADDON_OPTIONS = REQUIRED_ADDONS;

const Addons = () => {
    const { type, transportUrl, catalogId } = useParams();
    const [queryParams] = useSearchParams();
    const urlParams = React.useMemo(() => ({
        type,
        transportUrl,
        catalogId
    }), [type, transportUrl, catalogId]);
    const { t } = useTranslation();
    const { addonsTabVisible, addonSettingsLoaded } = useAddonSettings();
    const navigate = useNavigate();
    const platform = usePlatform();
    const core = useCore();
    const toast = useToast();
    const installedAddons = useInstalledAddons(urlParams);
    const remoteAddons = useRemoteAddons(urlParams);
    const [addonDetailsTransportUrl, setAddonDetailsTransportUrl] = useAddonDetailsTransportUrl(urlParams);
    const selectInputs = useSelectableInputs(installedAddons, remoteAddons);
    const [filtersModalOpen, openFiltersModal, closeFiltersModal] = useBinaryState(false);
    const [addAddonModalOpen, openAddAddonModal, closeAddAddonModal] = useBinaryState(false);
    const addAddonUrlInputRef = React.useRef(null);
    const openWebAddonModal = React.useCallback((presetUrl = '') => {
        openAddAddonModal();
        requestAnimationFrame(() => {
            if (addAddonUrlInputRef.current !== null) {
                addAddonUrlInputRef.current.value = presetUrl || '';
                if (presetUrl) {
                    addAddonUrlInputRef.current.focus();
                    addAddonUrlInputRef.current.setSelectionRange(presetUrl.length, presetUrl.length);
                }
            }
        });
    }, [openAddAddonModal]);
    const copyAddonUrl = React.useCallback(async (url) => {
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(url);
                toast.show({
                    type: 'success',
                    title: 'URL do addon copiada',
                    timeout: 2000
                });
                return;
            }
        } catch (error) {
            console.error('Failed to copy addon url:', error);
        }

        openWebAddonModal(url);
    }, [toast, openWebAddonModal]);
    const addAddonOnSubmit = React.useCallback(() => {
        if (addAddonUrlInputRef.current !== null) {
            try {
                let url = new URL(addAddonUrlInputRef.current.value).toString();
                setAddonDetailsTransportUrl(url);
                closeAddAddonModal();
            } catch (e) {
                toast.show({
                    type: 'error',
                    title: `Failed to parse addon url: ${addAddonUrlInputRef.current.value}`,
                    timeout: 10000
                });
                console.error('Failed to parse addon url:', e);
            }
        }
    }, [setAddonDetailsTransportUrl, closeAddAddonModal, toast]);
    const addAddonModalButtons = React.useMemo(() => {
        return [
            {
                className: styles['cancel-button'],
                label: t('BUTTON_CANCEL'),
                props: {
                    onClick: closeAddAddonModal
                }
            },
            {
                label: t('ADDON_ADD'),
                props: {
                    onClick: addAddonOnSubmit
                }
            }
        ];
    }, [addAddonOnSubmit, closeAddAddonModal, t]);
    const [search, setSearch] = React.useState('');
    const [activeAddonTab, setActiveAddonTab] = React.useState('catalog');
    const searchInputOnChange = React.useCallback((event) => {
        setSearch(event.currentTarget.value);
    }, []);
    const [sharedAddon, setSharedAddon] = React.useState(null);
    React.useEffect(() => {
        if (addonSettingsLoaded && !addonsTabVisible) {
            navigate('/', { replace: true });
        }
    }, [addonSettingsLoaded, addonsTabVisible, navigate]);
    const clearSharedAddon = React.useCallback(() => {
        setSharedAddon(null);
    }, []);
    const onAddonShare = React.useCallback((event) => {
        setSharedAddon(event.dataset.addon);
    }, []);
    const onAddonInstall = React.useCallback((event) => {
        core.transport.dispatch({
            action: 'Ctx',
            args: {
                action: 'InstallAddon',
                args: event.dataset.addon,
            }
        });
    }, [core.transport]);
    const onAddonUninstall = React.useCallback((event) => {
        if (isManagedAddon(event.dataset.addon)) return;
        core.transport.dispatch({
            action: 'Ctx',
            args: {
                action: 'UninstallAddon',
                args: event.dataset.addon,
            }
        });
    }, [core.transport]);
    const onAddonConfigure = React.useCallback((event) => {
        platform.openExternal(event.dataset.addon.transportUrl.replace('manifest.json', 'configure'));
    }, [platform]);
    const onAddonOpen = React.useCallback((event) => {
        setAddonDetailsTransportUrl(event.dataset.addon.transportUrl);
    }, [setAddonDetailsTransportUrl]);
    const closeAddonDetails = React.useCallback(() => {
        setAddonDetailsTransportUrl(null);
    }, [setAddonDetailsTransportUrl]);
    const searchFilterPredicate = React.useCallback((addon) => {
        return search.length === 0 ||
            (
                (typeof addon.manifest.name === 'string' && addon.manifest.name.toLowerCase().includes(search.toLowerCase())) ||
                (typeof addon.manifest.description === 'string' && addon.manifest.description.toLowerCase().includes(search.toLowerCase()))
            );
    }, [search]);
    const renderLogoFallback = React.useCallback(() => (
        <Icon className={styles['icon']} name={'addons'} />
    ), []);
    React.useLayoutEffect(() => {
        closeAddAddonModal();
        setSearch('');
        clearSharedAddon();
    }, [urlParams, queryParams, closeAddAddonModal, clearSharedAddon]);
    return (
        <MainNavBars className={styles['addons-container']} route={'addons'}>
            <div className={styles['addons-content']}>
                <div className={styles['addons-tabs']} role={'tablist'} aria-label={t('ADDONS_TABS', { defaultValue: 'Seções de addons' })}>
                    <button
                        className={activeAddonTab === 'catalog' ? styles['addons-tab-selected'] : ''}
                        type={'button'}
                        role={'tab'}
                        aria-selected={activeAddonTab === 'catalog'}
                        onClick={() => setActiveAddonTab('catalog')}
                    >
                        {t('ADDONS_CATALOG_TAB', { defaultValue: 'Catálogo' })}
                    </button>
                    <button
                        className={activeAddonTab === 'quick' ? styles['addons-tab-selected'] : ''}
                        type={'button'}
                        role={'tab'}
                        aria-selected={activeAddonTab === 'quick'}
                        onClick={() => setActiveAddonTab('quick')}
                    >
                        {t('ADDON_PRESET_TITLE', { defaultValue: 'Addons rápidos' })}
                    </button>
                </div>
                {activeAddonTab === 'catalog' ?
                    <>
                        <div className={styles['selectable-inputs-container']}>
                            {selectInputs.map((selectInput, index) => (
                                <MultiselectMenu
                                    {...selectInput}
                                    key={index}
                                    className={styles['select-input-container']}
                                />
                            ))}
                            <div className={styles['spacing']} />
                            <Button className={styles['add-button-container']} title={t('ADD_ADDON')} onClick={() => openWebAddonModal()}>
                                <Icon className={styles['icon']} name={'add'} />
                                <div className={styles['add-button-label']}>{t('ADD_ADDON')}</div>
                            </Button>
                            <SearchBar
                                className={styles['search-bar']}
                                title={t('ADDON_SEARCH')}
                                value={search}
                                onChange={searchInputOnChange}
                            />
                            <Button className={styles['filter-button']} title={t('ALL_FILTERS')} onClick={openFiltersModal}>
                                <Icon className={styles['filter-icon']} name={'filters'} />
                            </Button>
                        </div>
                        {
                            installedAddons.selected !== null ?
                                installedAddons.selectable.types.length === 0 ?
                                    <div className={styles['message-container']}>
                                        {t('NO_ADDONS')}
                                    </div>
                                    :
                                    installedAddons.catalog.length === 0 ?
                                        <div className={styles['message-container']}>
                                            {t('NO_ADDONS_FOR_TYPE')}
                                        </div>
                                        :
                                        <div className={styles['addons-list-container']}>
                                            {
                                                installedAddons.catalog
                                                    .filter(searchFilterPredicate)
                                                    .map((addon, index) => (
                                                        <Addon
                                                            key={index}
                                                            className={classnames(styles['addon'], 'animation-fade-in')}
                                                            id={addon.manifest.id}
                                                            name={addon.manifest.name}
                                                            version={addon.manifest.version}
                                                            logo={addon.manifest.logo}
                                                            description={addon.manifest.description}
                                                            types={addon.manifest.types}
                                                            behaviorHints={addon.manifest.behaviorHints}
                                                            installed={addon.installed}
                                                            managed={isManagedAddon(addon)}
                                                            onInstall={onAddonInstall}
                                                            onUninstall={onAddonUninstall}
                                                            onConfigure={onAddonConfigure}
                                                            onOpen={onAddonOpen}
                                                            onShare={onAddonShare}
                                                            dataset={{ addon }}
                                                        />
                                                    ))
                                            }
                                        </div>
                                :
                                remoteAddons.selected !== null ?
                                    remoteAddons.catalog.content.type === 'Err' ?
                                        <div className={styles['message-container']}>
                                            {remoteAddons.catalog.content.content}
                                        </div>
                                        :
                                        remoteAddons.catalog.content.type === 'Loading' ?
                                            <div className={styles['addons-list-container']}>
                                                {Array.from({ length: 6 }).map((_, index) => (
                                                    <AddonPlaceholder key={index} className={styles['addon']} />
                                                ))}
                                            </div>
                                            :
                                            <div className={styles['addons-list-container']}>
                                                {
                                                    remoteAddons.catalog.content.content
                                                        .filter(searchFilterPredicate)
                                                        .map((addon, index) => (
                                                            <Addon
                                                                key={index}
                                                                className={classnames(styles['addon'], 'animation-fade-in')}
                                                                id={addon.manifest.id}
                                                                name={addon.manifest.name}
                                                                version={addon.manifest.version}
                                                                logo={addon.manifest.logo}
                                                                description={addon.manifest.description}
                                                                types={addon.manifest.types}
                                                                behaviorHints={addon.manifest.behaviorHints}
                                                                installed={addon.installed}
                                                                managed={isManagedAddon(addon)}
                                                                onInstall={onAddonInstall}
                                                                onUninstall={onAddonUninstall}
                                                                onConfigure={onAddonConfigure}
                                                                onOpen={onAddonOpen}
                                                                onShare={onAddonShare}
                                                                dataset={{ addon }}
                                                            />
                                                        ))
                                                }
                                            </div>
                                    :
                                    <div className={styles['addons-list-container']}>
                                        {Array.from({ length: 6 }).map((_, index) => (
                                            <AddonPlaceholder key={index} className={styles['addon']} />
                                        ))}
                                    </div>
                        }
                    </>
                    :
                    <div className={styles['quick-addons-page']}>
                        <div className={styles['preset-addon-panel']}>
                            <div className={styles['preset-addon-header']}>
                                <span className={styles['preset-addon-label']}>{t('ADDON_PRESET_TITLE', { defaultValue: 'Addons rápidos' })}</span>
                                <span className={styles['preset-addon-subtitle']}>{t('ADDON_PRESET_SUBTITLE', { defaultValue: 'Escolha um addon já pronto' })}</span>
                            </div>
                            <div className={styles['preset-addon-list']}>
                                {PRESET_ADDON_OPTIONS.map((addon) => (
                                    <div className={styles['preset-addon-card']} key={addon.id}>
                                        <div className={styles['preset-addon-copy']}>
                                            <span className={styles['preset-addon-name']}>{addon.name}</span>
                                            <span className={styles['preset-addon-url']}>{addon.url}</span>
                                        </div>
                                        <div className={styles['preset-addon-actions']}>
                                            <Button className={styles['preset-addon-button']} title={t('ADDON_USE', { defaultValue: `Usar ${addon.name}` })} onClick={() => openWebAddonModal(addon.url)}>
                                                {t('ADDON_USE_ACTION', { defaultValue: 'Usar' })}
                                            </Button>
                                            <Button className={styles['preset-addon-button']} title={t('ADDON_COPY_URL', { defaultValue: `Copiar URL de ${addon.name}` })} onClick={() => copyAddonUrl(addon.url)}>
                                                {t('ADDON_COPY_ACTION', { defaultValue: 'Copiar' })}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>}
            </div>
            {
                filtersModalOpen ?
                    <ModalDialog title={t('ADDONS_FILTERS')} className={styles['filters-modal']} onCloseRequest={closeFiltersModal}>
                        {selectInputs.map((selectInput, index) => (
                            <MultiselectMenu
                                {...selectInput}
                                key={index}
                                className={styles['select-input-container']}
                            />
                        ))}
                    </ModalDialog>
                    :
                    null
            }
            {
                addAddonModalOpen ?
                    <ModalDialog
                        className={styles['add-addon-modal-container']}
                        title={t('ADD_ADDON')}
                        buttons={addAddonModalButtons}
                        onCloseRequest={closeAddAddonModal}>
                        <div className={styles['notice']}>{t('ADD_ADDON_DESCRIPTION')}</div>
                        <TextInput
                            ref={addAddonUrlInputRef}
                            className={styles['addon-url-input']}
                            type={'text'}
                            placeholder={t('PASTE_ADDON_URL')}
                            autoFocus={true}
                            onSubmit={addAddonOnSubmit}
                        />
                    </ModalDialog>
                    :
                    null
            }
            {
                sharedAddon !== null ?
                    <ModalDialog
                        className={styles['share-modal-container']}
                        title={t('SHARE_ADDON')}
                        onCloseRequest={clearSharedAddon}>
                        <div className={styles['title-container']}>
                            <Image
                                className={styles['logo']}
                                src={sharedAddon.manifest.logo}
                                alt={' '}
                                renderFallback={renderLogoFallback}
                            />
                            <div className={styles['name-container']}>
                                <span className={styles['name']}>{typeof sharedAddon.manifest.name === 'string' && sharedAddon.manifest.name.length > 0 ? sharedAddon.manifest.name : sharedAddon.manifest.id}</span>
                                {
                                    typeof sharedAddon.manifest.version === 'string' && sharedAddon.manifest.version.length > 0 ?
                                        <span className={styles['version']}>{t('ADDON_VERSION_SHORT', { version: sharedAddon.manifest.version })}</span>
                                        :
                                        null
                                }
                            </div>
                        </div>
                        <SharePrompt
                            className={styles['share-prompt-container']}
                            url={sharedAddon.transportUrl}
                        />
                    </ModalDialog>
                    :
                    null
            }
            {
                typeof addonDetailsTransportUrl === 'string' ?
                    <AddonDetailsModal
                        transportUrl={addonDetailsTransportUrl}
                        onCloseRequest={closeAddonDetails}
                    />
                    :
                    null
            }
        </MainNavBars>
    );
};

const AddonsFallback = () => (
    <MainNavBars className={styles['addons-container']} route={'addons'} />
);

module.exports = withCoreSuspender(Addons, AddonsFallback);

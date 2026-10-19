// Copyright (C) 2017-2023 Smart code 203358507

const { useCallback } = require('react');
const { useTranslation } = require('react-i18next');

const stripAddonPrefix = (catalogName, addon) => {
    const addonNames = [
        addon?.manifest?.name,
        addon?.manifest?.id,
        'TMDB',
        'Cinemeta',
    ].filter((name) => typeof name === 'string' && name.trim().length > 0);

    return addonNames.reduce((name, addonName) => {
        const escapedAddonName = addonName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return name.replace(new RegExp(`^${escapedAddonName}\\s*[-:|–—]\\s*`, 'i'), '');
    }, catalogName);
};

const useTranslate = () => {
    const { t } = useTranslation();

    const string = useCallback((key) => t(key), [t]);

    const stringWithPrefix = useCallback((value, prefix, fallback = null) => {
        const key = `${prefix}${value}`;
        const defaultValue = fallback ?? value.charAt(0).toUpperCase() + value.slice(1);

        return t(key, {
            defaultValue,
        });
    }, [t]);

    const catalogTitle = useCallback(({ addon, id, name, type } = {}, withType = true) => {
        if (addon && id && name) {
            const partialKey = `${addon.manifest.id.split('.').join('_')}_${id}`;
            const translatedName = stringWithPrefix(partialKey, 'CATALOG_', name);
            const visibleName = stripAddonPrefix(translatedName, addon);

            if (type && withType) {
                const translatedType = stringWithPrefix(type, 'TYPE_');
                return `${visibleName} - ${translatedType}`;
            }

            return visibleName;
        }

        return null;
    }, [stringWithPrefix]);

    return {
        string,
        stringWithPrefix,
        catalogTitle,
    };
};

module.exports = useTranslate;
module.exports.stripAddonPrefix = stripAddonPrefix;

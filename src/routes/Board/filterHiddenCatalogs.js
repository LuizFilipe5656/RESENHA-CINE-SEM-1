// Copyright (C) 2017-2023 Smart code 203358507

const HIDDEN_CATALOG_PATTERNS = [
    /(^|\s|[-_])(youtube|yt)(\s|$|[-_])/i,
    /(^|\s|[-_])(?:canal|canais|channel|channels)(\s|$|[-_])/i,
    /public\s*domain/i,
    /dominio\s*publico/i,
    /publico/i,
    /videos\s*do\s*youtube/i,
    /youtube\s*.*(canais|canal)/i,
];

const normalizeCatalogText = (value = '') => {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
};

const getCatalogSearchText = (catalog) => {
    return [catalog?.name, catalog?.id, catalog?.addon?.manifest?.name]
        .filter(Boolean)
        .join(' ');
};

const isHiddenCatalog = (catalog) => {
    const haystack = normalizeCatalogText(getCatalogSearchText(catalog));
    return HIDDEN_CATALOG_PATTERNS.some((pattern) => pattern.test(haystack));
};

const filterHiddenCatalogs = (catalogs = []) => {
    return catalogs.filter((catalog) => !isHiddenCatalog(catalog));
};

const getCatalogAddonSource = (catalog) => {
    const addon = catalog?.addon?.manifest;
    const identity = `${addon?.id || ''} ${addon?.name || ''}`.toLowerCase();
    if (identity.includes('tmdb')) return 'tmdb';
    if (identity.includes('cinemeta')) return 'cinemeta';
    return null;
};

const isTmdbSeriesWithoutContent = (catalog) => {
    if (getCatalogAddonSource(catalog) !== 'tmdb' || catalog?.type?.toLowerCase() !== 'series') {
        return false;
    }

    const content = catalog.content;
    return content?.type === 'Ready' ?
        Array.isArray(content.content) && content.content.length === 0
        :
        content?.type === 'Err' && content.content === 'EmptyContent';
};

const mixTmdbAndCinemetaCatalogRows = (rows = []) => {
    const tmdbRows = [];
    const cinemetaRows = [];
    const otherRows = [];

    rows.forEach((row) => {
        const source = getCatalogAddonSource(row.catalog);
        if (source === 'tmdb') {
            tmdbRows.push(row);
        } else if (source === 'cinemeta') {
            cinemetaRows.push(row);
        } else {
            otherRows.push(row);
        }
    });

    const mixedRows = [];
    const rowCount = Math.max(tmdbRows.length, cinemetaRows.length);
    for (let index = 0; index < rowCount; index += 1) {
        if (tmdbRows[index]) mixedRows.push(tmdbRows[index]);
        if (cinemetaRows[index]) mixedRows.push(cinemetaRows[index]);
    }

    return mixedRows.concat(otherRows);
};

module.exports = {
    HIDDEN_CATALOG_PATTERNS,
    getCatalogSearchText,
    isHiddenCatalog,
    filterHiddenCatalogs,
    getCatalogAddonSource,
    isTmdbSeriesWithoutContent,
    mixTmdbAndCinemetaCatalogRows,
};

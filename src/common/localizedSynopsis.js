const { REQUIRED_ADDONS } = require('../addons/managedAddons');

const cache = new Map();
const pending = new Map();
const MAX_ENTRIES = 200;
const getMetadataId = (id) => {
    if (typeof id !== 'string') return null;
    if (/^(tt\d{7,10}|tmdb:\d+)$/.test(id)) return id;
    // The managed movie catalogs also use title-IMDB-number identifiers.
    const match = id.match(/^[a-z0-9]+(?:-[a-z0-9]+)*-(\d{7,10})$/i);
    return match ? `tt${match[1]}` : null;
};

const loadLocalizedSynopsis = (type, id) => {
    const metadataId = getMetadataId(id);
    if (!['movie', 'series'].includes(type) || !metadataId) return Promise.resolve(null);
    const key = `${type}:${metadataId}`;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.description);
    if (pending.has(key)) return pending.get(key);
    const addon = REQUIRED_ADDONS.find(({ id }) => id === 'TMDB');
    if (!addon) return Promise.resolve(null);
    const request = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        let description = null;
        try {
            const base = addon.url.replace(/\/manifest\.json$/, '');
            const response = await fetch(`${base}/meta/${type}/${encodeURIComponent(metadataId)}.json`, {
                signal: controller.signal,
                credentials: 'omit',
            });
            if (!response.ok) throw new Error('Metadata unavailable');
            const data = await response.json();
            if (data.meta?.id === metadataId && typeof data.meta.description === 'string') {
                description = data.meta.description.trim() || null;
            }
        } catch (_error) {
            // Metadata enrichment must never interrupt navigation or playback.
        } finally {
            clearTimeout(timeout);
        }
        if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(key, { description, expires: Date.now() + (description ? 3600000 : 60000) });
        pending.delete(key);
        return description;
    })();
    pending.set(key, request);
    return request;
};

module.exports = { getMetadataId, loadLocalizedSynopsis };

// Copyright (C) 2017-2023 Smart code 203358507

const {
    filterHiddenCatalogs,
    getCatalogAddonSource,
    isHiddenCatalog,
    isTmdbSeriesWithoutContent,
    mixTmdbAndCinemetaCatalogRows,
} = require('../src/routes/Board/filterHiddenCatalogs');

describe('hidden catalog filters', () => {
    it('hides YouTube and public domain catalogs from the board', () => {
        const catalogs = [
            { id: 'movies', name: 'Filmes' },
            { id: 'youtube', name: 'YouTube' },
            { id: 'public-domain', name: 'Filmes de domínio público' },
            { id: 'series', name: 'Séries' }
        ];

        expect(filterHiddenCatalogs(catalogs)).toEqual([
            { id: 'movies', name: 'Filmes' },
            { id: 'series', name: 'Séries' }
        ]);

        expect(isHiddenCatalog({ id: 'youtube', name: 'YouTube' })).toBe(true);
        expect(isHiddenCatalog({ id: 'movies', name: 'Filmes' })).toBe(false);
    });

    it('mixes TMDB and Cinemeta catalogs while preserving source order and other addons', () => {
        const rows = [
            { index: 0, catalog: { id: 'cinemeta-1', addon: { manifest: { id: 'cinemeta', name: 'Cinemeta' } } } },
            { index: 1, catalog: { id: 'other', addon: { manifest: { id: 'local', name: 'Local' } } } },
            { index: 2, catalog: { id: 'tmdb-1', addon: { manifest: { id: 'TMDB', name: 'TMDB' } } } },
            { index: 3, catalog: { id: 'cinemeta-2', addon: { manifest: { id: 'cinemeta', name: 'Cinemeta' } } } },
            { index: 4, catalog: { id: 'tmdb-2', addon: { manifest: { id: 'TMDB', name: 'TMDB' } } } },
        ];

        expect(mixTmdbAndCinemetaCatalogRows(rows).map(({ catalog }) => catalog.id)).toEqual([
            'tmdb-1', 'cinemeta-1', 'tmdb-2', 'cinemeta-2', 'other',
        ]);
        expect(getCatalogAddonSource(rows[0].catalog)).toBe('cinemeta');
        expect(getCatalogAddonSource(rows[1].catalog)).toBe(null);
    });

    it('hides only TMDB series catalogs with no content', () => {
        const tmdb = { id: 'tmdb', name: 'TMDB' };
        const catalog = (addon, type, content) => ({ addon: { manifest: addon }, type, content });

        expect(isTmdbSeriesWithoutContent(catalog(tmdb, 'series', { type: 'Ready', content: [] }))).toBe(true);
        expect(isTmdbSeriesWithoutContent(catalog(tmdb, 'series', { type: 'Err', content: 'EmptyContent' }))).toBe(true);
        expect(isTmdbSeriesWithoutContent(catalog(tmdb, 'series', { type: 'Ready', content: [{ id: 'show' }] }))).toBe(false);
        expect(isTmdbSeriesWithoutContent(catalog(tmdb, 'series', { type: 'Loading' }))).toBe(false);
        expect(isTmdbSeriesWithoutContent(catalog(tmdb, 'movie', { type: 'Ready', content: [] }))).toBe(false);
        expect(isTmdbSeriesWithoutContent(catalog({ id: 'cinemeta', name: 'Cinemeta' }, 'series', {
            type: 'Ready',
            content: [],
        }))).toBe(false);
    });
});

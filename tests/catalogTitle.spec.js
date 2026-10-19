const { describe, expect, it } = require('@jest/globals');
const { stripAddonPrefix } = require('../src/common/useTranslate');

describe('catalog title formatting', () => {
    it('removes the TMDB source prefix and keeps the category name', () => {
        expect(stripAddonPrefix('TMDB - Últimos lançamentos - Filmes', {
            manifest: { id: 'com.example.catalogs', name: 'Catálogos' },
        })).toBe('Últimos lançamentos - Filmes');
    });

    it('removes the add-on name prefix when it is not a known source name', () => {
        expect(stripAddonPrefix('My Add-on: Popular Movies', {
            manifest: { id: 'com.example.addon', name: 'My Add-on' },
        })).toBe('Popular Movies');
    });

    it('leaves category names without a source prefix unchanged', () => {
        expect(stripAddonPrefix('Últimos lançamentos - Filmes', {
            manifest: { id: 'com.example.catalogs', name: 'Catálogos' },
        })).toBe('Últimos lançamentos - Filmes');
    });
});

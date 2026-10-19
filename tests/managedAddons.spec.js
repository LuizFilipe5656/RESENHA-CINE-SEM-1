const { isManagedAddon, REQUIRED_ADDONS } = require('../src/addons/managedAddons');

describe('managed add-ons', () => {
    it('includes Froststream, Torrentio and FenixFlix', () => {
        expect(REQUIRED_ADDONS.map(({ id }) => id)).toEqual([
            'froststream',
            'fenixflix',
            'TMDB',
            'MicoLeão',
        ]);
    });

    it('identifies required add-ons by manifest URL or id', () => {
        for (const addon of REQUIRED_ADDONS) {
            expect(isManagedAddon({ transportUrl: addon.url })).toBe(true);
            expect(isManagedAddon({ manifest: { id: addon.id } })).toBe(true);
        }

        expect(isManagedAddon({ transportUrl: 'https://other.example/manifest.json' })).toBe(false);
    });
});

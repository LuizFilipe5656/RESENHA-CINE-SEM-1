const { DEFAULT_STREAMING_SERVER_URL, resolveStreamingServerUrl } = require('../src/common/CONSTANTS');
const { getDesktopCompatSettings, getResolvedStreamingServerUrl } = require('../src/App/compatSettings');

describe('resolveStreamingServerUrl', () => {
    it('returns the default loopback URL when the current value is missing', () => {
        expect(resolveStreamingServerUrl(null)).toBe(DEFAULT_STREAMING_SERVER_URL);
        expect(resolveStreamingServerUrl('')).toBe(DEFAULT_STREAMING_SERVER_URL);
    });

    it('returns the default loopback URL when the current value is invalid', () => {
        expect(resolveStreamingServerUrl('not-a-url')).toBe(DEFAULT_STREAMING_SERVER_URL);
    });

    it('keeps a valid custom URL unchanged', () => {
        const customUrl = 'https://stream.example.com:8080/';
        expect(resolveStreamingServerUrl(customUrl)).toBe(customUrl);
    });
});

describe('getDesktopCompatSettings', () => {
    it('forces desktop-safe playback settings to avoid unsupported video codecs', () => {
        const result = getDesktopCompatSettings({
            interfaceLanguage: 'en-US',
            subtitlesLanguage: 'eng',
            audioLanguage: 'eng',
            hardwareDecoding: true,
            gpuVideoProcessing: true,
            videoMode: 'auto',
            streamingServerUrl: 'https://example.com',
        });

        expect(result.interfaceLanguage).toBe('pt-BR');
        expect(result.subtitlesLanguage).toBe('por');
        expect(result.audioLanguage).toBe('por');
        expect(result.hardwareDecoding).toBe(false);
        expect(result.gpuVideoProcessing).toBe(false);
        expect(result.videoMode).toBe('legacy');
        expect(result.streamingServerUrl).toBe('https://example.com/');
    });

    it('uses the default loopback server when no valid streaming URL is available', () => {
        expect(getResolvedStreamingServerUrl({ streamingServerUrl: null }, {})).toBe(DEFAULT_STREAMING_SERVER_URL);
        expect(getResolvedStreamingServerUrl({}, { baseUrl: 'http://localhost:11470/' })).toBe(DEFAULT_STREAMING_SERVER_URL);
        expect(getResolvedStreamingServerUrl({}, { selected: { transportUrl: 'not-a-url' }, baseUrl: null })).toBe(DEFAULT_STREAMING_SERVER_URL);
    });
});

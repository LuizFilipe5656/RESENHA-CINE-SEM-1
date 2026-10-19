const { DEFAULT_STREAMING_SERVER_URL, resolveStreamingServerUrl } = require('../common/CONSTANTS');

const getResolvedStreamingServerUrl = (settings = {}, streamingServer = {}) => {
    const candidates = [
        settings?.streamingServerUrl,
        streamingServer?.selected && typeof streamingServer.selected === 'object' ? streamingServer.selected.transportUrl : null,
        streamingServer?.baseUrl,
        DEFAULT_STREAMING_SERVER_URL,
    ];

    for (const candidate of candidates) {
        const resolved = resolveStreamingServerUrl(candidate);
        if (resolved && typeof resolved === 'string' && resolved.trim() !== '') {
            return resolved;
        }
    }

    return DEFAULT_STREAMING_SERVER_URL;
};

const getDesktopCompatSettings = (settings = {}) => {
    const resolvedStreamingServerUrl = resolveStreamingServerUrl(settings.streamingServerUrl);

    return {
        ...settings,
        interfaceLanguage: 'pt-BR',
        subtitlesLanguage: 'por',
        audioLanguage: 'por',
        hardwareDecoding: false,
        gpuVideoProcessing: false,
        videoMode: 'legacy',
        streamingServerUrl: resolvedStreamingServerUrl,
    };
};

module.exports = {
    getDesktopCompatSettings,
    getResolvedStreamingServerUrl,
};

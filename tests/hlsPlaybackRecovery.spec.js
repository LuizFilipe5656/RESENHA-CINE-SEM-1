const handleFatalHlsError = require('../src/routes/Player/handleFatalHlsError');

const ERROR_TYPES = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
};

describe('HLS playback recovery', () => {
    let hls;
    let attempts;
    let onUnrecoverable;

    beforeEach(() => {
        hls = {
            startLoad: jest.fn(),
            recoverMediaError: jest.fn(),
        };
        attempts = { network: 0, media: 0 };
        onUnrecoverable = jest.fn();
    });

    it('retries a fatal network error twice before falling back', () => {
        const error = { fatal: true, type: ERROR_TYPES.NETWORK_ERROR };

        handleFatalHlsError(hls, error, attempts, ERROR_TYPES, onUnrecoverable);
        handleFatalHlsError(hls, error, attempts, ERROR_TYPES, onUnrecoverable);
        expect(hls.startLoad).toHaveBeenCalledTimes(2);
        expect(onUnrecoverable).not.toHaveBeenCalled();

        handleFatalHlsError(hls, error, attempts, ERROR_TYPES, onUnrecoverable);
        expect(onUnrecoverable).toHaveBeenCalledWith(error);
    });

    it('recovers one fatal media decoding error before falling back', () => {
        const error = { fatal: true, type: ERROR_TYPES.MEDIA_ERROR };

        handleFatalHlsError(hls, error, attempts, ERROR_TYPES, onUnrecoverable);
        expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
        expect(onUnrecoverable).not.toHaveBeenCalled();

        handleFatalHlsError(hls, error, attempts, ERROR_TYPES, onUnrecoverable);
        expect(onUnrecoverable).toHaveBeenCalledWith(error);
    });

    it('does not recover non-fatal errors and falls back for other fatal errors', () => {
        handleFatalHlsError(hls, { fatal: false, type: ERROR_TYPES.MEDIA_ERROR }, attempts, ERROR_TYPES, onUnrecoverable);
        expect(hls.startLoad).not.toHaveBeenCalled();
        expect(hls.recoverMediaError).not.toHaveBeenCalled();
        expect(onUnrecoverable).not.toHaveBeenCalled();

        const error = { fatal: true, type: 'otherError' };
        handleFatalHlsError(hls, error, attempts, ERROR_TYPES, onUnrecoverable);
        expect(onUnrecoverable).toHaveBeenCalledWith(error);
    });
});

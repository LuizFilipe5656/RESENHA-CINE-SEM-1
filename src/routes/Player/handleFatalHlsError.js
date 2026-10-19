const MAX_NETWORK_RECOVERIES = 2;
const MAX_MEDIA_RECOVERIES = 1;

const handleFatalHlsError = (hls, data, attempts, errorTypes, onUnrecoverable) => {
    if (!data.fatal) {
        return;
    }

    if (data.type === errorTypes.NETWORK_ERROR && attempts.network < MAX_NETWORK_RECOVERIES) {
        attempts.network += 1;
        hls.startLoad();
        return;
    }

    if (data.type === errorTypes.MEDIA_ERROR && attempts.media < MAX_MEDIA_RECOVERIES) {
        attempts.media += 1;
        hls.recoverMediaError();
        return;
    }

    onUnrecoverable(data);
};

module.exports = handleFatalHlsError;

// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const EventEmitter = require('eventemitter3');
const Hls = require('hls.js');
const magnet = require('magnet-uri');
const handleFatalHlsError = require('./handleFatalHlsError');

const MANIFEST = {
    name: 'Cine Resenha Player',
    props: [
        'stream',
        'loaded',
        'paused',
        'time',
        'duration',
        'live',
        'buffering',
        'buffered',
        'audioTracks',
        'selectedAudioTrackId',
        'subtitlesTracks',
        'selectedSubtitlesTrackId',
        'subtitlesOffset',
        'subtitlesSize',
        'subtitlesTextColor',
        'subtitlesBackgroundColor',
        'subtitlesOutlineColor',
        'volume',
        'muted',
        'playbackSpeed',
        'videoScale',
        'fullscreen',
        'subtitlesOffsetMinimum',
    ],
};

const getServerUrl = (baseUrl, path) => {
    const base = new URL(baseUrl);
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/${path}`;
    base.search = '';
    base.hash = '';
    return base.toString();
};

const buildProxyUrl = (streamingServerURL, streamURL, proxyHeaders) => {
    const mediaUrl = new URL(streamURL);
    const options = new URLSearchParams([['d', mediaUrl.origin]]);
    Object.entries(proxyHeaders?.request || {}).forEach(([key, value]) => options.append('h', `${key}:${value}`));
    Object.entries(proxyHeaders?.response || {}).forEach(([key, value]) => options.append('r', `${key}:${value}`));
    return `${getServerUrl(streamingServerURL, `proxy/${options.toString()}${mediaUrl.pathname}`)}${mediaUrl.search}`;
};

const resolveStreamUrl = async (stream, streamingServerURL, seriesInfo) => {
    let infoHash = typeof stream.infoHash === 'string' ? stream.infoHash : null;
    let fileIdx = Number.isInteger(stream.fileIdx) ? stream.fileIdx : null;
    let trackers = Array.isArray(stream.announce) ? stream.announce : [];
    let mediaUrl = typeof stream.url === 'string' ? stream.url : null;

    if (mediaUrl?.startsWith('magnet:')) {
        const parsedMagnet = magnet.decode(mediaUrl);
        if (!parsedMagnet?.infoHash) {
            throw new Error('Não foi possível ler o link magnet deste vídeo.');
        }
        infoHash = parsedMagnet.infoHash;
        trackers = Array.isArray(parsedMagnet.announce) ? parsedMagnet.announce : trackers;
        mediaUrl = null;
    }

    if (!mediaUrl && infoHash) {
        if (typeof streamingServerURL !== 'string' || streamingServerURL.length === 0) {
            throw new Error('Configure um servidor de streaming para reproduzir este torrent.');
        }

        const sources = trackers.map((tracker) => tracker.startsWith('tracker:') || tracker.startsWith('dht:') ? tracker : `tracker:${tracker}`);
        if (fileIdx === null || sources.length > 0) {
            const body = {
                torrent: { infoHash },
            };
            if (sources.length > 0) {
                body.peerSearch = {
                    sources: [`dht:${infoHash}`, ...sources].filter((source, index, all) => all.indexOf(source) === index),
                    min: 40,
                    max: 200,
                };
            }
            if (fileIdx === null) {
                body.guessFileIdx = {};
                if (Number.isFinite(seriesInfo?.season)) body.guessFileIdx.season = seriesInfo.season;
                if (Number.isFinite(seriesInfo?.episode)) body.guessFileIdx.episode = seriesInfo.episode;
            } else {
                body.guessFileIdx = false;
            }

            const response = await fetch(getServerUrl(streamingServerURL, `${encodeURIComponent(infoHash)}/create`), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                throw new Error(`O servidor de streaming não conseguiu preparar o torrent (${response.status}).`);
            }

            const result = await response.json();
            if (body.guessFileIdx) fileIdx = result.guessedFileIdx;
        }

        if (!Number.isInteger(fileIdx)) {
            throw new Error('Não foi possível identificar o arquivo deste episódio no torrent.');
        }

        const query = new URLSearchParams(sources.map((source) => ['tr', source]));
        mediaUrl = getServerUrl(streamingServerURL, `${encodeURIComponent(infoHash)}/${encodeURIComponent(fileIdx)}`);
        if (query.toString()) mediaUrl += `?${query.toString()}`;
    }

    if (!mediaUrl && typeof stream.externalUrl === 'string') {
        throw Object.assign(new Error('Este link abre um player externo e não contém um arquivo de vídeo reproduzível no navegador.'), {
            externalUrl: stream.externalUrl,
        });
    }

    if (!mediaUrl) {
        throw new Error('Este stream não contém um link de vídeo compatível.');
    }

    if (stream.behaviorHints?.proxyHeaders && typeof streamingServerURL === 'string') {
        mediaUrl = buildProxyUrl(streamingServerURL, mediaUrl, stream.behaviorHints.proxyHeaders);
    }

    return { url: mediaUrl, infoHash, fileIdx };
};

const makeTranscodedUrl = (streamingServerURL, mediaUrl, maxAudioChannels = 2) => {
    const id = typeof window.crypto?.randomUUID === 'function' ?
        window.crypto.randomUUID()
        :
        `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const query = new URLSearchParams([
        ['mediaURL', mediaUrl],
        ['forceTranscoding', '1'],
        ['videoCodecs', 'h264'],
        ['audioCodecs', 'aac'],
        ['maxAudioChannels', String(maxAudioChannels)],
    ]);
    return `${getServerUrl(streamingServerURL, `hlsv2/${id}/master.m3u8`)}?${query.toString()}`;
};

const toSubtitleUrl = (track, streamingServerURL) => {
    if (typeof track.url !== 'string') return null;
    if (/\.vtt(?:$|[?#])/i.test(track.url)) return track.url;
    if (typeof streamingServerURL !== 'string') return track.url;
    return `${getServerUrl(streamingServerURL, 'subtitles.vtt')}?${new URLSearchParams([['from', track.url]])}`;
};

const useVideo = () => {
    const containerRef = React.useRef(null);
    const videoRef = React.useRef(null);
    const hlsRef = React.useRef(null);
    const loadIdRef = React.useRef(0);
    const playbackStartTimeoutRef = React.useRef(null);
    const playbackStartListenerRef = React.useRef(null);
    const localSubtitleUrlsRef = React.useRef([]);
    const events = React.useMemo(() => new EventEmitter(), []);
    const [state, setState] = React.useState({
        manifest: null,
        stream: null,
        loaded: null,
        paused: null,
        time: null,
        duration: null,
        live: null,
        buffering: null,
        buffered: null,
        volume: null,
        muted: null,
        playbackSpeed: null,
        videoScale: 'contain',
        videoParams: null,
        hdrInfo: null,
        audioTracks: [],
        selectedAudioTrackId: null,
        subtitlesTracks: [],
        selectedSubtitlesTrackId: null,
        subtitlesOffset: 0,
        subtitlesOffsetMinimum: 0,
        subtitlesSize: 100,
        subtitlesTextColor: '#ffffff',
        subtitlesBackgroundColor: 'transparent',
        subtitlesOutlineColor: '#222222',
        extraSubtitlesTracks: [],
        selectedExtraSubtitlesTrackId: null,
        extraSubtitlesSize: 100,
        extraSubtitlesDelay: 0,
        extraSubtitlesOffset: 0,
        extraSubtitlesTextColor: '#ffffff',
        extraSubtitlesBackgroundColor: 'transparent',
        extraSubtitlesOutlineColor: '#222222',
        assSubtitlesStylingActive: false,
        fullscreen: false,
    });
    const stateRef = React.useRef(state);
    stateRef.current = state;

    const updateState = React.useCallback((patch) => {
        setState((previous) => ({ ...previous, ...patch }));
    }, []);

    const getVideo = React.useCallback(() => {
        return containerRef.current?.querySelector('video') || null;
    }, []);

    const applySubtitleStyle = React.useCallback((patch = {}) => {
        const videoElement = getVideo();
        if (!videoElement) return;

        const current = { ...stateRef.current, ...patch };
        const style = videoElement.parentElement?.querySelector('style[data-player-subtitles]');
        if (style) {
            style.textContent = `video::cue { font-size: ${Math.max(50, Number(current.subtitlesSize) || 100) / 100 * 4}vmin; color: ${current.subtitlesTextColor}; background-color: ${current.subtitlesBackgroundColor}; text-shadow: -0.15rem -0.15rem 0.15rem ${current.subtitlesOutlineColor}, 0.15rem 0.15rem 0.15rem ${current.subtitlesOutlineColor}; }`;
        }
    }, [getVideo]);

    const cleanupHls = React.useCallback(() => {
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
    }, []);

    const clearPlaybackStartTimeout = React.useCallback(() => {
        if (playbackStartTimeoutRef.current !== null) {
            clearTimeout(playbackStartTimeoutRef.current);
            playbackStartTimeoutRef.current = null;
        }
        if (playbackStartListenerRef.current !== null) {
            playbackStartListenerRef.current.element.removeEventListener('canplay', playbackStartListenerRef.current.listener);
            playbackStartListenerRef.current = null;
        }
    }, []);

    const unload = React.useCallback(() => {
        loadIdRef.current += 1;
        clearPlaybackStartTimeout();
        cleanupHls();
        const videoElement = getVideo();
        if (videoElement) {
            videoElement.pause();
            videoElement.removeAttribute('src');
            videoElement.querySelectorAll('track').forEach((track) => track.remove());
            videoElement.load();
        }
        localSubtitleUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        localSubtitleUrlsRef.current = [];
        updateState({
            stream: null,
            loaded: null,
            paused: null,
            time: null,
            duration: null,
            live: null,
            buffering: null,
            buffered: null,
            audioTracks: [],
            selectedAudioTrackId: null,
            subtitlesTracks: [],
            selectedSubtitlesTrackId: null,
            extraSubtitlesTracks: [],
            selectedExtraSubtitlesTrackId: null,
        });
    }, [clearPlaybackStartTimeout, cleanupHls, getVideo, updateState]);

    const load = React.useCallback(async (args) => {
        const videoElement = getVideo();
        if (!videoElement) return;

        unload();
        const loadId = loadIdRef.current;
        const stream = args?.stream;
        if (!stream) return;

        updateState({
            manifest: MANIFEST,
            stream,
            loaded: false,
            paused: true,
            time: 0,
            duration: null,
            live: null,
            buffering: true,
            buffered: 0,
            volume: Math.round(videoElement.volume * 100),
            muted: videoElement.muted,
            playbackSpeed: videoElement.playbackRate,
            videoScale: stateRef.current.videoScale || 'contain',
        });
        events.emit('implementationChanged', MANIFEST);

        try {
            const resolved = await resolveStreamUrl(stream, args.streamingServerURL, args.seriesInfo);
            if (loadId !== loadIdRef.current) return;

            let sourceUrl = resolved.url;
            const isHls = /\.m3u8(?:$|[?#])/i.test(sourceUrl) || stream.behaviorHints?.headers?.['content-type'] === 'application/vnd.apple.mpegurl';
            if (args.forceTranscoding) {
                if (typeof args.streamingServerURL !== 'string') {
                    throw new Error('Não há servidor de streaming configurado para converter este vídeo.');
                }
                sourceUrl = makeTranscodedUrl(args.streamingServerURL, sourceUrl, args.maxAudioChannels);
            }

            const subtitleTracks = Array.isArray(stream.subtitles) ? stream.subtitles : [];
            const preparedTracks = subtitleTracks.map((track, index) => ({
                ...track,
                id: String(track.id || `EXTERNAL_${index}`),
                label: track.label || track.lang || 'Legenda',
                url: toSubtitleUrl(track, args.streamingServerURL),
            })).filter((track) => typeof track.url === 'string');
            const textTracks = preparedTracks.map((track, index) => {
                const element = document.createElement('track');
                element.kind = 'subtitles';
                element.label = track.label;
                element.srclang = track.lang || 'und';
                element.src = track.url;
                element.dataset.trackId = track.id;
                element.dataset.trackSource = 'external';
                element.addEventListener('load', () => {
                    events.emit('extraSubtitlesTrackLoaded', track);
                });
                videoElement.appendChild(element);
                if (index === 0) element.default = false;
                return track;
            });
            updateState({ extraSubtitlesTracks: textTracks });

            if ((args.forceTranscoding || isHls) && Hls.isSupported()) {
                const hls = new Hls();
                const hlsRecoveryAttempts = { network: 0, media: 0 };
                hlsRef.current = hls;
                hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(sourceUrl));
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    updateState({
                        subtitlesTracks: hls.subtitleTracks.map((track, index) => ({
                            id: `EMBEDDED_${index}`,
                            lang: track.lang || '',
                            label: track.name || track.lang || `Legenda ${index + 1}`,
                            origin: 'EMBEDDED',
                            embedded: true,
                        })),
                        audioTracks: hls.allAudioTracks.map((track, index) => ({
                            id: `EMBEDDED_${index}`,
                            lang: track.lang || track.name || String(index + 1),
                            label: track.name || track.lang || `Áudio ${index + 1}`,
                            origin: 'EMBEDDED',
                            embedded: true,
                        })),
                    });
                    if (args.autoplay) {
                        videoElement.play().catch(() => updateState({ paused: true }));
                    }
                });
                hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_event, data) => {
                    updateState({
                        subtitlesTracks: data.subtitleTracks.map((track, index) => ({
                            id: `EMBEDDED_${index}`,
                            lang: track.lang || '',
                            label: track.name || track.lang || `Legenda ${index + 1}`,
                            origin: 'EMBEDDED',
                            embedded: true,
                        })),
                    });
                });
                hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
                    updateState({
                        audioTracks: data.audioTracks.map((track, index) => ({
                            id: `EMBEDDED_${index}`,
                            lang: track.lang || track.name || String(index + 1),
                            label: track.name || track.lang || `Áudio ${index + 1}`,
                            origin: 'EMBEDDED',
                            embedded: true,
                        })),
                    });
                });
                hls.on(Hls.Events.ERROR, (_event, data) => {
                    handleFatalHlsError(hls, data, hlsRecoveryAttempts, Hls.ErrorTypes, (fatalError) => {
                        console.error('Unrecoverable HLS playback error:', fatalError);
                        events.emit('error', {
                            critical: true,
                            message: 'Não foi possível reproduzir este vídeo. Verifique o stream ou tente outro.',
                            error: fatalError,
                            stream,
                        });
                    });
                });
                hls.attachMedia(videoElement);
            } else {
                videoElement.src = sourceUrl;
                videoElement.load();
                if (args.autoplay) {
                    const onCanPlay = () => {
                        videoElement.removeEventListener('canplay', onCanPlay);
                        videoElement.play().catch(() => updateState({ paused: true }));
                    };
                    videoElement.addEventListener('canplay', onCanPlay);
                }
            }

            const onPlaybackCanPlay = () => clearPlaybackStartTimeout();
            playbackStartListenerRef.current = { element: videoElement, listener: onPlaybackCanPlay };
            videoElement.addEventListener('canplay', onPlaybackCanPlay, { once: true });
            playbackStartTimeoutRef.current = setTimeout(() => {
                if (loadId !== loadIdRef.current) {
                    return;
                }

                clearPlaybackStartTimeout();
                events.emit('error', {
                    critical: true,
                    message: args.forceTranscoding ?
                        'O servidor de streaming não iniciou a reprodução. Verifique o endereço em Configurações > Streaming e, para 4K, selecione uma aceleração por hardware compatível.'
                        :
                        'O stream não iniciou a reprodução. Verifique a conexão, o add-on ou tente outro stream.',
                    error: new Error('Playback did not reach the canplay state before the timeout.'),
                    stream: { ...stream, url: sourceUrl },
                });
            }, 45000);

            if (typeof args.time === 'number' && args.time > 0) {
                const setInitialTime = () => {
                    videoElement.currentTime = args.time / 1000;
                    videoElement.removeEventListener('loadedmetadata', setInitialTime);
                };
                videoElement.addEventListener('loadedmetadata', setInitialTime);
            }
            updateState({
                stream: { ...stream, url: sourceUrl },
                videoParams: { hash: resolved.infoHash || null, size: null, filename: null },
            });
        } catch (error) {
            if (loadId !== loadIdRef.current) return;
            events.emit('error', {
                critical: true,
                code: error.externalUrl ? 2 : undefined,
                message: error.message,
                error,
                stream: { ...stream, externalUrl: error.externalUrl || stream.externalUrl },
            });
        }
    }, [clearPlaybackStartTimeout, events, getVideo, unload, updateState]);

    React.useEffect(() => {
        const videoElement = getVideo();
        if (!videoElement) return undefined;
        videoRef.current = videoElement;
        const subtitleStyle = document.createElement('style');
        subtitleStyle.dataset.playerSubtitles = 'true';
        videoElement.parentElement.appendChild(subtitleStyle);

        const updatePlaybackState = () => {
            const duration = Number.isFinite(videoElement.duration) ? Math.floor(videoElement.duration * 1000) : null;
            const time = Number.isFinite(videoElement.currentTime) ? Math.floor(videoElement.currentTime * 1000) : 0;
            let buffered = time;
            for (let index = 0; index < videoElement.buffered.length; index++) {
                if (videoElement.buffered.start(index) <= videoElement.currentTime && videoElement.currentTime <= videoElement.buffered.end(index)) {
                    buffered = Math.floor(videoElement.buffered.end(index) * 1000);
                    break;
                }
            }
            updateState({
                loaded: videoElement.readyState >= videoElement.HAVE_METADATA,
                paused: videoElement.paused,
                time,
                duration,
                audioTracks: videoElement.audioTracks ? Array.from(videoElement.audioTracks).map((track, index) => ({
                    id: `EMBEDDED_${index}`,
                    lang: track.language || '',
                    label: track.label || track.language || `Áudio ${index + 1}`,
                    origin: 'EMBEDDED',
                    embedded: true,
                })) : [],
                live: videoElement.duration === Infinity ? {
                    start: videoElement.seekable.length ? Math.floor(videoElement.seekable.start(0) * 1000) : null,
                    end: videoElement.seekable.length ? Math.floor(videoElement.seekable.end(videoElement.seekable.length - 1) * 1000) : null,
                    tolerance: 6000,
                } : null,
                buffering: videoElement.readyState < videoElement.HAVE_FUTURE_DATA,
                buffered,
            });
        };
        const updateVolumeState = () => updateState({
            volume: Math.round(videoElement.volume * 100),
            muted: videoElement.muted,
        });
        const updateRateState = () => updateState({ playbackSpeed: videoElement.playbackRate });
        const onEnded = () => events.emit('ended');
        const onError = () => {
            const mediaError = videoElement.error;
            if (!mediaError) return;
            const message = mediaError.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ?
                'O navegador não reconhece este formato. Tentando converter o vídeo…'
                :
                'Não foi possível carregar o vídeo. Verifique sua conexão e tente novamente.';
            events.emit('error', {
                critical: true,
                message,
                error: mediaError,
                stream: stateRef.current.stream,
            });
        };

        ['loadedmetadata', 'durationchange', 'timeupdate', 'progress', 'waiting', 'playing', 'canplay', 'seeking', 'seeked', 'pause', 'play'].forEach((name) => {
            videoElement.addEventListener(name, updatePlaybackState);
        });
        videoElement.addEventListener('volumechange', updateVolumeState);
        videoElement.addEventListener('ratechange', updateRateState);
        videoElement.addEventListener('ended', onEnded);
        videoElement.addEventListener('error', onError);
        applySubtitleStyle();

        return () => {
            ['loadedmetadata', 'durationchange', 'timeupdate', 'progress', 'waiting', 'playing', 'canplay', 'seeking', 'seeked', 'pause', 'play'].forEach((name) => {
                videoElement.removeEventListener(name, updatePlaybackState);
            });
            videoElement.removeEventListener('volumechange', updateVolumeState);
            videoElement.removeEventListener('ratechange', updateRateState);
            videoElement.removeEventListener('ended', onEnded);
            videoElement.removeEventListener('error', onError);
            videoElement.pause();
            videoElement.removeAttribute('src');
            videoElement.load();
            videoRef.current = null;
            subtitleStyle.remove();
            cleanupHls();
            localSubtitleUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [applySubtitleStyle, cleanupHls, events, getVideo, updateState]);

    React.useEffect(() => {
        applySubtitleStyle();
    }, [applySubtitleStyle]);

    const setPaused = React.useCallback((paused) => {
        const videoElement = videoRef.current;
        if (!videoElement) return;
        if (paused) videoElement.pause();
        else videoElement.play().catch(() => updateState({ paused: true }));
    }, [updateState]);
    const setVolume = React.useCallback((volume) => {
        if (videoRef.current) videoRef.current.volume = Math.max(0, Math.min(100, volume)) / 100;
    }, []);
    const setMuted = React.useCallback((muted) => {
        if (videoRef.current) videoRef.current.muted = muted;
    }, []);
    const setTime = React.useCallback((time) => {
        if (videoRef.current && Number.isFinite(time)) videoRef.current.currentTime = Math.max(0, time / 1000);
    }, []);
    const setPlaybackSpeed = React.useCallback((rate) => {
        if (videoRef.current && Number.isFinite(rate)) videoRef.current.playbackRate = Math.max(0.25, Math.min(2, rate));
    }, []);
    const setAudioTrack = React.useCallback((id) => {
        if (hlsRef.current) {
            hlsRef.current.audioTrack = Number(id.replace('EMBEDDED_', ''));
            updateState({ selectedAudioTrackId: id });
            return;
        }
        const audioTracks = videoRef.current?.audioTracks;
        if (!audioTracks) return;
        for (let index = 0; index < audioTracks.length; index++) audioTracks[index].enabled = `EMBEDDED_${index}` === id;
        updateState({ selectedAudioTrackId: id });
    }, [updateState]);
    const setSubtitlesTrack = React.useCallback((id) => {
        if (hlsRef.current) {
            hlsRef.current.subtitleTrack = id === null ? -1 : Number(id.replace('EMBEDDED_', ''));
            hlsRef.current.subtitleDisplay = id !== null;
            updateState({ selectedSubtitlesTrackId: id, selectedExtraSubtitlesTrackId: null });
            return;
        }
        const videoElement = videoRef.current;
        if (!videoElement) return;
        videoElement.querySelectorAll('track[data-track-source="embedded"]').forEach((track) => {
            track.track.mode = track.dataset.trackId === id ? 'showing' : 'disabled';
        });
        updateState({ selectedSubtitlesTrackId: id, selectedExtraSubtitlesTrackId: null });
    }, [updateState]);
    const setExtraSubtitlesTrack = React.useCallback((id) => {
        const videoElement = videoRef.current;
        if (!videoElement) return;
        videoElement.querySelectorAll('track[data-track-source="external"]').forEach((track) => {
            track.track.mode = track.dataset.trackId === id ? 'showing' : 'disabled';
        });
        updateState({ selectedSubtitlesTrackId: null, selectedExtraSubtitlesTrackId: id });
    }, [updateState]);
    const setSubtitlesDelay = React.useCallback((delay) => updateState({ extraSubtitlesDelay: delay }), [updateState]);
    const setSubtitlesSize = React.useCallback((size) => {
        updateState({ subtitlesSize: size, extraSubtitlesSize: size });
        applySubtitleStyle({ subtitlesSize: size });
    }, [applySubtitleStyle, updateState]);
    const setSubtitlesOffset = React.useCallback((offset) => updateState({ subtitlesOffset: offset, extraSubtitlesOffset: offset }), [updateState]);
    const setSubtitlesOffsetMinimum = React.useCallback((offset) => updateState({ subtitlesOffsetMinimum: offset }), [updateState]);
    const setSubtitlesTextColor = React.useCallback((color) => {
        updateState({ subtitlesTextColor: color, extraSubtitlesTextColor: color });
        applySubtitleStyle({ subtitlesTextColor: color });
    }, [applySubtitleStyle, updateState]);
    const setSubtitlesBackgroundColor = React.useCallback((color) => {
        updateState({ subtitlesBackgroundColor: color, extraSubtitlesBackgroundColor: color });
        applySubtitleStyle({ subtitlesBackgroundColor: color });
    }, [applySubtitleStyle, updateState]);
    const setSubtitlesOutlineColor = React.useCallback((color) => {
        updateState({ subtitlesOutlineColor: color, extraSubtitlesOutlineColor: color });
        applySubtitleStyle({ subtitlesOutlineColor: color });
    }, [applySubtitleStyle, updateState]);
    const setVideoScale = React.useCallback((scale) => {
        if (videoRef.current && ['contain', 'cover', 'fill'].includes(scale)) videoRef.current.style.objectFit = scale === 'fill' ? 'fill' : scale;
        updateState({ videoScale: scale });
    }, [updateState]);
    const setFullscreen = React.useCallback((fullscreen) => updateState({ fullscreen }), [updateState]);

    const addExtraSubtitlesTracks = React.useCallback((tracks) => {
        const videoElement = videoRef.current;
        if (!videoElement || !Array.isArray(tracks)) return;
        const addedTracks = tracks.filter((track) => !state.extraSubtitlesTracks.some((existing) => existing.id === track.id));
        addedTracks.forEach((track) => {
            if (typeof track.url !== 'string') return;
            const element = document.createElement('track');
            element.kind = 'subtitles';
            element.label = track.label || track.lang || 'Legenda';
            element.srclang = track.lang || 'und';
            element.src = track.url;
            element.dataset.trackId = track.id;
            element.dataset.trackSource = 'external';
            element.addEventListener('load', () => events.emit('extraSubtitlesTrackLoaded', track));
            videoElement.appendChild(element);
            events.emit('extraSubtitlesTrackAdded', track);
        });
        updateState({ extraSubtitlesTracks: state.extraSubtitlesTracks.concat(addedTracks) });
    }, [events, state.extraSubtitlesTracks, updateState]);

    const addLocalSubtitles = React.useCallback((filename, buffer) => {
        const text = new TextDecoder().decode(buffer);
        const content = /\.srt$/i.test(filename) ?
            `WEBVTT\n\n${text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`
            :
            text;
        const objectUrl = URL.createObjectURL(new Blob([content], { type: 'text/vtt' }));
        localSubtitleUrlsRef.current.push(objectUrl);
        addExtraSubtitlesTracks([{
            id: `LOCAL_${Date.now()}`,
            label: filename,
            lang: '',
            url: objectUrl,
            local: true,
        }]);
    }, [addExtraSubtitlesTracks]);

    return {
        events,
        containerRef,
        state,
        load,
        unload,
        addExtraSubtitlesTracks,
        addLocalSubtitles,
        setPaused,
        setVolume,
        setMuted,
        setTime,
        setPlaybackSpeed,
        setAudioTrack,
        setSubtitlesTrack,
        setSubtitlesDelay,
        setSubtitlesSize,
        setSubtitlesOffset,
        setSubtitlesOffsetMinimum,
        setSubtitlesTextColor,
        setSubtitlesBackgroundColor,
        setSubtitlesOutlineColor,
        setExtraSubtitlesTrack,
        setVideoScale,
        setFullscreen,
    };
};

module.exports = useVideo;

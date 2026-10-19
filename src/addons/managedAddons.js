const REQUIRED_ADDONS = [
    {
        id: 'froststream',
        name: 'Froststream',
        url: 'https://froststream.cloutteam.com/manifest.json',
    },
    {
        id: 'fenixflix',
        name: 'FenixFlix',
        url: 'https://fenixflix.fenixhub.online/qualities=4k,1080p,720p,sd%7Caudio=dublado,legendado%7Ccatalogs=populares_movie,populares_series,recentes_movie,recentes_series/manifest.json',
    },
        {
        id: 'MicoLeão',
        name: 'MicoLeão',
        url: 'https://27a5b2bfe3c0-stremio-brazilian-addon.baby-beamup.club/manifest.json',
    },
        {
        id: 'TMDB',
        name: 'TMDB',
        url: 'https://tmdb.elfhosted.com/N4IgTgDgJgRg1gUwJ4gFwgC4AYC0AzMBBHSWEAGnGhgFkEoBLAQwBUkIEBnNUCAe04YEYNBjABXBJQA2fAOZ9REqSBhMAxnChg+ENHibTOCAL6UMu-oOGdEKdBUyWBQsJwDCfAHZ4GcniBWrmwcaIEuwjhQCAbi0hiOgkjSCGEAtnzRYF6OGAAW4mkwXkwM0gBCTFByCAAKAgwYDN5hFhAkfnkJ5gVFJWWV1QgAygwAXqnonGmG0rm9xaUV0uIiqAZGpuZpsACCEAwA0shhACwA7FBYAGzn1wDMWACM90z3UOoAnOcAHOrXAFZvjA8EQEEwfqcAY4IDoAG4MaIASR2MCRUFaykchAwqy8KNg6MxklyqNqhF8AA9ialKHlEQgAKIHTiZBAsBb9Iw0xzSJheOTiJg1MIQDA4coAJUSYnBaQYArQAG0QAo9JQfNS6TA0o4mGk9ABdSjqJgYQzybioJWgRGtVEAOj5QkEuXYkxAGQRtJAJTSHoAMmauBgAASShApJjGbiUTh5PgAdyRXgAEnx-UpJGZbRj0BhHc6Q27QlNhAwuI4-YHg4Jw5HwTHEgnk2mM5MxNnyLn7bAHbKvIxFeZ3ek+N6q-qPSxCIOFf44y2U+nM6hO1se-nHQOhwvMKOy2AK7HfVOwjOEHPhyB40nl+2sxuQHat322iWPV6K5PVyB6hA4iYERFzvNtV3XHNnzzTBt10D8wmMI9Kw1M90H-QDgJvJcwI7ZRIJfGC+yQcFMIwA9PXHb8UN-ABNEjm1AldcK7TdCJgB1iKA+DD2PH8PToriQNbJjH3w6CCz7PkBSFEUR1LCiJ2omtpOFH1b2Eh81zw7soN7dipMFVTuJvctkNPX8gxU2SsMYzSIJ0gjBEIfV5wdNVjK-H1qzCABxWQYF0PkUCE+9wO01inLlVz3Lkj1EN4pTfP8wKmGCmyNLCljdKmWUXIFB1NQ8yivNQkAADkEAwPBpAYLV0tC5in0c3L5XywrYoQ0yT289AKqqmq6vUhrRIc6DIryuQHTyHUisU8yPVTcoAHlQxoJhBuwkStKy5rnNaybpt1DqeLMnqQEWla1o22zMqasaWtc-V1X3eTPL4sJyQYf1QwANQZRQQpwkaIoe-KnuM+LTtKz7vr+6IAfqoHttMY0QFNQRPHELwElQAEhN2GpJTNecUx8y9CCtTAsUoS8mBgFICYQImmkVdANmMBjE0Z5n5wAdUaPICRgHnWZAdm1LEBh1AwCM5GaLwADEylcHlKEYOXzWkCMo2MJX4mEUSgA/manifest.json',
    },
];

const isManagedAddon = (addon) => REQUIRED_ADDONS.some(({ id, url }) =>
    addon?.transportUrl === url || addon?.manifest?.id === id
);

module.exports = { REQUIRED_ADDONS, isManagedAddon };

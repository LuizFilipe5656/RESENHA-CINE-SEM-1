const React = require('react');
const { loadLocalizedSynopsis } = require('./localizedSynopsis');

const useLocalizedSynopsis = (type, id, original) => {
    const key = `${type}:${id}`;
    const enabled = ['movie', 'series'].includes(type) && typeof id === 'string';
    const [result, setResult] = React.useState(null);
    React.useEffect(() => {
        if (!enabled) return undefined;
        let active = true;
        loadLocalizedSynopsis(type, id).then((description) => {
            if (active) setResult({ key, description });
        });
        return () => { active = false; };
    }, [type, id, key, enabled]);
    const current = result?.key === key ? result : null;
    return {
        description: current?.description || original,
        status: !enabled ? null : !current ? 'loading' : current.description ? 'ready' : 'unavailable',
    };
};

module.exports = useLocalizedSynopsis;

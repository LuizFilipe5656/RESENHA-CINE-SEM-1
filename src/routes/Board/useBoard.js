// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { useCore } = require('stremio/core');
const { useModelState } = require('stremio/common');

const useBoard = () => {
    const core = useCore();
    const [requestedRange, setRequestedRange] = React.useState(null);
    const action = React.useMemo(() => ({
        action: 'Load',
        args: {
            model: 'CatalogsWithExtra',
            args: { extra: [] }
        }
    }), []);
    const loadRange = React.useCallback((range) => {
        setRequestedRange((currentRange) => {
            return currentRange?.start === range.start && currentRange?.end === range.end ?
                currentRange
                :
                range;
        });
        core.transport.dispatch({
            action: 'CatalogsWithExtra',
            args: {
                action: 'LoadRange',
                args: range
            }
        }, 'board');
    }, []);
    const board = useModelState({ model: 'board', action });
    return [board, loadRange, requestedRange];
};

module.exports = useBoard;

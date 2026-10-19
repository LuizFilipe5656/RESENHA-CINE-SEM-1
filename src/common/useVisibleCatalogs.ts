// Copyright (C) 2017-2026 Smart code 203358507

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import getVisibleChildrenRange from './getVisibleChildrenRange';
import { useRouteActive } from './useRouteFocused';

const debounce: (callback: () => void, wait: number) => { (): void, cancel: () => void } = require('lodash.debounce');

type CatalogRow = {
    catalog: NonNullable<CatalogsWithExtra['catalogs']>[number],
    index: number,
};

type Props = {
    catalogs: NonNullable<CatalogsWithExtra['catalogs']>,
    loadRange: (range: { start: number, end: number }) => void,
    orderCatalogRows?: (rows: CatalogRow[]) => CatalogRow[],
    leadingRows?: number,
    preloadRows?: number,
};

const useVisibleCatalogs = ({ catalogs, loadRange, orderCatalogRows, leadingRows = 0, preloadRows = 0 }: Props) => {
    const active = useRouteActive();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const catalogRows = useMemo(() => {
        const rows = catalogs
            .map((catalog, index) => ({ catalog, index }))
            .filter(({ catalog }) => catalog.content?.type !== 'Err' || catalog.content.content !== 'EmptyContent');
        return orderCatalogRows ? orderCatalogRows(rows) : rows;
    }, [catalogs, orderCatalogRows]);

    const measure = useCallback(() => {
        if (!active || !scrollContainerRef.current || catalogRows.length === 0) return;

        const range = getVisibleChildrenRange(scrollContainerRef.current);
        if (range === null) return;

        const maxRow = catalogRows.length - 1;
        const firstVisiblePosition = Math.min(maxRow, Math.max(0, range.start - leadingRows));
        const lastVisiblePosition = Math.min(maxRow, Math.max(firstVisiblePosition, range.end - leadingRows));
        const firstLoadPosition = Math.max(0, firstVisiblePosition - preloadRows);
        const lastLoadPosition = Math.min(maxRow, lastVisiblePosition + preloadRows);
        const loadRows = catalogRows.slice(firstLoadPosition, lastLoadPosition + 1);
        if (loadRows.length === 0) return;

        const start = Math.min(...loadRows.map(({ index }) => index));
        const end = Math.min(catalogs.length - 1, Math.max(...loadRows.map(({ index }) => index)));
        if (end >= start) loadRange({ start, end });
    }, [active, catalogRows, catalogs.length, leadingRows, preloadRows, loadRange]);

    const onScroll = useMemo(() => debounce(measure, 250), [measure]);

    useLayoutEffect(() => {
        measure();
        return () => onScroll.cancel();
    }, [measure, onScroll]);

    return { catalogRows, scrollContainerRef, onScroll };
};

export default useVisibleCatalogs;

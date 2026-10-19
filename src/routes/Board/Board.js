// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const classnames = require('classnames');
const { useTranslation } = require('react-i18next');
const useTranslate = require('stremio/common/useTranslate');
const { default: useVisibleCatalogs } = require('stremio/common/useVisibleCatalogs');
const { useNotifications, withCoreSuspender } = require('stremio/common');
const { ContinueWatchingItem, EventModal, LiveTvContinueWatchingItem, MainNavBars, MetaItem, MetaRow } = require('stremio/components');
const useBoard = require('./useBoard');
const useContinueWatchingPreview = require('./useContinueWatchingPreview');
const { default: useLiveTvContinueWatching } = require('./useLiveTvContinueWatching');
const styles = require('./styles');
const {
    isHiddenCatalog,
    isTmdbSeriesWithoutContent,
    mixTmdbAndCinemetaCatalogRows,
} = require('./filterHiddenCatalogs');

const THRESHOLD = 5;
const CATALOG_LOAD_TIMEOUT = 45000;
const FEATURED_MOVIES = [
    {
        id: 'spider-man-brand-new-day-22084616',
        title: 'Spider-Man: Um Novo Dia',
        image: require('/assets/images/spider-man-brand-new-day-footer.jpg'),
        overview: 'Peter Parker enfrenta um novo desafio enquanto tenta proteger Nova York.',
    },
    {
        id: 'transformers-0418279',
        title: 'Transformers',
        image: require('/assets/images/transformers-banner.jpg'),
        overview: 'Os Autobots e Decepticons levam sua guerra à Terra.',
    },
    {
        id: 'transformers-revenge-of-the-fallen-1055369',
        title: 'Transformers: A Vingança dos Derrotados',
        image: require('/assets/images/transformers-revenge-of-the-fallen-banner.jpeg'),
        overview: 'Sam Witwicky volta a se envolver na batalha entre Autobots e Decepticons.',
    },
    {
        id: 'transformers-dark-of-the-moon-1399103',
        title: 'Transformers: O Lado Oculto da Lua',
        image: require('/assets/images/transformers-dark-of-the-moon-footer.jpg'),
        overview: 'A batalha entre Autobots e Decepticons chega a um momento decisivo.',
    },
    {
        id: 'the-maze-runner-1790864',
        title: 'Maze Runner: Correr ou Morrer',
        image: require('/assets/images/maze-runner-footer.jpg'),
        overview: 'Presos em um labirinto, eles precisam correr contra o tempo para encontrar uma saída.',
    },
    {
        id: 'blade-runner-2049-1856101',
        title: 'Blade Runner 2049',
        image: require('/assets/images/blade-runner-2049-banner.jpg'),
        overview: 'Um novo blade runner descobre um segredo capaz de mudar o futuro.',
    },
    {
        id: 'transformers-one-8864596',
        title: 'Transformers: O Início',
        image: require('/assets/images/transformers-one-banner.jpeg'),
        imagePosition: 'center 25%',
        overview: 'Orion Pax e D-16 descobrem como nasceu a rivalidade em Cybertron.',
    },
    {
        id: 'real-steel-0433035',
        title: 'Gigantes de Aço',
        image: require('/assets/images/real-steel-banner.jpg'),
        overview: 'Um ex-boxeador treina um robô para competir em lutas de alto nível.',
    },
    {
        id: 'pacific-rim-1663662',
        title: 'Círculo de Fogo',
        image: require('/assets/images/pacific-rim-uprising-banner.jpg'),
        overview: 'Pilotos unem forças para defender a humanidade de criaturas colossais.',
    },
    {
        id: 'pacific-rim-uprising-2557478',
        title: 'Círculo de Fogo: A Revolta',
        image: require('/assets/images/pacific-rim-banner.jpg'),
        imagePosition: 'center 25%',
        overview: 'Uma nova geração de pilotos enfrenta outra ameaça Kaiju.',
    },
];

const FeaturedBanner = () => {
    const { t } = useTranslation();
    const [activeMovieIndex, setActiveMovieIndex] = React.useState(0);
    const movies = FEATURED_MOVIES;
    const selectMovie = (direction) => {
        setActiveMovieIndex((index) => (index + direction + movies.length) % movies.length);
    };
    return (
        <section className={styles['featured-hero']}>
            <div className={styles['featured-carousel']} aria-label={t('BOARD_FEATURED', { defaultValue: 'Em destaque' })}>
                <article
                    className={[
                        styles['featured-card'],
                        movies[activeMovieIndex].image ? '' : styles['featured-card-no-image'],
                    ].join(' ')}
                >
                    {movies[activeMovieIndex].image ?
                        <img
                            className={styles['featured-card-image']}
                            src={movies[activeMovieIndex].image}
                            alt={''}
                            style={{ objectPosition: movies[activeMovieIndex].imagePosition || 'center 42%' }}
                        />
                        :
                        null
                    }
                    <div className={styles['featured-card-content']}>
                        <span className={styles['featured-card-badge']}>
                            {t('BOARD_FEATURED_MOVIE', { defaultValue: 'Filme em destaque' })}
                        </span>
                        <h1 className={styles['featured-card-title']}>
                            {movies[activeMovieIndex].title}
                        </h1>
                        <p className={styles['featured-card-overview']}>{movies[activeMovieIndex].overview}</p>
                        <a className={styles['featured-card-action']} href={`#/detail/movie/${movies[activeMovieIndex].id}`}>
                            <svg width={'16'} height={'16'} viewBox={'0 0 24 24'} fill={'currentColor'} aria-hidden={'true'}>
                                <path d={'M8 5v14l11-7z'} />
                            </svg>
                            {t('BOARD_WATCH_NOW', { defaultValue: 'Assistir agora' })}
                        </a>
                    </div>
                    <div className={styles['featured-carousel-controls']}>
                        <button
                            className={styles['featured-carousel-control']}
                            type={'button'}
                            onClick={() => selectMovie(-1)}
                            aria-label={t('BUTTON_PREVIOUS', { defaultValue: 'Filmes anteriores' })}
                        >
                            ‹
                        </button>
                        <div className={styles['featured-carousel-dots']} aria-label={t('BOARD_FEATURED', { defaultValue: 'Em destaque' })}>
                            {movies.map((movie, index) => (
                                <button
                                    key={movie.id}
                                    className={[
                                        styles['featured-carousel-dot'],
                                        index === activeMovieIndex ? styles['featured-carousel-dot-active'] : '',
                                    ].join(' ')}
                                    type={'button'}
                                    onClick={() => setActiveMovieIndex(index)}
                                    aria-label={t('BOARD_SELECT_FEATURED_MOVIE', { defaultValue: `Mostrar ${movie.title}` })}
                                    aria-current={index === activeMovieIndex ? 'true' : undefined}
                                />
                            ))}
                        </div>
                        <button
                            className={styles['featured-carousel-control']}
                            type={'button'}
                            onClick={() => selectMovie(1)}
                            aria-label={t('BUTTON_NEXT', { defaultValue: 'Próximos filmes' })}
                        >
                            ›
                        </button>
                    </div>
                </article>
            </div>
        </section>
    );
};

const Board = () => {
    const t = useTranslate();
    const continueWatchingPreview = useContinueWatchingPreview();
    const liveTvContinueWatching = useLiveTvContinueWatching();
    const [board, loadBoardRows, requestedRange] = useBoard();
    const notifications = useNotifications();
    const liveTvCatalog = React.useMemo(() => ({
        items: (Array.isArray(liveTvContinueWatching.items) ? liveTvContinueWatching.items : [])
            .map((item) => ({ ...item, posterShape: 'landscape' })),
    }), [liveTvContinueWatching.items]);
    const boardCatalogsOffset =
        (continueWatchingPreview.items.length > 0 ? 1 : 0) +
        (liveTvCatalog.items.length > 0 ? 1 : 0);
    const orderBoardCatalogRows = React.useCallback((rows) => mixTmdbAndCinemetaCatalogRows(
        rows.filter(({ catalog }) => !isHiddenCatalog(catalog) && !isTmdbSeriesWithoutContent(catalog))
    ), []);
    const { catalogRows, scrollContainerRef, onScroll } = useVisibleCatalogs({
        catalogs: board.catalogs || [],
        loadRange: loadBoardRows,
        orderCatalogRows: orderBoardCatalogRows,
        leadingRows: boardCatalogsOffset,
        preloadRows: THRESHOLD,
    });
    const requestedCatalogs = requestedRange ?
        (board.catalogs || []).slice(requestedRange.start, requestedRange.end + 1)
        :
        [];
    const hasPendingCatalogs = requestedCatalogs.some((catalog) => catalog.content?.type === 'Loading');
    const firstPendingCatalogIndex = requestedRange ?
        catalogRows.find(({ catalog, index }) => {
            return index >= requestedRange.start &&
                index <= requestedRange.end &&
                catalog.content?.type === 'Loading';
        })?.index
        :
        undefined;
    const [catalogLoadTimedOut, setCatalogLoadTimedOut] = React.useState(false);
    const [catalogRetryToken, setCatalogRetryToken] = React.useState(0);
    const { t: translate } = useTranslation();

    React.useEffect(() => {
        setCatalogLoadTimedOut(false);
        if (!hasPendingCatalogs) {
            return undefined;
        }

        const timeoutId = setTimeout(() => setCatalogLoadTimedOut(true), CATALOG_LOAD_TIMEOUT);
        return () => clearTimeout(timeoutId);
    }, [hasPendingCatalogs, requestedRange?.start, requestedRange?.end, catalogRetryToken]);

    const retryCatalogs = React.useCallback(() => {
        if (!requestedRange) {
            return;
        }

        setCatalogLoadTimedOut(false);
        setCatalogRetryToken((token) => token + 1);
        loadBoardRows(requestedRange);
    }, [requestedRange, loadBoardRows]);
    return (
        <div className={styles['board-container']}>
            <EventModal />
            <MainNavBars className={styles['board-content-container']} route={'board'}>
                <div ref={scrollContainerRef} className={styles['board-content']} onScroll={onScroll}>
                    <FeaturedBanner />
                    {
                        continueWatchingPreview.items.length > 0 ?
                            <MetaRow
                                className={classnames(styles['board-row'], styles['continue-watching-row'], 'animation-fade-in')}
                                title={t.string('BOARD_CONTINUE_WATCHING')}
                                catalog={continueWatchingPreview}
                                itemComponent={ContinueWatchingItem}
                                notifications={notifications}
                            />
                            :
                            null
                    }
                    {
                        liveTvCatalog.items.length > 0 ?
                            <MetaRow
                                className={classnames(styles['board-row'], styles['board-row-landscape'], 'animation-fade-in')}
                                title={t.string('BOARD_CONTINUE_WATCHING_LIVE')}
                                catalog={liveTvCatalog}
                                itemComponent={LiveTvContinueWatchingItem}
                                notifications={notifications}
                            />
                            :
                            null
                    }
                    {catalogRows.map(({ catalog, index }) => {
                        switch (catalog.content?.type) {
                            case 'Ready': {
                                return (
                                    <MetaRow
                                        key={index}
                                        className={classnames(styles['board-row'], styles[`board-row-${catalog.content.content[0].posterShape}`], 'animation-fade-in')}
                                        catalog={catalog}
                                        itemComponent={MetaItem}
                                    />
                                );
                            }
                            case 'Err': {
                                if (catalog.content.content !== 'EmptyContent') {
                                    return (
                                        <MetaRow
                                            key={index}
                                            className={classnames(styles['board-row'], 'animation-fade-in')}
                                            catalog={catalog}
                                            message={catalog.content.content}
                                        />
                                    );
                                }
                                return null;
                            }
                            default: {
                                if (catalogLoadTimedOut && index === firstPendingCatalogIndex) {
                                    return (
                                        <div key={index} className={styles['catalog-load-timeout']} role={'alert'}>
                                            <div>{translate('BOARD_CATALOG_LOAD_TIMEOUT', {
                                                defaultValue: 'Os catálogos estão demorando para responder. Verifique sua conexão ou os add-ons.',
                                            })}</div>
                                            <button type={'button'} onClick={retryCatalogs}>
                                                {translate('BUTTON_RETRY', { defaultValue: 'Tentar novamente' })}
                                            </button>
                                        </div>
                                    );
                                }

                                return (
                                    <MetaRow.Placeholder
                                        key={index}
                                        className={classnames(styles['board-row'], styles['board-row-poster'], 'animation-fade-in')}
                                        catalog={catalog}
                                        title={t.catalogTitle(catalog)}
                                    />
                                );
                            }
                        }
                    })}
                </div>
            </MainNavBars>
        </div>
    );
};

const BoardFallback = () => (
    <div className={styles['board-container']}>
        <MainNavBars className={styles['board-content-container']} route={'board'} />
    </div>
);

module.exports = withCoreSuspender(Board, BoardFallback);

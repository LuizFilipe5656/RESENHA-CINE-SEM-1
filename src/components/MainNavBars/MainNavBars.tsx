// Copyright (C) 2017-2023 Smart code 203358507

import React, { memo } from 'react';
import classnames from 'classnames';
import { HorizontalNavBar } from 'stremio/components/NavBar';
import { useContentGamepadNavigation, useVerticalNavGamepadNavigation } from 'stremio/services/GamepadNavigation';
import { useAddonSettings } from '../../addons/AddonSettingsContext';
import styles from './MainNavBars.less';

const TABS = [
    { id: 'board', label: 'Início', href: '/' },
    { id: 'discover', label: 'Descobrir', href: '/discover' },
    { id: 'settings', label: 'Configurações', href: '/settings' },
];

type Props = {
    className: string,
    route?: string,
    query?: string,
    children?: React.ReactNode,
};

const MainNavBars = memo(({ className, route, query, children }: Props) => {
    const navRef = React.useRef(null);
    const contentRef = React.useRef(null);
    const { addonsTabVisible } = useAddonSettings();
    const tabs = addonsTabVisible && route === 'board' ? [
        ...TABS.slice(0, 2),
        { id: 'addons', label: 'Add-ons', href: '/addons' },
        ...TABS.slice(2),
    ] : TABS;

    const navRoute = route === 'continue_watching' ? 'library' : (route ?? '');
    useContentGamepadNavigation(contentRef, navRoute);
    useVerticalNavGamepadNavigation(navRef, navRoute);

    return (
        <div className={classnames(className, styles['main-nav-bars-container'])}>
            <HorizontalNavBar
                className={styles['horizontal-nav-bar']}
                route={route}
                query={query}
                backButton={false}
                searchBar={true}
                fullscreenButton={true}
                navMenu={true}
            />
            <div className={styles['top-tabs-bar']}>
                {tabs.map((tab) => (
                    <a
                        key={tab.id}
                        href={`#${tab.href}`}
                        className={classnames(styles['top-tab'], {
                            [styles['selected']]: navRoute === tab.id || (tab.id === 'board' && navRoute === '')
                        })}
                    >
                        {tab.label}
                    </a>
                ))}
            </div>
            <div ref={contentRef} className={styles['nav-content-container']}>{children}</div>
        </div>
    );
});

export default MainNavBars;

// Copyright (C) 2017-2026 Smart code 203358507

import { useEffect, useMemo } from 'react';
import { useGamepad } from '../GamepadContext';
import { useAddonSettings } from '../../addons/AddonSettingsContext';

const ROUTES = ['search', 'board', 'discover', 'library', 'calendar'];

const useVerticalGamepadNavigation = (_sectionRef: React.RefObject<HTMLDivElement>, currentRoute: string) => {
    const gamepad = useGamepad();
    const { addonsTabVisible } = useAddonSettings();
    const routes = useMemo(() => addonsTabVisible ? [...ROUTES, 'addons', 'settings'] : [...ROUTES, 'settings'], [addonsTabVisible]);

    useEffect(() => {
        const navigate = (direction: 'prev' | 'next') => {
            const currentIndex = routes.indexOf(currentRoute);
            if (currentIndex === -1) return;

            let nextIndex = currentIndex;
            if (direction === 'next') nextIndex = Math.min(currentIndex + 1, routes.length - 1);
            if (direction === 'prev') nextIndex = Math.max(currentIndex - 1, 0);

            if (nextIndex !== currentIndex) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: String(nextIndex), code: `Digit${nextIndex}`, bubbles: true }));
            }
        };

        gamepad?.on('buttonLT', currentRoute, () => navigate('prev'));
        gamepad?.on('buttonRT', currentRoute, () => navigate('next'));

        return () => {
            gamepad?.off('buttonLT', currentRoute);
            gamepad?.off('buttonRT', currentRoute);
        };
    }, [gamepad, currentRoute, routes]);
};

export default useVerticalGamepadNavigation;

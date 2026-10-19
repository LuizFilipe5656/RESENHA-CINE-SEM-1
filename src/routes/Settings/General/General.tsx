import React, { forwardRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCore } from 'stremio/core';
import { Button, Toggle } from 'stremio/components';
import { usePlatform, useToast, useDiscord } from 'stremio/common';
import { Section, Option } from '../components';
import useDataExport from './useDataExport';
import styles from './General.less';

type Props = {
    profile: Profile,
};

const General = forwardRef<HTMLDivElement, Props>(({ profile }: Props, ref) => {
    const { t } = useTranslation();
    const core = useCore();
    const platform = usePlatform();
    const toast = useToast();
    const discord = useDiscord();
    const [dataExport, loadDataExport] = useDataExport();

    const onExportData = useCallback(() => {
        loadDataExport();
    }, []);

    const onCalendarSubscribe = useCallback(() => {
        if (!profile.auth) return;

        const protocol = platform.name === 'ios' ? 'webcal' : 'https';
        const url = `${protocol}://www.strem.io/calendar/${profile.auth.user._id}.ics`;
        platform.openExternal(url);

        toast.show({
            type: 'success',
            title: platform.name === 'ios' ?
                t('SETTINGS_SUBSCRIBE_CALENDAR_IOS_TOAST') :
                t('SETTINGS_SUBSCRIBE_CALENDAR_TOAST'),
            timeout: 25000
        });
        // Stremio 4 emits not documented event subscribeCalendar
    }, [profile.auth]);

    const discordToggle = useMemo(() => ({
        checked: profile.settings.discordRpcEnabled === true,
        onClick: () => {
            core.transport.dispatch({
                action: 'Ctx',
                args: {
                    action: 'UpdateSettings',
                    args: {
                        ...profile.settings,
                        discordRpcEnabled: !profile.settings.discordRpcEnabled
                    }
                }
            });
        }
    }), [profile.settings]);

    useEffect(() => {
        if (dataExport.exportUrl) {
            platform.openExternal(dataExport.exportUrl);
        }
    }, [dataExport.exportUrl]);

    return <>
        <Section ref={ref}>
            {
                profile?.auth?.user &&
                    <Option className={styles['general-action-container']} icon={'trakt'} label={t('SETTINGS_DATA_EXPORT')}>
                        <Button className={'button'} title={t('SETTINGS_DATA_EXPORT')} onClick={onExportData}>
                            {t('SETTINGS_DATA_EXPORT')}
                        </Button>
                    </Option>
            }
            {
                profile?.auth?.user &&
                    <Option className={styles['general-action-container']} icon={'calendar'} label={t('SETTINGS_SUBSCRIBE_CALENDAR')}>
                        <Button className={'button'} title={t('SETTINGS_SUBSCRIBE_CALENDAR')} onClick={onCalendarSubscribe}>
                            {t('SETTINGS_SUBSCRIBE_CALENDAR')}
                        </Button>
                    </Option>
            }
            {
                discord.available &&
                    <Option className={styles['discord-container']} icon={'discord'} label={'SETTINGS_DISCORD'}>
                        <Toggle
                            tabIndex={-1}
                            {...discordToggle}
                        />
                    </Option>
            }
        </Section>
    </>;
});

export default General;

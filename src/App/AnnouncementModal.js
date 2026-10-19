const React = require('react');
const { useTranslation } = require('react-i18next');
const { ModalDialog } = require('stremio/components');
const { useRouteActive } = require('stremio/common/useRouteFocused');
const { useAuth } = require('../auth/AuthProvider');
const { useAddonSettings } = require('../addons/AddonSettingsContext');
const styles = require('./styles');

const keepAnnouncementOpen = () => undefined;
const acknowledgedAnnouncements = new Set();

const AnnouncementModal = () => {
    const { t } = useTranslation();
    const { account } = useAuth();
    const routeActive = useRouteActive();
    const { addonSettingsLoaded, announcements } = useAddonSettings();
    const accountId = account?.id || 'guest';
    const [, setAcknowledgementRevision] = React.useState(0);
    const announcement = announcements.find(({ id, updatedAt }) =>
        !acknowledgedAnnouncements.has(`${accountId}:${id}:${updatedAt}`));
    const acknowledge = React.useCallback(() => {
        if (!announcement) return;
        acknowledgedAnnouncements.add(`${accountId}:${announcement.id}:${announcement.updatedAt}`);
        setAcknowledgementRevision((revision) => revision + 1);
    }, [accountId, announcement]);

    if (!routeActive || !addonSettingsLoaded || !announcement) {
        return null;
    }

    return (
        <ModalDialog
            className={styles['announcement-modal']}
            title={t('CINE_ANNOUNCEMENT_TITLE', { defaultValue: 'Aviso da Resenha Garantida' })}
            buttons={[{
                label: t('BUTTON_OK', { defaultValue: 'OK' }),
                icon: 'check',
                props: { onClick: acknowledge },
            }]}
            onCloseRequest={keepAnnouncementOpen}
        >
            <p className={styles['announcement-message']}>{announcement.message}</p>
        </ModalDialog>
    );
};

module.exports = AnnouncementModal;

import { Box, Button, CircularProgress, Divider, Menu, MenuItem, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../Notifications/useNotifications';

// Same shape as the account popup: one click on the rail opens everything you
// need, and only the "show me the full history" case leaves for a route.
const LEVEL_COLOR = {
  error: '#d32f2f', exception: '#d32f2f', critical: '#d32f2f',
  warning: '#ed6c02', warn: '#ed6c02',
  info: '#2f6fed', success: '#2e7d32',
};

const PREVIEW = 6;

export default function NotificationsMenu({ anchorEl, open, onClose, onSeeAll }) {
  const { t } = useTranslation();
  const { notifications, loading, markAsRead } = useNotifications();

  const recent = (notifications || []).slice(0, PREVIEW);
  const unread = (notifications || []).filter((n) => !n.isRead).length;

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { sx: { width: 340, maxWidth: 'calc(100vw - 24px)', maxHeight: 460 } } }}
      data-testid="notifications-menu"
    >
      <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', flex: 1 }}>
          {t('menu.notifications', 'Notifications')}
        </Typography>
        {unread > 0 && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="notifications-unread">
            {t('notifications.unreadCount', '{{count}} unread', { count: unread })}
          </Typography>
        )}
      </Box>

      <Divider />

      {loading && recent.length === 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={22} />
        </Box>
      )}

      {!loading && recent.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3, textAlign: 'center' }}>
          {t('notifications.empty', 'Nothing new.')}
        </Typography>
      )}

      {recent.map((n) => (
        <MenuItem
          key={n.uuid || n.id}
          onClick={() => { if (!n.isRead) markAsRead(n.uuid); }}
          sx={{ alignItems: 'flex-start', gap: 1, whiteSpace: 'normal', py: 1 }}
          data-testid="notification-row"
        >
          {/* Unread carries a dot rather than a bold row: the subject can be
              long, and weight changes made the list jump as things were read. */}
          <Box
            sx={{
              width: 8, height: 8, borderRadius: '50%', mt: 0.75, flexShrink: 0,
              bgcolor: n.isRead ? 'transparent' : (LEVEL_COLOR[n.level] || LEVEL_COLOR.info),
              border: n.isRead ? '1px solid' : 'none', borderColor: 'divider',
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: n.isRead ? 400 : 600 }}>
              {n.subject || t('notifications.title', 'Notification')}
            </Typography>
            {n.timeAgo && (
              <Typography variant="caption" color="text.secondary">{n.timeAgo}</Typography>
            )}
          </Box>
        </MenuItem>
      ))}

      <Divider />

      <Box sx={{ p: 1 }}>
        <Button fullWidth size="small" onClick={onSeeAll} data-testid="notifications-see-all">
          {t('notifications.seeAll', 'See all notifications')}
        </Button>
      </Box>
    </Menu>
  );
}

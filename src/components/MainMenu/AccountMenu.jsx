import { useEffect, useState } from 'react';
import {
  Avatar, Box, Divider, ListItemIcon, Menu, MenuItem, Select, Typography,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import TranslateIcon from '@mui/icons-material/Translate';
import { useTranslation } from 'react-i18next';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { EVENTS_API } from '../Calls/useCalls';

// Language picks the DIRECTION too — Hebrew is RTL, English is LTR — so there
// is no separate RTL switch to fall out of sync with it.
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'he', label: 'עברית' },
];

const DOT = {
  up: '#2e7d32', ok: '#2e7d32', live: '#2e7d32',
  degraded: '#ed6c02', stale: '#ed6c02', idle: '#ed6c02',
  disabled: '#9e9e9e', offline: '#d32f2f', down: '#d32f2f',
};

/**
 * AccountMenu — everything about "me" in one popup: who is signed in, the
 * language, how the backend is doing, and the way out.
 *
 * System status lives here rather than behind a route because checking whether
 * the stream is alive is a glance, not a destination — it never warranted its
 * own screen. It is polled only while the menu is OPEN, so a closed menu costs
 * nothing.
 */
export default function AccountMenu({ anchorEl, open, onClose, user, onLogout }) {
  const { t } = useTranslation();
  const { language, changeLanguage } = useAppTranslation();
  const [checks, setChecks] = useState(null);   // [[name, {status}]] | [] | null=unreachable

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${EVENTS_API}/health`);
        const body = await res.json();
        if (alive) setChecks(Object.entries(body?.checks ?? {}));
      } catch {
        if (alive) setChecks(null);
      }
    };
    load();
    const id = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(id); };
  }, [open]);

  const name = user?.name || user?.email || t('phone.guest', 'guest');
  const email = user?.email || '';
  const extension = user?.raw?.extension?.username || '';

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { sx: { width: 290, maxWidth: '92vw' } } }}
      data-testid="account-menu"
    >
      {/* Who is signed in. The address is the identity, so it is not truncated. */}
      <Box sx={{ px: 2, py: 1.25, display: 'flex', gap: 1.25, alignItems: 'center' }}>
        <Avatar sx={{ width: 38, height: 38, bgcolor: '#2f6fed' }}>
          {(email || name).trim()[0]?.toUpperCase() || 'U'}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>{name}</Typography>
          {email && (
            <Typography variant="body2" color="text.secondary" data-testid="account-email" sx={{ wordBreak: 'break-all' }}>
              {email}
            </Typography>
          )}
          {extension && (
            <Typography variant="caption" color="text.secondary" data-testid="account-extension">
              {t('phone.extension', 'Extension')} {extension}
            </Typography>
          )}
        </Box>
      </Box>

      <Divider />

      {/* Language — and with it, direction. */}
      <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <TranslateIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="body2" sx={{ flex: 1 }}>{t('menu.language', 'Language')}</Typography>
        <Select
          size="small"
          variant="standard"
          value={LANGUAGES.some((l) => l.code === language) ? language : 'en'}
          onChange={(event) => changeLanguage(event.target.value)}
          data-testid="account-language-select"
          inputProps={{ 'aria-label': t('menu.language', 'Language') }}
        >
          {LANGUAGES.map((l) => (
            <MenuItem key={l.code} value={l.code} data-testid={`account-language-${l.code}`}>{l.label}</MenuItem>
          ))}
        </Select>
      </Box>

      <Divider />

      {/* System status, inline — a glance, not a screen. */}
      <Box sx={{ px: 2, py: 1 }} data-testid="account-status">
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t('menu.status', 'Status')}
        </Typography>
        {checks === null && (
          <Typography variant="body2" color="text.secondary">{t('status.unreachable', 'Backend unreachable')}</Typography>
        )}
        {checks?.map(([key, check]) => (
          <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: DOT[check?.status] || '#9e9e9e' }} />
            <Typography variant="body2" sx={{ flex: 1 }} noWrap>{t(`status.checks.${key}`, key)}</Typography>
            <Typography variant="caption" color="text.secondary">{check?.status}</Typography>
          </Box>
        ))}
      </Box>

      <Divider />

      <MenuItem onClick={onLogout} data-testid="account-logout">
        <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
        {t('menu.logout')}
      </MenuItem>
    </Menu>
  );
}

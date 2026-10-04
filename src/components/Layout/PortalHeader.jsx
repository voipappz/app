// Portal navigation and persistent server-side call search.
import { useEffect, useRef, useState } from 'react';
import { Avatar, Box, Button, IconButton, InputAdornment, Menu, MenuItem, Tooltip } from '@mui/material';
import TextSearchFilter from '../shared/Filters/TextSearchFilter';
import CloseIcon from '@mui/icons-material/Close';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useUserAuth } from '../../context/UserAuthContext';
import { usePortalPreferences } from '../../context/PortalPreferencesContext';
import { useAIChatSidebar } from '../../context/AIChatSidebarContext';
import { useSoftphone } from '../../context/SoftphoneContext';
import { canAccessScreen } from '../../utils/jwt';
import { loadCustomerPortalData } from '../../services/customerPortalService';
import { parseCustomerBrand } from '../../utils/customerBrand';

export default function PortalHeader() {
  const { user, acl, logout } = useUserAuth();
  const { preferences, ready, save, reset } = usePortalPreferences();
  const { openAIDrawer } = useAIChatSidebar();
  const { connected } = useSoftphone();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const query = params.get('q') || '';
  const [draft, setDraft] = useState(query);
  const [anchor, setAnchor] = useState(null);
  const [portalData, setPortalData] = useState(null);
  const input = useRef(null);
  const dashboardAllowed = canAccessScreen(acl, 'dashboard');
  const callsAllowed = canAccessScreen(acl, 'calls');
  const { logo: brandIcon, color: brandColor } = parseCustomerBrand(portalData);
  useEffect(() => {
    let alive = true;
    loadCustomerPortalData().then((data) => { if (alive) setPortalData(data); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { setDraft(query); }, [query, pathname]);
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k' && callsAllowed) {
        event.preventDefault(); input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [callsAllowed]);
  const search = (value) => {
    const next = pathname === '/my-calls' ? new URLSearchParams(params) : new URLSearchParams();
    if (value.trim()) next.set('q', value.trim()); else next.delete('q');
    next.delete('page');
    navigate(`/my-calls?${next}`);
  };
  const links = [
    ...(dashboardAllowed ? [{ label: 'Dashboard', path: '/' }, { label: 'Live', path: '/live' }] : []),
    ...(callsAllowed ? [{ label: 'Calls', path: '/my-calls' }] : []),
  ];
  return (
    <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: 1100, minHeight: 72, bgcolor: brandColor || '#141414', color: '#fff', px: { xs: 2, md: 4 }, py: 1.25, display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2.5 }, flexWrap: { xs: 'wrap', lg: 'nowrap' }, boxShadow: '0 1px 0 rgba(255,255,255,0.08)' }}>
      <Box component="img" src={brandIcon || '/images/VA_logo_white.png'} alt={portalData?.logo_title || portalData?.name || 'VoipAppz'} sx={{ order: 0, width: { xs: 88, md: 108 }, height: 36, objectFit: 'contain', flexShrink: 0 }} />
      <Box component="nav" aria-label="Portal navigation" sx={{ order: { xs: 2, lg: 0 }, width: { xs: '100%', lg: 'auto' }, display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, overflowX: { xs: 'auto', lg: 'visible' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
        {links.map(({ label, path }) => {
          const active = pathname === path;
          return <Button key={path} onClick={() => navigate(path)} aria-current={active ? 'page' : undefined} disableElevation sx={{ color: active ? '#fff' : 'rgba(255,255,255,0.72)', bgcolor: active ? 'rgba(255,255,255,0.16)' : 'transparent', borderRadius: '999px', px: 2.25, minHeight: 42, fontWeight: active ? 700 : 500, textTransform: 'none', whiteSpace: 'nowrap', '&:hover': { bgcolor: active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.09)', color: '#fff' } }}>{label}</Button>;
        })}
        <Button onClick={openAIDrawer} sx={{ color: 'rgba(255,255,255,0.72)', borderRadius: '999px', px: 2.25, minHeight: 42, fontWeight: 500, textTransform: 'none', whiteSpace: 'nowrap', '&:hover': { bgcolor: 'rgba(255,255,255,0.09)', color: '#fff' } }}>Assistant</Button>
      </Box>
      {callsAllowed && <Box component="form" onSubmit={(event) => { event.preventDefault(); search(draft); }} sx={{ flex: 1, minWidth: { xs: '100%', md: 260 }, maxWidth: { lg: 680 }, mx: { lg: 'auto' }, order: { xs: 3, lg: 0 } }}>
        <TextSearchFilter field="inline" inputRef={input} value={draft} onChange={(_field, value) => setDraft(value)} placeholder="Search calls, names or numbers…" inputProps={{ 'aria-label': 'Search calls', maxLength: 200 }}
          sx={{ '& .MuiOutlinedInput-root': { height: 44, color: '#fff', bgcolor: 'rgba(255,255,255,0.08)', borderRadius: '8px', '& fieldset': { borderColor: 'rgba(255,255,255,0.18)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.38)' }, '&.Mui-focused fieldset': { borderColor: 'rgba(255,255,255,0.72)' } }, '& .MuiInputAdornment-root svg': { color: 'rgba(255,255,255,0.66)' }, '& input::placeholder': { color: 'rgba(255,255,255,0.48)', opacity: 1 } }}
          endAdornment={draft ? <InputAdornment position="end"><IconButton size="small" aria-label="Clear search" onClick={() => { setDraft(''); search(''); }} sx={{ color: 'rgba(255,255,255,0.7)' }}><CloseIcon fontSize="small" /></IconButton></InputAdornment> : undefined} />
      </Box>}
      <Box sx={{ order: { xs: 1, lg: 0 }, display: 'flex', alignItems: 'center', gap: 1, marginInlineStart: 'auto', flexShrink: 0 }}>
        <Tooltip title={connected ? 'Phone connected' : 'Phone disconnected'}><Box component="span" aria-label={connected ? 'Phone connected' : 'Phone disconnected'} sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: connected ? '#28d17c' : 'rgba(255,255,255,0.35)', boxShadow: connected ? '0 0 0 3px rgba(40,209,124,0.12)' : 'none' }} /></Tooltip>
        <IconButton aria-label="Your account and preferences" onClick={(event) => setAnchor(event.currentTarget)} sx={{ p: 0.5, color: '#fff' }}><Avatar sx={{ width: 38, height: 38, bgcolor: 'rgba(255,255,255,0.18)', color: '#fff', fontWeight: 700 }}>{(user?.name || user?.email || 'U').slice(0, 1)}</Avatar></IconButton>
      </Box>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem disabled>{user?.name || user?.email}</MenuItem>
        <MenuItem disabled={!ready} onClick={() => save({ theme: preferences.theme === 'dark' ? 'light' : 'dark' })}>{preferences.theme === 'dark' ? 'Light appearance' : 'Dark appearance'}</MenuItem>
        <MenuItem disabled={!ready} onClick={() => { reset(); setAnchor(null); }}>Reset my preferences</MenuItem>
        <MenuItem onClick={logout}>Sign out</MenuItem>
      </Menu>
    </Box>
  );
}

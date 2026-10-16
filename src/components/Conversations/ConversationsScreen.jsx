import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Box, IconButton, Typography, useMediaQuery } from '@mui/material';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import Bdi from '../../i18n/Bdi';
import PhoneScreen from '../Phone/PhoneScreen.jsx';
import SessionList from './SessionList.jsx';
import ConversationThread from './ConversationThread.jsx';
import { ROOM } from './DarkPanel.jsx';
import useConversations from './useConversations';

const LIST_KEY = 'conversations-list-hidden';
const readHidden = () => { try { return localStorage.getItem(LIST_KEY) === '1'; } catch { return false; } };

/**
 * The user's working screen: saved conversations (list and thread) | phone.
 * A minimal full-height shell; the admin navbar and sidebar are not mounted.
 * Wide: three columns, the menu button hides the list. Under 1060px the list
 * opens over the thread. Under 620px the phone is above the saved history.
 */
export default function ConversationsScreen() {
  const { t } = useTranslation('conversations');
  const c = useConversations();
  const narrow = useMediaQuery('(max-width:1060px)');
  const phoneWidth = useMediaQuery('(max-width:620px)');
  const [hidden, setHidden] = useState(readHidden);
  const [overlay, setOverlay] = useState(false);
  const [threadRange, setThreadRange] = useState({ from: '', to: '' });

  useEffect(() => { try { localStorage.setItem(LIST_KEY, hidden ? '1' : '0'); } catch { /* storage off */ } }, [hidden]);
  useEffect(() => { document.title = t('title'); }, [t]);

  const toggle = () => (narrow ? setOverlay((o) => !o) : setHidden((h) => !h));
  const showList = c.canCalls && (narrow ? overlay : !hidden);
  const pick = (id) => { c.select(id); setOverlay(false); };

  const menu = c.canCalls && (
    <IconButton size="small" onClick={toggle} aria-label={t('toggleList')} sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}><MenuIcon fontSize="small" /></IconButton>
  );
  const heading = c.selected ? (c.selected.contact?.name || c.selected.remote_number || '') : t('title');

  const columns = phoneWidth
    ? '1fr'
    : `${showList && !narrow ? '300px ' : ''}minmax(0, 1fr) ${narrow ? '300px' : '320px'}`;

  return (
    <Box
      data-testid="conversations-screen"
      sx={{
        display: 'grid', gridTemplateColumns: columns, gridTemplateRows: phoneWidth ? 'auto minmax(420px, 1fr)' : '1fr',
        height: phoneWidth ? 'auto' : '100dvh', minHeight: '100dvh', bgcolor: 'background.default', position: 'relative', overflow: phoneWidth ? 'visible' : 'hidden',
      }}
    >
      {showList && !narrow && (
        <Box component="aside" sx={{ borderInlineEnd: 1, borderColor: 'divider', bgcolor: 'background.paper', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 64, boxSizing: 'border-box', borderBottom: 1, borderColor: 'divider' }}>{menu}<Typography sx={{ fontWeight: 600, fontSize: 15 }}>{t('list.title')}</Typography></Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <SessionList tab={c.tab} onTab={c.setTab} sessions={c.sessions} selectedId={c.selectedId} onSelect={pick} loading={c.listLoading} error={c.listError} search={c.search} onSearch={c.setSearch} view={c.view} onView={c.setView} canEveryone={c.canEveryone} />
          </Box>
        </Box>
      )}

      {showList && narrow && (
        <Box component="aside" data-testid="list-overlay" sx={{ position: 'absolute', zIndex: 3, insetBlock: 0, insetInlineStart: 0, width: 'min(320px, 85vw)', bgcolor: 'background.paper', boxShadow: 6, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 64, boxSizing: 'border-box', borderBottom: 1, borderColor: 'divider' }}>{menu}<Typography sx={{ fontWeight: 600, fontSize: 15 }}>{t('list.title')}</Typography></Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <SessionList tab={c.tab} onTab={c.setTab} sessions={c.sessions} selectedId={c.selectedId} onSelect={pick} loading={c.listLoading} error={c.listError} search={c.search} onSearch={c.setSearch} view={c.view} onView={c.setView} canEveryone={c.canEveryone} />
          </Box>
        </Box>
      )}

      <Box component="main" sx={{ order: phoneWidth ? 2 : 0, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, bgcolor: 'background.default', borderInlineEnd: phoneWidth ? 0 : 1, borderColor: 'divider' }}>
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 64, boxSizing: 'border-box', bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          {!showList && menu}
          {c.selected && <Avatar sx={{ width: 36, height: 36, bgcolor: 'action.selected', color: 'text.secondary', fontSize: 14 }}>{c.selected.contact?.name?.trim()[0] || <PhoneOutlinedIcon fontSize="small" />}</Avatar>}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 600, fontSize: 15 }}><Bdi>{heading}</Bdi></Typography>
            {c.selected && <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
              {c.selected.contact?.name ? <Bdi>{c.selected.remote_number}</Bdi> : t('thread.history')}
            </Typography>}
          </Box>
        </Box>
        {c.selected && !c.listLoading && !c.listError && !c.sessions.some((session) => session.call_uuid === c.selectedId) && (
          <Box sx={{ px: 2.5, py: 1, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{t('thread.outsideFilter')}</Typography>
          </Box>
        )}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {c.canCalls ? (
            <ConversationThread
              selected={c.selected} events={c.events} loading={c.threadLoading} error={c.threadError} onRetry={c.reloadThread}
              canNotes={c.canNotes} onNote={c.sendNote} sendError={c.sendError}
              range={threadRange} onRangeChange={setThreadRange}
            />
          ) : (
            <Typography color="text.secondary" sx={{ p: 3 }}>{t('noAccess')}</Typography>
          )}
        </Box>
      </Box>

      <Box component="aside" sx={{ order: phoneWidth ? 1 : 0, bgcolor: ROOM, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}><PhoneScreen embedded /></Box>
      </Box>
    </Box>
  );
}

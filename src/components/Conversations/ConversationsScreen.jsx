import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, IconButton, Typography, useMediaQuery } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import Bdi from '../../i18n/Bdi';
import PhoneScreen from '../Phone/PhoneScreen.jsx';
import SessionList from './SessionList.jsx';
import ConversationThread from './ConversationThread.jsx';
import ContactPanel from './ContactPanel.jsx';
import useConversations from './useConversations';

const LIST_KEY = 'conversations-list-hidden';
const readHidden = () => { try { return localStorage.getItem(LIST_KEY) === '1'; } catch { return false; } };

/**
 * The user's working screen: sessions | thread | phone with the contact under it.
 * A minimal full-height shell; the admin navbar and sidebar are not mounted.
 * Wide: three columns, the menu button hides the list. Under 900px the list
 * opens over the thread. Under 620px the phone is on top, the thread under it
 * and the contact is hidden.
 */
export default function ConversationsScreen() {
  const { t } = useTranslation('conversations');
  const c = useConversations();
  const narrow = useMediaQuery('(max-width:900px)');
  const phoneWidth = useMediaQuery('(max-width:620px)');
  const [hidden, setHidden] = useState(readHidden);
  const [overlay, setOverlay] = useState(false);

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
    : `${showList && !narrow ? '260px ' : ''}minmax(0, 1fr) ${narrow ? '300px' : '320px'}`;

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
          <Box sx={{ p: 1.25, display: 'flex', alignItems: 'center', gap: 1, minHeight: 52, borderBottom: 1, borderColor: 'divider' }}>{menu}<Typography sx={{ fontWeight: 500 }}>{t('list.title')}</Typography></Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <SessionList tab={c.tab} onTab={c.setTab} sessions={c.sessions} selectedId={c.selectedId} onSelect={pick} loading={c.listLoading} error={c.listError} liveConnected={c.liveConnected} search={c.search} onSearch={c.setSearch} view={c.view} onView={c.setView} canEveryone={c.canEveryone} />
          </Box>
        </Box>
      )}

      {showList && narrow && (
        <Box component="aside" data-testid="list-overlay" sx={{ position: 'absolute', zIndex: 3, insetBlock: 0, insetInlineStart: 0, width: 'min(280px, 85vw)', bgcolor: 'background.paper', boxShadow: 6, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 1.25, display: 'flex', alignItems: 'center', gap: 1, minHeight: 52, borderBottom: 1, borderColor: 'divider' }}>{menu}<Typography sx={{ fontWeight: 500 }}>{t('list.title')}</Typography></Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <SessionList tab={c.tab} onTab={c.setTab} sessions={c.sessions} selectedId={c.selectedId} onSelect={pick} loading={c.listLoading} error={c.listError} liveConnected={c.liveConnected} search={c.search} onSearch={c.setSearch} view={c.view} onView={c.setView} canEveryone={c.canEveryone} />
          </Box>
        </Box>
      )}

      <Box component="main" sx={{ order: phoneWidth ? 2 : 0, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, bgcolor: 'action.hover', borderInlineEnd: phoneWidth ? 0 : 1, borderColor: 'divider' }}>
        <Box sx={{ p: 1.25, display: 'flex', alignItems: 'center', gap: 1, minHeight: 52, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          {!showList && menu}
          <Typography noWrap sx={{ fontWeight: 500, flex: 1 }}>
            {c.selected?.contact?.name ? <>{c.selected.contact.name} · <Bdi>{c.selected.remote_number}</Bdi></> : <Bdi>{heading}</Bdi>}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {c.canCalls ? (
            <ConversationThread
              selected={c.selected} events={c.events} loading={c.threadLoading}
              canNotes={c.canNotes} onNote={c.sendNote} sendError={c.sendError}
            />
          ) : (
            <Typography color="text.secondary" sx={{ p: 3 }}>{t('noAccess')}</Typography>
          )}
        </Box>
      </Box>

      <Box component="aside" sx={{ order: phoneWidth ? 1 : 0, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        <Box sx={{ flexShrink: 0 }}><PhoneScreen embedded /></Box>
        {c.canContacts && !phoneWidth && (
          <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <ContactPanel phone={c.selected?.remote_number} contactUuid={c.selected?.contact?.uuid} />
          </Box>
        )}
      </Box>
    </Box>
  );
}

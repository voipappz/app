import { useCallback, useEffect, useMemo, useState } from 'react';
import { listConversations, getEvents, addNote, MOCK_CONVERSATIONS } from '../../services/api/conversationsApi';
import { messagesApi } from '../../services/api/messagesApi';
import { usePermissions } from '../../hooks/usePermissions';
import { useSoftphone } from '../../context/SoftphoneContext';
import { useLiveEnvironment } from '../LiveDashboard/useLiveEnvironment';
import useLiveEntities from '../../hooks/useLiveEntities';
import { liveSessions } from './liveSessions';
import { SORTS, applyView, digitsOf, readView, saveView } from './viewOptions';
import { liveRowsDoc } from './fixtures';

const rowsOf = (res) => (Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);

/** State of the Conversations screen: list, selection, thread, composer. */
export default function useConversations() {
  const { can } = usePermissions();
  const canCalls = can('calls');
  const { call } = useSoftphone();
  const { uuid: environmentUuid } = useLiveEnvironment();
  const live = useLiveEntities(environmentUuid, null);

  const [tab, setTab] = useState('live');
  const [history, setHistory] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [view, setViewState] = useState(readView);
  const canEveryone = can('call', 'environment');
  const setView = useCallback((patch) => setViewState((v) => { const next = { ...v, ...patch }; saveView(next); return next; }), []);
  // The API search is debounced; live rows filter as you type.
  useEffect(() => {
    const id = setTimeout(() => setQuery(digitsOf(search)), 300);
    return () => clearTimeout(id);
  }, [search]);
  const [selectedId, setSelectedId] = useState(null);
  const [events, setEvents] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sendError, setSendError] = useState(false);

  const liveDoc = MOCK_CONVERSATIONS ? liveRowsDoc : live.byScope('environment')[0];
  const allLive = useMemo(() => liveSessions(liveDoc), [liveDoc]);
  const liveRows = useMemo(() => applyView(allLive, { query: search, view }), [allLive, search, view]);

  // History: only All / Missed come from the API.
  useEffect(() => {
    if (!canCalls || tab === 'live') return undefined;
    let alive = true;
    setListLoading(true);
    setListError(false);
    listConversations({
      tab, q: query || undefined, orderBy: SORTS[view.sort].orderBy, orderKind: SORTS[view.sort].orderKind,
      direction: view.direction || undefined, outcome: view.outcome || undefined, scope: view.everyone ? 'environment' : undefined,
    })
      .then((res) => { if (alive) setHistory(rowsOf(res)); })
      .catch(() => { if (alive) { setHistory([]); setListError(true); } })
      .finally(() => { if (alive) setListLoading(false); });
    return () => { alive = false; };
  }, [tab, canCalls, query, view]);

  const sessions = tab === 'live' ? liveRows : history;

  // The phone's current call selects its conversation.
  const phoneCallId = call && call.state !== 'ended' ? call.id : null;
  useEffect(() => { if (phoneCallId) setSelectedId(phoneCallId); }, [phoneCallId]);

  const selected = useMemo(
    () => allLive.find((s) => s.call_uuid === selectedId)
      || history.find((s) => s.call_uuid === selectedId)
      || (selectedId && selectedId === phoneCallId
        ? { call_uuid: selectedId, remote_number: call?.remote || '', direction: call?.direction, live: true, contact: null }
        : null),
    [allLive, history, selectedId, phoneCallId, call]
  );

  const loadEvents = useCallback(async (id) => {
    if (!id || !canCalls) { setEvents([]); return; }
    try { setEvents(rowsOf(await getEvents(id))); } catch { setEvents([]); }
  }, [canCalls]);

  useEffect(() => {
    let alive = true;
    setThreadLoading(true);
    loadEvents(selectedId).finally(() => { if (alive) setThreadLoading(false); });
    return () => { alive = false; };
  }, [selectedId, loadEvents]);

  const sendNote = useCallback(async (text) => {
    setSendError(false);
    try { await addNote(selectedId, text); await loadEvents(selectedId); return true; }
    catch { setSendError(true); return false; }
  }, [selectedId, loadEvents]);

  const sendSms = useCallback(async (text) => {
    setSendError(false);
    try { await messagesApi.send({ to: selected?.remote_number, text }); await loadEvents(selectedId); return true; }
    catch { setSendError(true); return false; }
  }, [selected, selectedId, loadEvents]);

  return {
    tab, setTab, sessions, listLoading, listError, liveConnected: live.connected,
    selectedId, select: setSelectedId, selected,
    events, threadLoading, sendNote, sendSms, sendError,
    canCalls,
    canNotes: can('notes'), canSms: can('messages'), canContacts: can('contact'),
    search, setSearch, view, setView, canEveryone,
  };
}

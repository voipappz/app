import { useCallback, useEffect, useMemo, useState } from 'react';
import { listConversations } from '../../services/api/conversationsApi';
import useConversationHistory from './useConversationHistory';
import useConversationNotifications from './useConversationNotifications';
import { usePermissions } from '../../hooks/usePermissions';
import { SORTS, digitsOf, readView, saveView } from './viewOptions';

const rowsOf = (res) => (Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);

/** State of the Conversations screen: list, selection, thread, composer. */
export default function useConversations() {
  const { can } = usePermissions();
  const canCalls = can('calls');
  const [tab, setTab] = useState('all');
  const [history, setHistory] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [view, setViewState] = useState(readView);
  // TODO(acl): the real action name for "see everyone's conversations" comes with the ACL work.
  const canEveryone = can('call', 'environment');
  const setView = useCallback((patch) => setViewState((v) => { const next = { ...v, ...patch }; saveView(next); return next; }), []);
  // Search the saved history after typing settles.
  useEffect(() => {
    const id = setTimeout(() => setQuery(digitsOf(search)), 300);
    return () => clearTimeout(id);
  }, [search]);
  const [selection, setSelection] = useState(null);
  const selectedId = selection?.call_uuid || null;
  const select = useCallback((id) => {
    setSelection(history.find((row) => row.call_uuid === id) || null);
  }, [history]);
  const [revision, setRevision] = useState(0);
  // History: only All / Missed come from the API.
  useEffect(() => {
    if (!canCalls) { setHistory([]); return undefined; }
    let alive = true;
    setListLoading(true);
    setListError(false);
    listConversations({
      tab, q: query || undefined, orderBy: SORTS[view.sort].orderBy, orderKind: SORTS[view.sort].orderKind,
      direction: view.direction || undefined, outcome: view.outcome || undefined, scope: canEveryone && view.everyone ? 'environment' : undefined,
      from: view.from || undefined, to: view.to || undefined,
    })
      .then((res) => { if (alive) setHistory(rowsOf(res)); })
      .catch(() => { if (alive) setListError(true); })
      .finally(() => { if (alive) setListLoading(false); });
    return () => { alive = false; };
  }, [tab, canCalls, canEveryone, query, view, revision]);

  const sessions = canCalls ? history : [];
  const selected = useMemo(
    () => canCalls ? (sessions.find((s) => s.call_uuid === selectedId) || selection) : null,
    [sessions, selectedId, selection, canCalls]
  );
  const canNotes = can('notes', 'write') || can('notes', 'create');
  const thread = useConversationHistory(selected?.call_uuid, { canRead: canCalls, canNotes });
  const { reloadThread } = thread;
  const refresh = useCallback(() => {
    setRevision((v) => v + 1);
    reloadThread();
  }, [reloadThread]);
  useConversationNotifications({ enabled: canCalls, onChange: refresh });

  return {
    tab, setTab, sessions, listLoading, listError,
    selectedId, select, selected,
    ...thread,
    canCalls,
    canNotes,
    search, setSearch, view, setView, canEveryone,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { getEvents, addNote } from '../../services/api/conversationsApi';

const conversationsApi = { getEvents, addNote };

const rowsOf = (res) => Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];

/** Saved events and notes for one call. The API owns Event Store access. */
export default function useConversationHistory(callId, { canRead, canNotes, api = conversationsApi }) {
  const [state, setState] = useState({ callId: null, events: [], loading: false, error: false, sendError: false });
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const reloadThread = useCallback(() => setRevision((v) => v + 1), []);

  useEffect(() => {
    const current = ++generation.current;
    setState((previous) => ({
      callId,
      events: canRead && previous.callId === callId ? previous.events : [],
      loading: Boolean(callId && canRead && (previous.callId !== callId || previous.events.length === 0)),
      error: false,
      sendError: false,
    }));
    if (!callId || !canRead) return undefined;
    api.getEvents(callId)
      .then((res) => {
        if (current === generation.current) setState((s) => ({ ...s, events: rowsOf(res), loading: false }));
      })
      .catch(() => {
        if (current === generation.current) setState((s) => ({ ...s, error: true, loading: false }));
      });
    return () => { generation.current += 1; };
  }, [callId, canRead, api, revision]);

  const sendNote = useCallback(async (text) => {
    if (!callId || !canRead || !canNotes || !text.trim()) return false;
    const current = generation.current;
    setState((s) => ({ ...s, sendError: false }));
    try {
      await api.addNote(callId, text.trim());
      // A saved note must not be sent twice if refreshing its history fails.
      if (current === generation.current) reloadThread();
      return true;
    } catch {
      if (current === generation.current) setState((s) => ({ ...s, sendError: true }));
      return false;
    }
  }, [callId, canRead, canNotes, api, reloadThread]);

  const visible = canRead && state.callId === callId;
  return {
    events: visible ? state.events : [],
    threadLoading: Boolean(callId && canRead && (!visible || state.loading)),
    threadError: visible && state.error,
    sendError: visible && state.sendError,
    sendNote,
    reloadThread,
  };
}

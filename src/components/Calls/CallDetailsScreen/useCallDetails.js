import { useEffect, useState } from 'react';
import { callsApi } from '../../../services/api/callsApi';
import { callFacts } from '../CallLogRow/callDirection';

// status: 'loading' | 'done' | 'error'
const LOADING = { status: 'loading', text: null, calls: [] };

/**
 * What the details page loads beyond the call itself: its transcription, and
 * the other calls with the same number. Opening another call reloads both; an
 * answer for a call no longer shown is dropped.
 */
export function useCallDetails(call) {
  const uuid = call?.uuid;
  const { number } = callFacts(call);
  const [transcript, setTranscript] = useState(LOADING);
  const [history, setHistory] = useState(LOADING);

  useEffect(() => {
    if (!uuid) return undefined;
    let current = true;
    setTranscript(LOADING);
    callsApi.getTranscript(uuid)
      .then((text) => { if (current) setTranscript({ status: 'done', text }); })
      .catch(() => { if (current) setTranscript({ status: 'error', text: null }); });
    return () => { current = false; };
  }, [uuid]);

  useEffect(() => {
    if (!uuid) return undefined;
    let current = true;
    setHistory(LOADING);
    callsApi.getNumberHistory(number)
      .then((calls) => { if (current) setHistory({ status: 'done', calls: calls.filter((c) => c.uuid !== uuid) }); })
      .catch(() => { if (current) setHistory({ status: 'error', calls: [] }); });
    return () => { current = false; };
  }, [uuid, number]);

  return { transcript, history };
}

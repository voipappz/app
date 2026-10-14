import { useEffect, useState } from 'react';
import { callsApi } from '../../../services/api/callsApi';

// status: 'loading' | 'done' | 'error'
const LOADING = { status: 'loading', text: null };

/**
 * What the details page loads beyond the call itself: its transcription.
 * Opening another call reloads it; an answer for a call no longer shown is
 * dropped.
 */
export function useCallDetails(call) {
  const uuid = call?.uuid;
  const [transcript, setTranscript] = useState(LOADING);

  useEffect(() => {
    if (!uuid) return undefined;
    let current = true;
    setTranscript(LOADING);
    callsApi.getTranscript(uuid)
      .then((text) => { if (current) setTranscript({ status: 'done', text }); })
      .catch(() => { if (current) setTranscript({ status: 'error', text: null }); });
    return () => { current = false; };
  }, [uuid]);

  return { transcript };
}

import { useCallback, useEffect, useState } from 'react';
import { callsApi } from '../../../services/api/callsApi';

// status: 'loading' | 'done' | 'error'
const LOADING = { status: 'loading', text: null };
const IDLE = { status: 'idle', error: null };

/**
 * What the details page loads beyond the call itself: its transcription.
 * Opening another call reloads it; an answer for a call no longer shown is
 * dropped. `transcribe` asks the server for one (the Transcribe button);
 * `request` is { status: 'idle' | 'sending' | 'sent' | 'error', error }.
 * `reload` reads the transcription again (Try again after a failed read).
 */
export function useCallDetails(call) {
  const uuid = call?.uuid;
  const [transcript, setTranscript] = useState(LOADING);
  const [request, setRequest] = useState(IDLE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!uuid) return undefined;
    let current = true;
    setTranscript(LOADING);
    setRequest(IDLE);
    callsApi.getTranscript(uuid)
      .then((text) => { if (current) setTranscript({ status: 'done', text }); })
      .catch(() => { if (current) setTranscript({ status: 'error', text: null }); });
    return () => { current = false; };
  }, [uuid, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const transcribe = useCallback(() => {
    if (!uuid) return;
    setRequest({ status: 'sending', error: null });
    callsApi.requestTranscription(uuid)
      .then(() => setRequest({ status: 'sent', error: null }))
      .catch((error) => setRequest({ status: 'error', error: error?.message || null }));
  }, [uuid]);

  return { transcript, request, transcribe, reload };
}

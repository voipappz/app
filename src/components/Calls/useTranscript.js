import { useEffect, useState } from 'react';
import { DENO_API_BASE } from '../../lib/clients/denoApi';
import { getStoredMockTranscript } from './conversation-mocks';

/**
 * loadTranscript(callId) — PURE async fetch of a call's transcript (no React),
 * so it's unit-testable on its own. Returns the engine `/calls/:id/transcript`
 * payload, or {status:'none'} on error. Honors the demo mock short-circuit
 * (a locally "transcribed" call returns its canned conversation) — that mock is
 * removed in a later step; this extraction is behavior-preserving on purpose.
 */
export async function loadTranscript(callId) {
  if (!callId) return null;
  const stored = getStoredMockTranscript(callId);
  if (stored) return stored;
  try {
    const r = await fetch(`${DENO_API_BASE}/calls/${encodeURIComponent(callId)}/transcript`);
    return await r.json();
  } catch {
    return { status: 'none', segments: [] };
  }
}

/**
 * useTranscript(callId) — React wrapper around loadTranscript: refetches when the
 * drawer's call changes, exposing { transcript, loading, setTranscript }.
 */
export function useTranscript(callId) {
  const [transcript, setTranscript] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!callId) { setTranscript(null); return; }
    let cancelled = false;
    setTranscript(null);
    setLoading(true);
    loadTranscript(callId).then((d) => { if (!cancelled) { setTranscript(d); setLoading(false); } });
    return () => { cancelled = true; };
  }, [callId]);

  return { transcript, loading, setTranscript };
}

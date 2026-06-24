// Engine transcript reader — the mothership (voipappz-api) is event-based; its
// event store is the source of truth. There is no local store, so the transcript
// endpoint reads on request: it queries the engine's `/api/events`
// (`ai.transcribe.done`) with a server-side account credential (basic auth) and
// returns the drawer-shaped view directly. The browser never holds engine creds.
import { ENGINE_URL, ENGINE_EMAIL, ENGINE_PASSWORD, ENGINE_ENABLED } from "./config.ts";

const basicAuth = "Basic " + btoa(`${ENGINE_EMAIL}:${ENGINE_PASSWORD}`);

// Shape the UI's call-detail drawer expects.
export interface TranscriptView {
  call_id: string;
  status: "completed" | "none";
  language: string | null;
  confidence: number | null;
  text: string;
  segments: Array<{ speaker?: string; text: string }>;
  summary?: string | null;
}

const NONE = (call_id: string): TranscriptView => ({
  call_id, status: "none", language: null, confidence: null, text: "", segments: [],
});

// Latest `ai.transcribe.done` for one call → transcript view (or status:none).
export async function fetchTranscript(callId: string): Promise<TranscriptView> {
  if (!ENGINE_ENABLED) return NONE(callId);
  const url = `${ENGINE_URL}/api/events/?event_type=ai.transcribe.done&per_page=200`;
  const res = await fetch(url, { headers: { Authorization: basicAuth } });
  if (!res.ok) throw new Error(`engine /api/events → ${res.status}`);
  const body = await res.json();
  const items: any[] = Array.isArray(body) ? body : (body.data ?? body.events ?? []);
  const ev = items.find((e) => (e?.data?.call_uuid ?? e?.data?.["call_uuid"]) === callId);
  if (!ev) return NONE(callId);
  const data = ev.data ?? {};
  const text = String(data.transcript ?? "");
  let segments: Array<{ speaker?: string; text: string }> = [];
  let summary: string | null = null;
  try {
    const ai = JSON.parse(String(data.ai ?? ""));
    if (Array.isArray(ai?.segments)) segments = ai.segments;
    if (typeof ai?.summary === "string") summary = ai.summary;
  } catch { /* ai optional → fall back to one raw-text segment */ }
  if (!segments.length && text) segments = [{ speaker: "A", text }];
  return {
    call_id: callId, status: "completed",
    language: data.language ? String(data.language) : null,
    confidence: null, text, segments, summary,
  };
}

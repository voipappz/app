import { normalizeCableEvent, type Normalized } from './cable.ts';

type JsonObject = Record<string, unknown>;

function decode(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function object(value: unknown): JsonObject | null {
  const decoded = decode(value);
  return decoded && typeof decoded === 'object' && !Array.isArray(decoded)
    ? decoded as JsonObject : null;
}

function eventTime(data: JsonObject, metadata: JsonObject): string | undefined {
  const candidate = data.end_epoch ?? data.created_at ?? metadata.created_at ??
    metadata['Event-Date-Timestamp'] ?? metadata['Event-Date-GMT'];
  if (candidate == null) return undefined;
  const numeric = Number(candidate);
  if (Number.isFinite(numeric) && numeric > 0) {
    const milliseconds = numeric >= 1e14 ? numeric / 1000 : numeric >= 1e11 ? numeric : numeric * 1000;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }
  const parsed = Date.parse(String(candidate));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function normalizeCdrWriteRow(value: unknown): Normalized[] {
  const row = object(value);
  if (!row) return [];
  const data = object(row.data) ?? {};
  const metadata = object(row.metadata) ?? {};
  const callId = row.call_uuid ?? data.va_call_uuid;
  if (callId == null || String(callId) === '') return [];
  return [{
    wsType: 'call.cdr',
    wsPayload: { ...data, metadata, call_id: String(callId) },
    occurredAtIso: eventTime(data, metadata),
    raw: row,
  }];
}

/**
 * Normalize the two va-crystal NATS contracts into the same event shape used
 * by the existing DuckDB writer. This is deliberately transport-free so NATS,
 * Cable, and fixtures all exercise identical ingestion behavior.
 */
export function normalizeNatsMessage(subject: string, message: unknown): Normalized[] {
  const decoded = decode(message);

  // Mature integration event emitted only after voipappz-api commits EventCdr
  // to RubyEventStore. Its event_id is the cross-system idempotency key.
  if (subject === 'events.cdr') {
    const envelope = object(decoded);
    if (!envelope || envelope.schema !== 'cdr.recorded.v1' || envelope.event_type !== 'EventCdr') return [];
    const eventId = envelope.event_id == null ? '' : String(envelope.event_id);
    const data = object(envelope.data);
    const metadata = object(envelope.metadata) ?? {};
    const callId = envelope.call_id ?? data?.va_call_uuid;
    if (!eventId || !data || !callId) return [];
    const timestamp = envelope.timestamp == null ? undefined : String(envelope.timestamp);
    return [{
      wsType: 'call.cdr',
      // Producer data is intentionally lossless, but cannot override the
      // canonical identity carried by the committed envelope.
      wsPayload: { ...data, metadata, call_id: String(callId) },
      occurredAtIso: timestamp && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : undefined,
      sourceEventId: eventId,
      raw: envelope,
    }];
  }

  if (subject === 'cdr.write.bulk') {
    return Array.isArray(decoded) ? decoded.flatMap(normalizeCdrWriteRow) : [];
  }

  // Legacy single-row writer uses the identical {call_uuid,data,metadata}
  // shape. Supporting it costs no second interpretation and makes migrations
  // between the old and current va-crystal publishers observable.
  if (subject === 'cdr.write') return normalizeCdrWriteRow(decoded);

  // node.<uuid> carries the same event JSON that va-crystal broadcasts over
  // CallEvents. Reuse the tested Cable normalizer rather than maintaining a
  // second interpretation of action/type_uuid/metadata.
  const event = normalizeCableEvent(decoded);
  return event ? [event] : [];
}

import { normalizeNatsMessage } from './event_ingestion.ts';
import type { EventStore } from './event_store.ts';

export const CDR_SYNC_SOURCE = 'voipappz_api_event_cdr';

export interface ReconcileResult {
  pages: number;
  inserted: number;
  duplicates: number;
  cursor_event_id: string | null;
  head_event_id: string | null;
  caught_up: boolean;
}

type RequestPage = (request: { after_event_id: string | null; limit: number }) => Promise<unknown>;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Reconcile ordered EventCdr pages. Core NATS delivery itself is not trusted. */
export async function reconcileEventCdr(
  store: EventStore,
  requestPage: RequestPage,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<ReconcileResult> {
  const pageSize = Math.max(1, Math.min(1_000, options.pageSize ?? 250));
  const maxPages = Math.max(1, options.maxPages ?? 100);
  const previous = await store.syncState(CDR_SYNC_SOURCE);
  let cursor = previous?.cursor_event_id ?? null;
  let inserted = 0;
  let duplicates = 0;
  let head: string | null = previous?.head_event_id ?? null;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const raw = object(await requestPage({ after_event_id: cursor, limit: pageSize }));
    if (!raw || raw.schema !== 'cdr.replay.v1') throw new Error('invalid CDR replay response');
    if (raw.error) throw new Error(`CDR replay error: ${String(raw.error)}`);
    const envelopes = Array.isArray(raw.events) ? raw.events : null;
    if (!envelopes) throw new Error('CDR replay response has no events array');

    const events = envelopes.flatMap((envelope) => normalizeNatsMessage('events.cdr', envelope));
    if (events.length !== envelopes.length) throw new Error('CDR replay contains an invalid event');

    const nextCursor = raw.next_after_event_id == null ? cursor : String(raw.next_after_event_id);
    head = raw.head_event_id == null ? null : String(raw.head_event_id);
    const caughtUp = raw.caught_up === true;
    if (events.length > 0 && nextCursor === cursor) throw new Error('CDR replay cursor did not advance');

    const persisted = await store.ingestReplayPage(events, {
      source: CDR_SYNC_SOURCE,
      cursorEventId: nextCursor,
      headEventId: head,
      caughtUp,
    });
    inserted += persisted.inserted;
    duplicates += persisted.duplicates;
    cursor = nextCursor;

    if (caughtUp) {
      return { pages: pageNumber, inserted, duplicates, cursor_event_id: cursor, head_event_id: head, caught_up: true };
    }
    if (raw.has_more !== true) throw new Error('CDR replay stopped before reaching its head');
  }
  throw new Error(`CDR replay exceeded ${maxPages} pages`);
}

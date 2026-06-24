# VA-Deno Project

> **📐 Current architecture: see [../ARCHITECTURE.md](../ARCHITECTURE.md).** deno-api is the
> app's single backend ("the brain"): account login (`POST /auth/login` → PostgREST
> `/rpc/login`), the cable→DuckDB consumer + `/ws` live feed, and the transcription/recording
> worker. **No Supabase** in the auth/read path (login is the accounts table; reads are
> PostgREST). The PDF/email/DocuSeal/Fireberry pieces below are optional per-tenant stubs.

## Overview

deno-api is the VoIPAppZ admin's backend gateway. Its core job is the calls/events plane
(cable → DuckDB projection, `/ws` live, account login → PostgREST). Transcription
runs in the mothership; deno projects its events and backfills from the engine. It also ships optional per-tenant integration stubs — PDF
contract generation, SMTP email, DocuSeal e-signing, Fireberry CRM sync — documented below;
wire them up per deployment as needed (Hebrew/RTL business context).

## Architecture

```
Client POST/PATCH → Supabase → Realtime subscription → Fireberry API sync
                                    ↓
                              PDF generation (on status change)
                                    ↓
                    ┌───────────────┴───────────────┐
              Email to signatory              DocuSeal e-signing
              (SMTP via Pepipost)             (POST /submissions/pdf)
                                                    ↓
                                         Upload to 'unsigned-documents'
                                              (Supabase Storage)
                                                    ↓
                                              Webhook callback
                                              (form.completed)
                                                    ↓
                                         Download signed PDF →
                                         Upload to 'signed-documents'
                                              (Supabase Storage)
                                                    ↓
                                              Update order status
                                              (customer_signed)
```

## Tech Stack

- **Runtime:** Deno (TypeScript)
- **Database:** Supabase (PostgreSQL)
- **External API:** Fireberry CRM
- **PDF:** pdf-lib
- **Email:** nodemailer (SMTP via Pepipost)
- **E-Signing:** DocuSeal (EU region, `api.docuseal.eu`)
- **Testing:** Deno test + Cypress

## Service Topology

The Deno backend is split into two compose services:

| Service (compose) | Entry point | Port | Role |
|---|---|---|---|
| `deno-api` | `api/supabase.ts` (boots HTTP via `api/server.ts`) | `3000` | Routing, auth, email, DocuSeal, Fireberry sync, realtime subscriptions. Calls `pdf-api` for PDF generation. |
| `pdf-api`  | `api/pdf-service/server.ts` | `8001` (network only) | PDF generation only. Not exposed to the host. |

`deno-api` reads `PDF_SERVICE_URL` (defaults to `http://pdf-api:8001`) and forwards
PDF requests internally via `api/pdf_client.ts`.

**Auth model**: `pdf-api`'s port isn't published, so only services on the compose
network can reach it. That network boundary is the entire boundary — no shared
secret header (the `INTERNAL_PDF_TOKEN` gate was removed in `d42e73f` as toil
without added defense). In Kamal production both run inside a single container
(see `Dockerfile.production`), communicating over loopback only.

## Key Files

| File | Purpose |
|------|---------|
| `supabase.ts` | `deno-api` entry point — realtime subscriptions |
| `server.ts` | `deno-api` HTTP endpoints (`/new`, `/send_pdf`, `/sign_pdf`, `/sign_company_pdf`, `/webhook/docuseal`, `/test`) |
| `pdf-service/server.ts` | `pdf-api` entry point — single-file PDF generation server |
| `fireberry_sync.ts` | Sync logic & data transformation |
| `email_service.ts` | Email sending via SMTP (PDF contract delivery) |
| `docuseal_service.ts` | DocuSeal e-signing: client, sign functions, webhook handler |
| `db.ts` | Database query layer |
| `fireberry_mapping.ts` | Field mappings between systems |
| `pdf/pdf_service.ts` | PDF generation for order contracts |
| `pdf/pdf_template_service.ts` | Template-based PDF generation (loads 12-page template, overlays data) |
| `pdf/pdf_template_fill.ts` | Page fill logic: placeholder overlays, multi-page table overflow, logo embedding |
| `pdf/pdf_data.ts` | Categorizes order items & builds render data |
| `pdf/pdf_layout.ts` | RTL text handling, fonts, drawing helpers |
| `pdf/pdf_pages/*.ts` | Individual page renderers (legacy: cover, order details, company, terms, signature) |
| `pdf/templates/` | PDF template file + HOT business logo PNG |

## PDF Item Categories

Products are categorized by the `"Product Category"` field from the Supabase `products` table (exact match, case-sensitive):

| Product Category | Hebrew Label | Description |
|-----------------|--------------|-------------|
| `OTC` | ציוד בתשלומים | Equipment Installments |
| `Service` | שירותים חודשיים | Monthly Services |
| `ip phone` | IP Phone | IP Phone |
| `one time` | תשלום אחד | One Time Payment |

## PDF Page Structure

The PDF contract uses a 12-page template with dynamic data overlays:

| Page | Content | Notes |
|------|---------|-------|
| 1 | Cover page | Date, company name |
| 2 | Order details | Payment terms, item tables, **order notes (הערות להזמנה)** below tables |
| 4 | Company details (פרטי לקוח) | Business info, signatory, contact person |
| 12 | Signature page | **Order notes (הערות להזמנה)** above "אני מסכים..." declaration |

**Important:** Only **order notes** appear in the PDF contract. **Company notes (הערות לקוח)** are NOT included in the PDF - they are for internal reference only.

## Data Flow

1. Listen to Supabase tables: `companies`, `company_branches`, `orders`
2. On INSERT/UPDATE, transform data using field mappings
3. Send to Fireberry API
4. Store Fireberry IDs back in Supabase

## Endpoints

- `POST /new` - Create installation records
- `POST /send_pdf` - Generate PDF contract for a single order, email it to signatory (`signatory_email`), and return base64 + metadata
- `POST /send_company_pdf` - Generate combined PDF for multiple branch orders (`{ order_ids: [...] }`), single email to signatory
- `POST /sign_pdf` - Generate PDF contract, send to DocuSeal for e-signing
- `POST /sign_company_pdf` - Generate combined PDF for multiple branch orders, send to DocuSeal for e-signing
- `POST /webhook/docuseal` - DocuSeal signing completion callback (verified via `DOCUSEAL_WEBHOOK_SECRET_KEY` header)
- `GET /calls/:id/transcript` - Transcript for a call (`{ status, language, text, segments[], summary? }`), served from the local DuckDB projection; on a miss it backfills the latest `ai.transcribe.done` from the engine (`api/engine.ts`) and folds it in. (Transcription itself runs in the mothership; there is no local transcribe trigger.)
- `GET /test` - Quick status. Reports `cable_ready`, `tapped`, `ws_clients`, and event-freshness: `last_event_at`, `seconds_since_last_event`, `events_status`.
- `GET /health` - Dependency report (`cable`, `events`, `duckdb`, `engine`, `supabase`). **`events` is the freshness signal** (see below) — distinct from `cable` (subscribed).

### Event-freshness health (`EVENTS_STALE_SECONDS`)
`cable.status: up` only means the WebSocket is subscribed — it stays green even if **no events have flowed for days** (this masked a 9-day CDR outage). The `events` check fixes that, derived from the last cable event deno saw (`api/health_freshness.ts`, pure + unit-tested):
- `idle` — no events since boot · `up` — recent · `stale` — silent longer than `EVENTS_STALE_SECONDS` (default 900s; `0` disables) · `disabled` — cable off.
- Each carries `last_event_at` + `age_seconds`.
- **Informational, never 503**: `stale`/`idle` set `status: degraded` (so monitoring/Gatus can alert) but keep `healthy: true` — a legitimately quiet stream must not restart the container. Only a real dependency `down` fails the check. Stamped on **cable traffic only** (not the on-demand engine backfill), so a dead feed can't be masked.

## DuckDB built-in browser UI (`DUCKDB_UI`)

`store.ts` exposes `startUiServer(port)` / `uiUrl()`. When `DUCKDB_UI=1`,
`supabase.ts` calls `store.startUiServer(DUCKDB_UI_PORT)` right after opening the
store, which runs `INSTALL ui; LOAD ui; SET ui_local_port=<port>; CALL start_ui_server()`
**on the same connection the AMQP consumer writes through**. So the browser UI
(default http://localhost:4213/) is a live SQL notebook over the in-flight event
store — `events` plus the `calls_view` / `*_per_hour` / `registrations_view`
projections — with no second process and no file-lock conflict (DuckDB is
single-writer; a separate CLI would conflict).

`start_ui_server()` (not `start_ui()`) is used so nothing tries to auto-open a
browser in the headless container. Config: `DUCKDB_UI` (default off),
`DUCKDB_UI_PORT` (default 4213) in `config.ts`. Reachable on the host because
`deno-api` is `network_mode: host` — no port publish needed. Operator entry point
is `make duckdb-ui` (see `apps/app/CLAUDE.md`).

**TLS/CA requirement**: DuckDB proxies the UI frontend from `ui_remote_url`
(`https://ui.duckdb.org`) using its native HTTP client, which needs a system CA
bundle. The stock `denoland/deno` image has none (Deno bundles its own, not as a
file), so compose mounts the host CA bundle and sets `SSL_CERT_FILE`. Symptom of
a missing bundle: the UI returns 500 with `SSL server verification failed`.

## Call Transcription (mothership-owned)

Transcription runs in the **mothership** (`voipappz-api`), not here. A Roast/PocketFlow
workflow transcribes a completed call's recording (Azure STT → RubyLLM post-process)
and publishes the result both as an `ai.transcribe.done` event in the engine event
store (source of truth) **and** onto the cable's CallEvents stream. deno just
**projects** it: the cable client folds `transcribe.done` (mapped to
`transcription.completed` by `normalizeCableEvent`) into the local DuckDB store via the
same `emitEvent` path as `call.*`, so `store.transcript(id)` serves the drawer and the
UI updates live. There is **no local Gemini/S3 worker** — `transcription.ts` and `s3.ts`
were removed when transcription moved to the engine.

```
mothership workflow (Roast cogs)
  → ai.transcribe.done  (engine event store — source of truth)
  → cable: transcribe.done  → deno normalizeCableEvent → transcription.completed
       → store.insertEvent (DuckDB projection) + /ws fanout (live UI)
```

**Backfill-on-miss** (`engine.ts`): the local store is a rebuildable projection, so if
it's missing a transcript (a cable event was missed, or the store was rebuilt),
`GET /calls/:id/transcript` falls back to the engine — `backfillTranscript()` fetches
the latest `ai.transcribe.done` from `${ENGINE_URL}/api/events` (server-side basic auth)
and folds it into the store before returning. Verified: on a fresh empty store with the
cable off, the endpoint still returns the transcript purely from backfill.

**Config** (server-side only — creds NEVER go in the browser bundle):

| Env | Default | Purpose |
|---|---|---|
| `ENGINE_URL` | `https://cloud.voipappz.io` | Mothership base for transcript backfill (`/api/events`). |
| `ACCOUNT_EMAIL` / `ACCOUNT_PASSWORD` | — | Engine basic-auth creds. Backfill is off until both are set. |

The transcription provider/tariff/workflow live in the mothership (see
`voipappz-api`: `lib/pocketflow/nodes/roast_cog_node.rb`, `Provider#stt_transcribe`).

## Email & PDF ID System

**`POST /send_pdf`** does everything in one call:
1. Generates PDF with unique `pdf_id` embedded as invisible metadata (`pdfDoc.setKeywords([pdfId])`)
2. Stores `pdf_id` in orders table
3. Emails PDF to `company.signatory_email` via SMTP (Pepipost)
4. Marks `signature_email_sent = true` and `signature_email_sent_at` on the order
5. Returns: `{ success, message_id, recipient, pdf_id, pdf_base64, filename }`

**Key files for email flow:**
- `email_service.ts` — `sendOrderPdfEmail()`, `SmtpTransport` interface (DI for testability), Hebrew RTL email templates
- `server.ts` — Endpoint handler, SMTP transport created in `startServer()` and injected via `createRequestHandler(supabase, smtpTransport?)`
- `pdf/pdf_service.ts` — `generateOrderPdf()` generates UUID, embeds in PDF metadata, stores in DB

**SMTP config** (env vars in `docker-compose.yml` under `deno-app`):
- `SMTP_USER`, `SMTP_PASS` — Pepipost credentials
- `SMTP_HOST` (default: `smtp.pepipost.com`), `SMTP_PORT` (default: `587`)
- `SMTP_FROM` (default: `alert@nimbusip.com`)

**Order fields added:** `signature_email_sent` (boolean), `signature_email_sent_at` (timestamptz), `file_id` (text)

**Testing:** `MockSmtpTransport` in `tests/test_helpers.ts` captures sent emails. Email tests in `tests/email_service.test.ts`.

## DocuSeal E-Signing

Digital signing via [DocuSeal](https://docuseal.eu) (EU region). Runs alongside the email flow — email sends a static PDF attachment, signing sends the PDF to DocuSeal for interactive e-signing.

### Flow

```
POST /sign_pdf { order_id }
  → Reject if order status is 'customer_signed'
  → generateOrderPdf()          (same PDF as email flow)
  → Upload PDF to 'unsigned-documents' storage bucket
  → DocuSeal POST /submissions/pdf  (upload PDF + signature field config)
  → Update order: status='awaiting_customer_signature', docuseal_submission_id=<id>,
    signature_email_sent=true, signature_email_sent_at=<now>,
    unsigned_storage_path=<path>
  → Return: { submission_id, submitter_slug, embed_src, pdf_base64 }

DocuSeal sends signing email to company.signatory_email
  → Signer completes signing on DocuSeal

DocuSeal → POST /webhook/docuseal { event_type: 'form.completed', data: { submission_id, documents } }
  → Find orders by docuseal_submission_id
  → Download signed PDF → upload to 'signed-documents' storage bucket
  → Update orders: status='customer_signed', signed_document_url=<url>,
    signed_storage_path=<path>
```

**Status guard:** `signOrderPdf()` and `signCompanyPdf()` reject requests if any order has `status = 'customer_signed'`. Once signed, no new PDFs can be generated for that order.

### Key Implementation Details

- **`DocuSealClient` interface** — mirrors `SmtpTransport` pattern. Production uses `createDocuSealClient()` (HTTP fetch with `X-Auth-Token`), tests inject `MockDocuSealClient`.
- **`POST /submissions/pdf`** — uploads a completed PDF per submission (not reusable templates, since each PDF has unique order data).
- **Signature field positioning** — fractional coordinates (0-1) on A4 page. Signature page is always the last page, detected via `PDFDocument.load()` page count. Constants in `SIGNATURE_FIELD` (`docuseal_service.ts`).
- **Webhook auth** — DocuSeal sends a custom secret header. If `DOCUSEAL_WEBHOOK_SECRET_KEY` and `DOCUSEAL_WEBHOOK_SECRET` are set, the webhook endpoint verifies the header. If not set, accepts all requests (dev mode).
- **Idempotency** — webhook handler sets the same status values; processing the same event twice is harmless.

### Order Status Flow (signing)

```
(initial) → awaiting_customer_signature → customer_signed
```

### Order Fields (DocuSeal)

- `docuseal_submission_id` (integer) — DocuSeal's submission ID, used to match webhook callbacks
- `docuseal_status` (text) — `"pending"` | `"completed"`
- `signed_document_url` (text) — URL to signed document from DocuSeal
- `unsigned_storage_path` (text) — Path in `unsigned-documents` Supabase Storage bucket (set on PDF generation)
- `signed_storage_path` (text) — Path in `signed-documents` Supabase Storage bucket (set on webhook completion)

### PDF Storage (Supabase Storage)

Two separate buckets for different lifecycle stages:

| Bucket | Purpose | When populated |
|--------|---------|----------------|
| `unsigned-documents` | Generated (unsigned) contract PDFs | On `/sign_pdf` or `/sign_company_pdf` call |
| `signed-documents` | Signed PDFs returned from DocuSeal | On `form.completed` webhook callback |

**Storage path format:** `{year}/{month}/{companyId}/{fileId}.pdf`

**Key functions:**
- `uploadGeneratedPdf()` in `docuseal_service.ts` — uploads generated PDF to `unsigned-documents` bucket
- `downloadAndStorePdf()` in `docuseal_service.ts` — downloads signed PDF from DocuSeal and uploads to `signed-documents` bucket

**Storage policies** (RLS): Both buckets have INSERT + SELECT policies for the `public` role. `signed-documents` also has UPDATE (for `upsert: true`).

**Signing flow also updates email fields:** Both `signOrderPdf()` and `signCompanyPdf()` set `signature_email_sent = true` and `signature_email_sent_at` (since DocuSeal sends a signing email to the signer).

### ngrok (Local Webhook Tunneling)

For local development, ngrok tunnels the Deno server to a public URL so DocuSeal can send webhooks.

- **Config:** `ngrok.yml` — tunnels `deno-app:3000` to public URL
- **Docker service:** `ngrok` in `docker-compose.yml`
- **Dashboard:** [http://localhost:4040](http://localhost:4040) — shows the public URL
- **Start:** `docker-compose up ngrok`
- **Webhook config:** Copy ngrok URL → [https://console.docuseal.eu/webhooks](https://console.docuseal.eu/webhooks) → set to `https://<ngrok-url>/webhook/docuseal`
- **Note:** URL changes on every restart (free plan), must update in DocuSeal console each time

### Environment Variables for DocuSeal

| Variable | Required | Purpose |
|----------|----------|---------|
| `DOCUSEAL_API_KEY` | Yes | API key from DocuSeal Console → API |
| `DOCUSEAL_BASE_URL` | No | API base URL (defaults to `https://api.docuseal.eu/api`) |
| `DOCUSEAL_WEBHOOK_SECRET_KEY` | No | Header name for webhook verification (e.g. `X-Webhook-Secret`) |
| `DOCUSEAL_WEBHOOK_SECRET` | No | Expected header value for webhook verification |

### Supabase Migrations

Run via Dashboard SQL editor:

```sql
-- DocuSeal columns
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS docuseal_submission_id INTEGER,
  ADD COLUMN IF NOT EXISTS docuseal_status TEXT,
  ADD COLUMN IF NOT EXISTS signed_document_url TEXT,
  ADD COLUMN IF NOT EXISTS signed_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS unsigned_storage_path TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_docuseal_submission_id
  ON orders (docuseal_submission_id) WHERE docuseal_submission_id IS NOT NULL;

-- Fix signature_email_sent_at to use timestamptz (matches created_at)
ALTER TABLE orders
  ALTER COLUMN signature_email_sent_at TYPE timestamp with time zone
  USING signature_email_sent_at AT TIME ZONE 'UTC';

-- Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### Supabase Storage Setup

Create buckets and policies:

```sql
-- Create unsigned-documents bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('unsigned-documents', 'unsigned-documents', false);

-- Create signed-documents bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('signed-documents', 'signed-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Policies for unsigned-documents
CREATE POLICY "Allow uploads to unsigned-documents"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'unsigned-documents');

CREATE POLICY "Allow read unsigned-documents"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'unsigned-documents');

-- Policies for signed-documents
CREATE POLICY "Allow uploads to signed-documents"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'signed-documents');

CREATE POLICY "Allow update signed-documents"
ON storage.objects FOR UPDATE TO public
USING (bucket_id = 'signed-documents');

CREATE POLICY "Allow read signed-documents"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'signed-documents');
```

### Testing

`MockDocuSealClient` in `tests/test_helpers.ts` captures submissions. DocuSeal tests in `tests/docuseal_service.test.ts`.

```bash
deno test --allow-net --allow-env --allow-read tests/docuseal_service.test.ts
```

---

# Project Rules for Claude Code

## File Permissions

When creating new files or directories, ensure proper permissions so the user can access them:

```bash
chmod 644 <new-files>
chmod 755 <new-directories>
chown -R 1001:1001 <new-files-or-directories>
```

This prevents files from being created with root-only permissions (600) which blocks user access.

## Keep Documentation Updated

At the **end of a task** (not during), when new features, endpoints, or significant changes were added:
- Update this CLAUDE.md file to reflect the changes
- Update README.md with user-facing documentation
- Add new endpoints to the Endpoints section
- Add new key files to the Key Files table
- Update the architecture diagram if data flow changes

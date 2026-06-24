# Supabase-Fireberry Sync

Syncs data between Supabase and Fireberry CRM. Listens to Supabase realtime events and pushes data to Fireberry API.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| [Deno](https://deno.land/) | latest | Runtime |
| [@supabase/supabase-js](https://jsr.io/@supabase/supabase-js) | ^2 | Supabase client |
| [@std/assert](https://jsr.io/@std/assert) | ^0.218.2 | Testing assertions |
| [pdf-lib](https://pdf-lib.js.org/) | ^1.17.1 | PDF generation |
| [nodemailer](https://nodemailer.com/) | ^6.9.0 | Email sending (SMTP) |
| [DocuSeal](https://docuseal.eu) | API | E-signing (EU region) |

## Environment Variables

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
FIREBERRY_TOKEN=your-fireberry-token
PORT=3000          # optional, defaults to 3000

# SMTP (for sending PDF contracts via email)
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_HOST=smtp.pepipost.com  # optional, defaults to smtp.pepipost.com
SMTP_PORT=587                # optional, defaults to 587
SMTP_FROM=alert@nimbusip.com # optional, defaults to alert@nimbusip.com

# DocuSeal (for e-signing PDF contracts)
DOCUSEAL_API_KEY=your-docuseal-api-key          # required for /sign_pdf endpoints
DOCUSEAL_BASE_URL=https://api.docuseal.eu/api   # optional, defaults to EU region
DOCUSEAL_WEBHOOK_SECRET_KEY=X-Webhook-Secret    # optional, header name for webhook verification
DOCUSEAL_WEBHOOK_SECRET=your-secret-value       # optional, expected header value
```

## Running the Project

### With Docker Compose

```bash
# Start the Deno app
docker-compose up deno-app

# Run claude in the container 
deno run -A npm:@anthropic-ai/claude-code

# Run tests
docker-compose up deno-tests
```

### Without Docker

```bash
# Run the main app
deno run --allow-env --allow-net --allow-read supabase.ts

# Run with watch mode
deno run --allow-env --allow-net --allow-read --watch supabase.ts
```

## Project Structure

```
/app
├── supabase.ts          # Entry point
├── fireberry_sync.ts    # Fireberry API sync
├── server.ts            # HTTP server
├── db.ts                # Database functions
├── fireberry_mapping.ts # Field mappings
├── config.ts            # Configuration
├── email_service.ts     # Email sending (SMTP)
├── docuseal_service.ts  # DocuSeal e-signing (client, sign functions, webhook)
├── pdf/                 # PDF generation
│   ├── pdf_service.ts   # Main PDF orchestrator
│   ├── pdf_data.ts      # Item categorization & render data
│   ├── pdf_layout.ts    # RTL text, fonts, drawing helpers
│   ├── pdf_types.ts     # Type definitions
│   ├── pdf_pages/       # Page renderers (cover, order, company, terms, signature)
│   ├── fonts/           # Frank Ruhl Libre font files
│   ├── templates/       # PDF template + HOT business logo PNG
│   ├── pdf_template_service.ts  # Template PDF orchestrator
│   └── pdf_template_fill.ts     # Page fill logic (overlays, overflow, logo)
├── tests/               # Test files
└── coverage/            # Generated coverage reports
```

### Core Files

| File | Description |
|------|-------------|
| `supabase.ts` | **Entry point**. Initializes Supabase client and sets up realtime subscriptions for `companies`, `company_branches`, and `orders` tables. Listens for INSERT/UPDATE events and triggers sync to Fireberry. |
| `fireberry_sync.ts` | **Sync logic**. Contains `sendToFireberry()` for API calls, `transformDataSupabaseToFireberry()` for field mapping, and `handleOrderUpdate()` for the main order sync flow. |
| `server.ts` | **HTTP server**. Exposes `/new`, `/send_pdf`, `/send_company_pdf`, `/sign_pdf`, `/sign_company_pdf`, `/webhook/docuseal`, and `/test`. Uses `createRequestHandler(supabase, smtpTransport?, docusealClient?)` for testability. |
| `email_service.ts` | **Email service**. `sendOrderPdfEmail()` generates a PDF, emails it to the signatory, and updates the order. Uses dependency-injected `SmtpTransport` interface for testability. Hebrew RTL email templates. |
| `docuseal_service.ts` | **DocuSeal e-signing service**. `signOrderPdf()` and `signCompanyPdf()` generate PDFs and send them to DocuSeal for digital signing. `handleDocuSealWebhook()` processes signing completion callbacks. Uses dependency-injected `DocuSealClient` interface. |
| `db.ts` | **Database layer**. Helper functions for Supabase queries: `getCompany()`, `getCompanyBranch()`, `getOrderItems()`, `updateTable()`, `createInstallation()`. |
| `fireberry_mapping.ts` | **Field mappings**. Defines `DATABASE_MAPPINGS` array that maps Supabase column names to Fireberry field names for each table. |
| `config.ts` | **Configuration**. Loads environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `FIREBERRY_TOKEN`, `PORT`, `SMTP_*`, `DOCUSEAL_*`). |
| `pdf/pdf_service.ts` | **PDF generation**. Generates order contract PDFs using pdf-lib. Contains `generateOrderPdf()` which fetches order data, embeds a unique `pdf_id` in PDF metadata, stores it in the orders table, and returns base64-encoded PDF. |
| `pdf/pdf_template_service.ts` | **Template PDF orchestrator**. Loads the 12-page PDF template and coordinates page fill functions. |
| `pdf/pdf_template_fill.ts` | **Template page fills**. Overlays dynamic data on template pages: placeholder text replacement (pages 1, 4, 12), multi-page table overflow with logo embedding (page 2). |
| `pdf/pdf_data.ts` | **PDF data layer**. Categorizes order items by `"Product Category"` field and builds render data for the PDF pages. |
| `pdf/pdf_layout.ts` | **PDF layout**. RTL Hebrew text handling, font loading (Frank Ruhl Libre), drawing helpers, and table utilities. |
| `pdf/pdf_pages/*.ts` | **PDF page renderers** (legacy). Individual page renderers: cover, order details, company details, terms & conditions, signature. |

### Folders

| Folder | Description |
|--------|-------------|
| `tests/` | Contains all test files and test utilities. Run with `deno test`. |
| `coverage/` | **Generated folder** (not in git). Created when running tests with `--coverage` flag. Contains JSON coverage data and HTML reports. Safe to delete anytime. |

## Testing Guide

### Run All Tests

```bash
deno test --allow-net --allow-env --allow-read tests/
```

### Run Specific Test File

```bash
deno test --allow-net --allow-env --allow-read tests/fireberry_sync.test.ts
deno test --allow-net --allow-env --allow-read tests/server.test.ts
deno test --allow-net --allow-env --allow-read tests/db.test.ts
deno test --allow-net --allow-env --allow-read tests/pdf_service.test.ts
deno test --allow-net --allow-env --allow-read tests/email_service.test.ts
deno test --allow-net --allow-env --allow-read tests/docuseal_service.test.ts
```

### Run with Coverage Report

```bash
deno test --allow-net --allow-env --allow-read --coverage=coverage tests/
deno coverage coverage/
```

This generates an HTML report at `coverage/html/index.html`.

### Test Structure

```
tests/
├── test_helpers.ts           # Mock factories & utilities
├── fireberry_sync.test.ts    # Sync function tests (25 tests)
├── server.test.ts            # HTTP endpoint tests (14 tests)
├── db.test.ts                # Database function tests (15 tests)
├── pdf_service.test.ts       # PDF generation tests (11 tests)
├── email_service.test.ts     # Email sending tests (6 tests)
├── docuseal_service.test.ts  # DocuSeal e-signing tests (8 tests)
└── webhook.test.ts           # Legacy webhook tests (9 tests)
```

### Test Coverage

| Module | Coverage |
|--------|----------|
| `fireberry_sync.ts` | 100% |
| `server.ts` | 100% |
| `db.ts` | ~78% |
| `config.ts` | 100% |
| `pdf/pdf_service.ts` | ~90% |

### Mocking

Tests use mocks for external dependencies:

- **MockSupabaseClient** - Simulates Supabase query builder
- **MockSmtpTransport** - Captures sent emails, configurable failure simulation
- **MockDocuSealClient** - Captures DocuSeal submissions, configurable failure simulation
- **createFetchMock** - Mocks Fireberry API responses
- **Mock data factories** - `createMockCompany()`, `createMockOrder()`, etc.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/new` | Create new installation |
| POST | `/send_pdf` | Generate PDF contract for single order, email to signatory, return base64 |
| POST | `/send_company_pdf` | Generate combined PDF for multiple branch orders, single email to signatory |
| POST | `/sign_pdf` | Generate PDF contract for single order, send to DocuSeal for e-signing |
| POST | `/sign_company_pdf` | Generate combined PDF for multiple branch orders, send to DocuSeal for e-signing |
| POST | `/webhook/docuseal` | DocuSeal webhook callback (signing completion) |
| GET | `/test` | Health check |

### PDF Item Categories

Order items in the generated PDF are grouped by the `"Product Category"` field from the Supabase `products` table:

| Product Category | PDF Label | Description |
|-----------------|-----------|-------------|
| `OTC` | ציוד בתשלומים | Equipment Installments |
| `Service` | שירותים חודשיים | Monthly Services |
| `ip phone` | IP Phone | IP Phone |
| `one time` | תשלום אחד | One Time Payment |

Only non-empty categories are shown in the PDF. Unknown categories default to "one time".

### POST /send_pdf

Generate a PDF contract, email it to the signatory, and return the PDF data.

**What it does:**
1. Generates PDF with a unique `pdf_id` embedded as invisible metadata
2. Stores `pdf_id` in the orders table
3. Emails the PDF to `company.signatory_email` via SMTP
4. Marks the order as `signature_email_sent = true`
5. Returns the PDF base64 + email metadata

**Request:**
```json
{
  "order_id": "uuid-of-order"
}
```

**Response (200):**
```json
{
  "success": true,
  "message_id": "smtp-message-id",
  "recipient": "signatory@example.com",
  "pdf_id": "generated-uuid",
  "pdf_base64": "JVBERi0xLjcK...",
  "filename": "order_ORD-2024-001.pdf"
}
```

**Error responses:**
- `400` — missing `order_id`, order/company not found, no signatory email, or PDF generation failed
- `503` — SMTP not configured (missing `SMTP_USER`/`SMTP_PASS` env vars)
- `500` — unexpected server error

**Test with curl:**
```bash
curl -s -X POST http://localhost:3000/send_pdf \
  -H "Content-Type: application/json" \
  -d '{"order_id":"453d4cf8-fbf4-45d4-bd9b-e99d94ece952"}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('order_test.pdf','wb').write(base64.b64decode(d['pdf_base64'])) if 'pdf_base64' in d else print(d)"
```

### POST /send_company_pdf

Generate a combined PDF contract for multiple branch orders, email it to the signatory.

**Request:**
```json
{
  "order_ids": ["uuid-of-order-1", "uuid-of-order-2"]
}
```

**Test with curl:**
```bash
curl -s -X POST http://localhost:3000/send_company_pdf \
  -H "Content-Type: application/json" \
  -d '{"order_ids":["5be33963-f26d-4e33-ba4f-7c375be165d5","21806cd7-325c-425e-a3bf-11890a46657b"]}' \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('order_test.pdf','wb').write(base64.b64decode(d['pdf_base64'])) if 'pdf_base64' in d else print(d)"
```

**Client Usage:**
```javascript
const response = await fetch('/send_pdf', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ order_id: 'your-order-uuid' })
});
const { success, pdf_base64, recipient, pdf_id } = await response.json();

// Convert to blob and open
const blob = new Blob(
  [Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0))],
  { type: 'application/pdf' }
);
window.open(URL.createObjectURL(blob));
```

### POST /sign_pdf

Generate a PDF contract for a single order and send it to DocuSeal for digital signing. DocuSeal emails the signatory a link to sign the document. The generated PDF is also uploaded to Supabase Storage (`unsigned-documents` bucket).

**Rejects** if the order status is `customer_signed` (already signed orders cannot be re-generated).

**What it does:**
1. Checks order is not already signed
2. Generates PDF with unique `file_id`
3. Uploads PDF to `unsigned-documents` storage bucket
4. Sends PDF to DocuSeal for e-signing
5. Updates order: `status`, `docuseal_submission_id`, `signature_email_sent`, `signature_email_sent_at`, `unsigned_storage_path`
6. Returns submission details + PDF base64

**Request:**
```json
{
  "order_id": "uuid-of-order"
}
```

**Response (200):**
```json
{
  "success": true,
  "submission_id": 1234,
  "submitter_slug": "mock-slug-1234-0",
  "embed_src": "https://docuseal.eu/s/mock-slug-1234-0",
  "file_id": "generated-uuid",
  "pdf_base64": "JVBERi0xLjcK...",
  "filename": "order_ORD-2024-001.pdf"
}
```

**Error responses:**
- `400` — missing `order_id`, order/company not found, no signatory email, PDF generation failed, or **order already signed**
- `503` — DocuSeal not configured (missing `DOCUSEAL_API_KEY` env var)
- `500` — unexpected server error

**Test with curl:**
```bash
curl -s -X POST http://localhost:3000/sign_pdf \
  -H "Content-Type: application/json" \
  -d '{"order_id":"your-order-uuid"}'
```

### POST /sign_company_pdf

Generate a combined PDF for multiple branch orders and send it to DocuSeal for digital signing. All orders must belong to the same company. The generated PDF is also uploaded to Supabase Storage (`unsigned-documents` bucket).

**Rejects** if any order has status `customer_signed` (already signed orders cannot be re-generated).

**What it does:**
1. Checks no orders are already signed
2. Generates combined PDF for all orders with shared `file_id`
3. Uploads PDF to `unsigned-documents` storage bucket
4. Sends PDF to DocuSeal for e-signing
5. Updates all orders: `status`, `docuseal_submission_id`, `signature_email_sent`, `signature_email_sent_at`, `unsigned_storage_path`
6. Returns submission details + PDF base64

**Request:**
```json
{
  "order_ids": ["uuid-of-order-1", "uuid-of-order-2"]
}
```

**Response (200):**
```json
{
  "success": true,
  "submission_id": 1234,
  "submitter_slug": "mock-slug-1234-0",
  "embed_src": "https://docuseal.eu/s/mock-slug-1234-0",
  "file_id": "generated-uuid",
  "pdf_base64": "JVBERi0xLjcK...",
  "filename": "contract_CompanyName.pdf",
  "order_ids": ["uuid-of-order-1", "uuid-of-order-2"]
}
```

**Test with curl:**
```bash
curl -s -X POST http://localhost:3000/sign_company_pdf \
  -H "Content-Type: application/json" \
  -d '{"order_ids":["order-uuid-1","order-uuid-2"]}'
```

### POST /webhook/docuseal

Webhook endpoint called by DocuSeal when a signer completes signing. Downloads the signed PDF, uploads it to `signed-documents` storage bucket, and updates order status to `customer_signed` with both the DocuSeal URL and storage path.

**Authentication:** Verified via custom secret header (configured in DocuSeal dashboard). If `DOCUSEAL_WEBHOOK_SECRET_KEY` and `DOCUSEAL_WEBHOOK_SECRET` env vars are not set, accepts all requests (dev mode).

**Payload (sent by DocuSeal):**
```json
{
  "event_type": "form.completed",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "id": 100,
    "submission_id": 1234,
    "email": "signer@example.com",
    "status": "completed",
    "documents": [{"name": "contract.pdf", "url": "https://docuseal.eu/dl/signed-123"}],
    "values": [{"field": "signature", "value": "signed"}]
  }
}
```

**Order status flow:**
```
(initial) → awaiting_customer_signature → customer_signed
```

### PDF Storage (Supabase Storage)

Generated and signed PDFs are stored in separate Supabase Storage buckets:

| Bucket | Contents | Populated by |
|--------|----------|--------------|
| `unsigned-documents` | Generated contract PDFs (before signing) | `/sign_pdf`, `/sign_company_pdf` |
| `signed-documents` | Signed PDFs (after customer signs) | `/webhook/docuseal` (form.completed) |

**Storage path format:** `{year}/{month}/{companyId}/{fileId}.pdf`

Both unsigned and signed versions are kept for audit trail purposes.

**Setup:** See CLAUDE.md for bucket creation SQL and storage policies.

### DocuSeal Setup

1. Create account at [docuseal.eu](https://docuseal.eu)
2. Get API key: Console → API → copy key
3. Set `DOCUSEAL_API_KEY` env var in `docker-compose.yml`
4. Configure webhook URL (see ngrok section below)
5. Run Supabase migration (see CLAUDE.md for SQL)
6. Restart container: `docker-compose down && docker-compose up -d deno-app`

### ngrok (Local Development Tunneling)

DocuSeal webhooks require a publicly accessible URL to reach your local server. [ngrok](https://ngrok.com) provides this tunnel.

**How it works:**
```
DocuSeal (internet) → ngrok public URL → ngrok container → deno-app:3000
```

**Configuration:** `ngrok.yml` defines a tunnel from the public internet to `deno-app:3000`. The ngrok service runs as a Docker container alongside the app.

**Starting ngrok:**
```bash
docker-compose up ngrok
```

**Getting your public URL:**
Open the ngrok dashboard at [http://localhost:4040](http://localhost:4040) — it shows the generated public URL (e.g., `https://xxxx-xx-xx.ngrok-free.app`).

**Setting up the DocuSeal webhook:**
1. Start ngrok: `docker-compose up ngrok`
2. Copy the public URL from [http://localhost:4040](http://localhost:4040)
3. Go to [https://console.docuseal.eu/webhooks](https://console.docuseal.eu/webhooks)
4. Set the webhook URL to: `https://<your-ngrok-url>/webhook/docuseal`
5. Save

**Note:** The ngrok URL changes every time the container restarts (free plan). You'll need to update the webhook URL in DocuSeal console each time. For production, use a fixed domain instead of ngrok.

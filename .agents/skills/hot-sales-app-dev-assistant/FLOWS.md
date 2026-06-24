# HOT Sales App Flows And Integrations

## Stack

- Frontend: React 19, Vite, React Router, MUI, Radix UI, Tailwind utilities, `react-i18next`.
- Backend integration service: Deno TypeScript under `api/`.
- Database/auth/storage: Supabase.
- CRM sync: Fireberry API.
- Documents: `pdf-lib`, template PDF assets, Frank Ruhl Libre fonts, Hebrew RTL support.
- Email: SMTP via Pepipost defaults.
- E-signing: DocuSeal EU API.
- Tests: Playwright/Vitest for frontend, Deno test for API.

## Environment Names

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` if code/config expects it
- `SUPABASE_SERVICE_ROLE_KEY` only for test cleanup and server-side/admin use

Deno API:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FIREBERRY_TOKEN`
- `PORT`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `DOCUSEAL_API_KEY`
- `DOCUSEAL_BASE_URL`
- `DOCUSEAL_WEBHOOK_SECRET_KEY`
- `DOCUSEAL_WEBHOOK_SECRET`

Never reveal values. When checking env, report only present/missing.

## Frontend Data Flow

1. UI components collect customer, order, installation, and scheduling data.
2. Entity helpers in `src/entities/all.js` normalize app-facing models.
3. DB helpers in `src/lib/db.ts` call Supabase.
4. Auth state comes from `src/context/AuthContext.jsx`.
5. API/401 behavior should stay coordinated with `src/lib/httpClient.ts`.
6. Hebrew is default; `DirectionContext` switches RTL/LTR with i18n.

Important areas:

- Customers: `src/components/Customers/`
- Orders: `src/components/Orders/`
- Installations: `src/components/Installations/`
- Scheduling: `src/components/Scheduling/`, `src/services/schedulingService.ts`
- Dashboards/reports: `src/components/Dashboard/`, `src/components/Reports/`

## Deno API Endpoints

Main handler: `api/server.ts`.

- `GET /test`: health check.
- `POST /new`: creates installation records.
- `POST /send_pdf`: generate one order PDF, email to signatory, return metadata/base64.
- `POST /send_company_pdf`: generate combined branch/company PDF, email to signatory.
- `POST /sign_pdf`: generate one order PDF, upload unsigned copy, submit to DocuSeal.
- `POST /sign_company_pdf`: generate combined PDF for multiple orders, submit to DocuSeal.
- `POST /webhook/docuseal`: DocuSeal signing completion callback.

Auth:

- All POST endpoints except `/webhook/docuseal` require Supabase JWT bearer auth.
- Webhook auth uses `DOCUSEAL_WEBHOOK_SECRET_KEY` and `DOCUSEAL_WEBHOOK_SECRET` when configured.
- Unauthorized and error responses should be JSON.

## Supabase And RLS

Use migrations in `migrations/` as the schema/security history:

- `001_add_auth_user_id.sql`
- `002_rls_helper_functions.sql`
- `003_rls_policies.sql`
- `004_enable_rls.sql`
- `006_add_scheduling_tables.sql`
- `007_phase1_critical_rls_security.sql`
- `008_phase2_enhanced_helper_functions.sql`
- `008_populate_supabase_user_metadata.sql`
- `009_phase3_core_entity_rls_policies.sql`
- `010_phase4_scheduling_system_rls.sql`
- `011_phase5_supporting_tables_rls.sql`

When changing auth/RLS, inspect `AUTH.md`, `TESTING-SME-AUTH-RLS.md`, `tests/security.spec.ts`, `tests/rbac.spec.ts`, and unit RLS tests.

## Fireberry Sync

Key files:

- `api/supabase.ts`: starts Supabase subscriptions.
- `api/fireberry_sync.ts`: transforms and sends records.
- `api/fireberry_mapping.ts`: maps Supabase columns to Fireberry fields.

Flow:

1. Subscribe to `companies`, `company_branches`, `orders`.
2. On insert/update, map DB data to Fireberry fields.
3. Send to Fireberry using `FIREBERRY_TOKEN`.
4. Persist returned Fireberry IDs back to Supabase where applicable.

Protect against failed external calls with defensive errors and tests using mocks.

## PDF, Email, And DocuSeal

PDF:

- `api/pdf/pdf_service.ts`: order PDF orchestration.
- `api/pdf/pdf_template_service.ts`: 12-page template orchestration.
- `api/pdf/pdf_template_fill.ts`: overlays dynamic data and handles overflow.
- `api/pdf/pdf_layout.ts`: Hebrew RTL layout, fonts, drawing helpers.
- `api/pdf/templates/`: template and HOT logo assets.

Email:

- `api/email_service.ts` uses an injected `SmtpTransport`.
- SMTP defaults to Pepipost-style env vars.

DocuSeal:

- `api/docuseal_service.ts` uses an injected `DocuSealClient`.
- Unsigned PDFs go to `unsigned-documents`.
- Signed PDFs from webhook go to `signed-documents`.
- Status flow: initial -> `awaiting_customer_signature` -> `customer_signed`.
- Signed orders must not be regenerated.

## Testing Strategy

Frontend:

- Run focused Playwright specs for touched workflows.
- Use existing auth fixture and cleanup helpers.
- For UI work, verify Hebrew and responsive behavior.

API:

- Use Deno tests under `api/tests/`.
- Mock Supabase, SMTP, DocuSeal, and Fireberry rather than calling external services.
- For server changes, add/adjust `api/tests/server.test.ts`.

Commands:

```powershell
npm run test:run
npx playwright test tests/orders.spec.ts
npx playwright test tests/customers.spec.ts
cd api; deno test --allow-net --allow-env --allow-read tests/
```

## Deployment Notes

Local docs include older nginx/Docker/CircleCI deployment guidance and user-provided Google Cloud Run/Flask context. Before giving deployment instructions, inspect current repo files and ask which target is active if it is ambiguous.

If using Google Cloud Run for an API/service, keep these principles:

- Use Secret Manager/env vars, never committed secrets.
- Prefer a dedicated runtime service account with least-privilege IAM.
- Validate env/secret presence without printing values.
- For JSON APIs, diagnose `Unexpected token '<'` as likely HTML returned from error/login/redirect.

Useful Cloud Run logs command from project context:

```powershell
gcloud run services logs read sms-manager --region europe-west1 --limit 100
```

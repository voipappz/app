---
name: hot-sales-app-dev-assistant
description: Project assistant for the HOT Sales App workspace: React/Vite frontend, Deno API, Supabase, Fireberry, PDF/email, DocuSeal signing, Hebrew RTL UI, tests, and deployment notes. Use when working inside C:\Users\User\Documents\HOT Sales App or when the user asks about this project's flows, integrations, env vars, auth, PDFs, signing, Fireberry sync, Supabase/RLS, tests, or deployment.
---

# HOT Sales App Dev Assistant

## Operating Rules

- Treat this workspace as the source of truth; inspect files before assuming behavior.
- Make minimal, focused edits and preserve Hebrew/RTL behavior.
- Never print or hardcode secrets. Treat `.env`, API keys, service-role keys, and service-account JSON as sensitive.
- Prefer existing patterns: React 19 + Vite frontend, MUI/Radix UI, Supabase client/entity layer, Deno TypeScript API with dependency-injected service clients.
- For backend/API failures, return JSON errors with proper status codes. Avoid HTML/plain text errors that break frontend JSON parsing.
- If deployment context conflicts, call it out: this workspace currently looks like React/Vite + Deno API, not a Flask app.

## First Checks

Run these before changing behavior:

```powershell
git status --short
rg --files
Get-Content package.json
Get-Content api\README.md
Get-Content api\config.ts
```

For env validation without revealing values:

```powershell
powershell -ExecutionPolicy Bypass -File .agents\skills\hot-sales-app-dev-assistant\scripts\check_env.ps1
```

## Project Map

- Frontend entry/routes: `src/App.jsx`, `src/main.jsx`
- Supabase client/data: `src/lib/supabase.ts`, `src/lib/db.ts`, `src/entities/all.js`
- Auth/RLS/ACL: `src/context/AuthContext.jsx`, `src/lib/httpClient.ts`, `src/services/aclService.js`, `migrations/`
- i18n/RTL: `src/i18n/`, `src/context/DirectionContext.jsx`
- Orders/customers/installations UI: `src/components/Orders/`, `src/components/Customers/`, `src/components/Installations/`
- Deno API: `api/server.ts`, `api/supabase.ts`, `api/config.ts`
- Fireberry sync: `api/fireberry_sync.ts`, `api/fireberry_mapping.ts`
- PDF/email/signing: `api/pdf/`, `api/email_service.ts`, `api/docuseal_service.ts`
- Tests: frontend `tests/`, API `api/tests/`

## Core Flows

See [FLOWS.md](FLOWS.md) for endpoint contracts, data flow, and integration notes.

Use these summaries while coding:

- Customer/order data flows from React forms through entity/db helpers into Supabase.
- Supabase realtime changes for `companies`, `company_branches`, and `orders` sync to Fireberry.
- PDF generation pulls Supabase order/company/item data, uses Hebrew RTL layout/template assets, stores IDs/paths, and returns base64.
- `/send_pdf` and `/send_company_pdf` email PDFs through SMTP/Pepipost.
- `/sign_pdf` and `/sign_company_pdf` upload generated PDFs to DocuSeal and Supabase Storage.
- `/webhook/docuseal` validates its custom secret header when configured, downloads signed PDFs, stores them, and updates order status.
- POST API endpoints except DocuSeal webhook require Supabase JWT bearer auth.

## Common Commands

Frontend:

```powershell
npm run dev
npm run build
npm run lint
npm run test:run
npx playwright test
```

Deno API:

```powershell
cd api
deno run --allow-net --allow-env --allow-read --watch supabase.ts
deno test --allow-net --allow-env --allow-read tests/
```

Targeted tests:

```powershell
npx playwright test tests/orders.spec.ts
npx playwright test tests/security.spec.ts tests/unit/rls-policies-sme.spec.ts
cd api; deno test --allow-net --allow-env --allow-read tests/server.test.ts
```

## Change Checklist

- Identify frontend, API, migration, or integration boundary before editing.
- Add or update focused tests when touching auth/RLS, API contracts, PDF/signing, or Fireberry sync.
- Keep all API responses JSON for API routes.
- Preserve Hebrew strings, translation keys, RTL direction, and PDF font/template assumptions.
- Do not log tokens, credentials, signed URLs, service-role keys, or full webhook payloads containing sensitive data.
- After changes, report exact verification run and any deploy steps needed.

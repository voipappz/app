# Communication platform: plan

Date: 15 October 2026. Status: plan only. No code, packages or deployment.
Replaces the plan drafted on PR #207 (`docs/customer-platform-lego-research-plan.md`),
with the corrections from its review.

## The idea

Customers get the source code of a VoipAppz app built on this repo's React + MUI
components and assemble their own app from blocks, like Lego. **The phone and
communication are the heart.** Every app a customer builds (a CRM, a support
desk, a contact centre, their own product) is built around the same
communication core.

We reuse what exists: the components, the MUI theme, English/Hebrew i18n, the
softphone, the live cable and the user portal session. No new UI framework, no
second design system.

## Principles

1. **Communication is the core; apps are examples.** Phone, messages,
   conference, timeline and inbox come first. CRM is the first example app.
2. **The user portal is the base.** A user session (`user_auth`, one
   environment, ACL-filtered) is already the restricted identity customers need.
   Every block is built and tested as a user, not as an account admin.
3. **Customers own the blocks; we own the platform layer.** Blocks are copied
   into the customer's source (the shadcn/ui model). The session, API client,
   SIP and cable stay one shared, updatable layer.
4. **The Event Store stays on the server.** Blocks never read or write it. They
   get a scoped notification, then fetch authorized state from the API.
5. **The browser is not a security boundary.** A customer can change every line;
   the API's checks still hold.

## Already decided in the API repo

| Doc | What it settles |
|---|---|
| [Customer application skeleton](https://github.com/voipappz/api/blob/main/docs/CUSTOMER_APPLICATION_SKELETON_PLAN.md) | The customer-owned starter is the primary deliverable; business logic stays outside the core |
| [React/MUI skeleton](https://github.com/voipappz/api/blob/main/docs/REACT_MUI_SKELETON_IMPLEMENTATION_PLAN.md) | Build as a narrow feature in this repo first; inventory, then restricted access, then adapters |
| [SaaS core boundary](https://github.com/voipappz/api/blob/main/docs/SAAS_CORE_BOUNDARY.md) | Event Store internal; a small versioned public event contract; outbox and recovery rules |
| [Minimal call CRM](https://github.com/voipappz/api/blob/main/docs/MINIMAL_CRM_PORTAL_IMPLEMENTATION_PLAN.md) | The first example app, its blocks and phases P0 to P5 |
| [Application platform research](https://github.com/voipappz/api/blob/main/docs/APPLICATION_PLATFORM_MARKET_RESEARCH_AND_PLAN.md) | Adapt RailsEventStore `ecommerce` domain code; do not merge the Rails app |

## The communication core

| Block | What it does | Starts from |
|---|---|---|
| Phone | Calls in and out, mute, hold, transfer, keypad; a call bar that stays on screen | `components/Phone/`, `lib/sip/`, `context/SoftphoneContext.jsx`, and the redesign in commit `19d566b` |
| Call history | Recent calls with dial-back and open-call | `components/Phone/PhoneCallsTab.jsx` (real calls via `callsApi`, `onDial`/`onOpenCall` callbacks) |
| Messages | SMS and chat threads, send and reply | `components/Messages/`, `components/Conversations/MessageInput.jsx` |
| Timeline | Calls and messages for one person or number in one stream | New. `components/CommsLog/` switches between Calls and Messages but does not merge them |
| Inbox | Missed calls, voicemails, unread messages, reminders in one queue | New |
| Presence | Who is available | `components/Phone/PhonePresence.jsx`, `components/LiveDashboard/` |
| Conference | Audio rooms: start, invite, participants, leave | API room lifecycle merged (api PR #102); node lab on va-crystal `feat/janus-conference-node`; no UI yet |
| Bots | AI voice and chat agents on the same channels | `components/Bots/` |

`components/CallsLog/` is the application logs screen (`/api/logs`), not call
history, and is not a communication block.

### Shared pieces reused as they are

- Theme: `src/theme/tokens.js`, `theme.js`
- Dialogs: `src/components/ui/` (`ResponsiveDialog`, `ConfirmDialog`)
- Tables and filters: `src/components/shared/` (`ResponsiveTable`, `Filters`)
- Small parts: `src/components/common/` (`StatusChip`, `StatCard`, `PageHeader`)
- Language: `src/i18n/` and [i18n-guide.md](i18n-guide.md). Not every screen is
  converted yet; a block is converted when it is extracted.

## The platform layer

What exists today and what it becomes:

| Today | Problem | Becomes |
|---|---|---|
| `services/apiService.js`, one shared instance | Reads tokens from browser storage; accepts arbitrary URLs | A client created with a session, exposing named methods only |
| `AuthContext`, `UserAuthContext` | Blocks reach them directly and through `hooks/usePermissions.js` | A session object passed in; permissions come from it |
| `context/SoftphoneContext.jsx` | Reads both auth contexts and stored SIP settings; auto-registers | One phone owner that takes session and SIP credentials as input |
| `services/cable.js` (`getConsumer`) | Global consumer | One cable owner, scoped to the session |

Rules:

- **One owner each** for session, SIP and cable, mounted above the page layout
  (as `SoftphoneProvider` is today in `App.jsx`), so moving or previewing blocks
  never drops a call or registers twice.
- **"No Nimbus auth" means all the way down**, not only no direct imports.
  `components/Phone/PhoneSignIn.js` also imports admin device access, which the
  user path must not need.
- Nimbus keeps working through a small adapter that feeds the Nimbus session
  into the layer.

## The Event Store and the timeline

Internal, on the server, as decided in `SAAS_CORE_BOUNDARY.md`:

```text
Call or message happens (FreeSWITCH / SMS provider)
  → API records the fact in Ruby Event Store
  → API publishes a scoped public event
  → the user's app is notified over the cable
  → the block fetches current state from the API
```

- **Recorded:** call and message facts, command outcomes, audit.
- **Not recorded:** raw audio, sensitive content that would live forever,
  imported old history (kept read-only and labelled).
- **Gaps to close first** (API docs): the Event Store uses a separate database
  pool from the models; `event_publisher` buffers in memory; the switch-event
  subscriber can lose an event before it is written; projection rebuilds must
  never redial, resend or re-pop.
- **Public event envelope:** stable event ID, type and version, time,
  environment, call/interaction reference, correlation ID, minimal payload.
  Delivery is at least once; blocks handle duplicates and refetch after
  reconnect.

## Example apps around the core

```text
                     ┌── CRM (Close-style)
 Phone + Messages +  ├── Support desk (tickets linked to calls)
 Timeline + Inbox    ├── Contact centre (queues, live board, dialer)
                     └── The customer's own app
```

**CRM is the first.** Lessons from Close, a CRM built around calling:

| Close | Ours |
|---|---|
| Lead page: contacts and one activity timeline | Contact page = contact block + timeline block |
| Calls log themselves with duration, recording, outcome | Public call events → CRM records the activity |
| Click-to-call everywhere; a call bar that stays | The phone block above the layout; `click2call` exists in the API and ACL |
| Post-call note and outcome | Interaction panel that opens with the call |
| Inbox of tasks, missed calls, voicemails | The core Inbox block plus CRM reminders |
| Smart Views you can dial through | Existing segments and saved filters; dialer later |

**The CRM backend** is a customer-owned Ruby service on Sequel, using Ruby Event
Store and adapting the RailsEventStore `ecommerce` CRM domain (`domains/crm`:
contacts, companies, later pipelines and deals), the way its Hanami example
runs without Rails. It is separate from the VoipAppz core. Contacts, fields,
activities and reminders live there, not in the core.

## Blocks and delivery

Each block is a folder following the repo's component + hook pattern:

```text
src/features/phone/
  manifest.js       name, version, platform-layer version, needs, ACL keys, props
  Phone.jsx         MUI component
  Phone.js          hook
  locales/en.json, he.json
  index.js
```

The manifest states what the block depends on (platform layer version, shared
UI, other blocks) so a copied block can be checked and upgraded.

Delivery follows shadcn/ui: a starter repo, blocks copied into it, a registry
JSON built from the manifests. A CLI (`add`, `diff`) comes later; copied blocks
do not update themselves, so `diff` shows what changed upstream.

## One file assembles a page

A layout file places blocks on a page. It is proven on one page first, not by
converting the whole Nimbus sidebar.

```json
{
  "version": 1,
  "pages": [
    {
      "id": "calls",
      "title": "Calls",
      "blocks": [
        { "id": "history-1", "block": "call-history", "x": 0, "y": 0, "w": 2, "h": 4 },
        { "id": "timeline-1", "block": "timeline", "x": 2, "y": 0, "w": 2, "h": 4 }
      ]
    }
  ]
}
```

- Every block instance has a stable `id`; the file has a `version`.
- Coordinates are bounded integers on the widget board's grid
  (`DashboardBuilder/widgetLayout.js` converts stored `x/y/col/row` to
  `x/y/w/h`). Narrow screens stack blocks in order.
- The whole file is validated before preview or apply: known blocks, allowed
  props, existing page references, the user's permissions.
- It lives in the customer's source. The widget board today saves only to
  browser storage, which is not enough.

## The chat builder

The customer describes what they want, sees it, and keeps real source.

```text
"Put the phone on the right and recent calls on the left"
  → a server endpoint proposes a layout change
  → validated, previewed, applied or undone
```

- **v1 edits the layout file only**, through a dedicated server endpoint. The
  existing AI chat (`components/AIChat/`, streaming from `/api/vmls/generate`)
  is the starting point, not the contract.
- The model sees the block registry and redacted capability data. No
  credentials and no customer records in prompts.
- The server checks the **current user's** grants, not just that an ACL key
  exists. Model output cannot authorize anything.
- Preview uses sample data and never touches the live phone session.
- No account changes (queues, numbers) from chat in v1.
- Later: code edits on the customer's copy, shown as a diff.

## Order of work

| Step | Deliverable | Done when |
|---|---|---|
| 0 | Map: API calls, events and ACL keys each communication block needs in a user session; decide how a customer app gets its session and SIP credentials | One table; no block assumed to work as a user without evidence |
| 1 | Platform layer: session input, named-method client, one SIP owner, one cable owner | Phone and call history run with a session passed in; no Nimbus auth underneath |
| 2 | Phone block: redesign `19d566b` moved onto current `main` (keeping `main`'s no-stored-password and device-JWT changes); persistent call bar | Nimbus phone works as before for account and user sessions |
| 3 | Event Store gaps and public call/message events (API repo) | Two-tenant isolation, no duplicates on retry, recovery after a crash, rebuilds with no side effects |
| 4 | Timeline, Messages and Inbox blocks | A user sees calls and messages for a number in one stream and works an inbox |
| 5 | One layout-driven page in the user portal | The page is assembled from the layout file; the phone survives layout changes |
| 6 | Starter app: communication core only | A clean app with no Nimbus code: a user calls, messages and sees the timeline; a second tenant is rejected; reconnect works |
| 7 | CRM example: backend (CRM plan P0 to P2, adapted from `ecommerce`) then screens (P3) | Call → contact with a custom field → note → reminder, across two tenants |
| 8 | Chat builder v1: layout only | A developer builds a page by chat; invalid or unauthorized changes are refused |
| Later | Janus conference block, dialer over segments, more example apps, CLI, code-editing chat, moving the Nimbus sidebar onto layout files | |

Checks run in CI as this repo requires; locally only lint.

## Decisions needed

- How a customer's app gets its session and SIP credentials.
- Who runs the CRM backend: the customer, us per customer, or both.
- Ruby for the CRM backend (reuses `ecommerce`) versus a language-neutral option.
- The `ecommerce` licence for adapting and redistributing its code.
- The starter's repository, licence and branding rights.
- Where the chat model runs and who pays for it.
- The first pilot customer.

## Not in this plan

- Publishing npm packages before blocks are stable.
- A new state library, build tool or design system.
- Merging the RailsEventStore `ecommerce` Rails app.
- A drag-and-drop page builder library unless the grid and chat are not enough.

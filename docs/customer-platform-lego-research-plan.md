# Customer app builder: plan

Date: 15 October 2026. Status: plan only. No code, packages or deployment.

## The idea

Customers get the source code of a VoipAppz app built on this repo's React + MUI
components, and assemble their own app from it like Lego: pick blocks, arrange
them, theme them, and change any line they want. A chat helps them do it.

We build on what already exists here: the components, the MUI theme, i18n
(English/Hebrew), the softphone and the live cable. No new UI framework, no
second design system, no Elixir.

## Already decided in the API repo

The platform side is planned in [voipappz/api](https://github.com/voipappz/api)
docs. This plan does not repeat them; it follows them.

| Doc | What it settles |
|---|---|
| [Customer application skeleton](https://github.com/voipappz/api/blob/main/docs/CUSTOMER_APPLICATION_SKELETON_PLAN.md) | The customer-owned starter is the primary deliverable. Business logic stays outside the core. |
| [React/MUI skeleton](https://github.com/voipappz/api/blob/main/docs/REACT_MUI_SKELETON_IMPLEMENTATION_PLAN.md) | Build it as a narrow feature inside this repo first, extract the starter once stable. |
| [Minimal call CRM](https://github.com/voipappz/api/blob/main/docs/MINIMAL_CRM_PORTAL_IMPLEMENTATION_PLAN.md) | The first app: contacts, custom fields, call activities, reminders. Its blocks and phases. |
| [SaaS core boundary](https://github.com/voipappz/api/blob/main/docs/SAAS_CORE_BOUNDARY.md) | Event Store stays internal; customers get a small versioned set of public events. |

What that means for the app:

- **Event Store is internal.** Blocks never write to it or read it. They get a
  scoped notification, then fetch the authorized state from the API.
- **CRM data lives in the customer's backend**, not in the VoipAppz core. The
  core supplies call context, permissions and call facts.
- **The browser is not a security boundary.** A customer can change every line
  of their copy; the API's checks still hold.

This plan adds three things the API docs leave open: how this repo's existing
components become blocks, how blocks reach the customer, and the chat builder.

## 1. Existing components become blocks

Measured on this branch (`src/components/<dir>`, non-test files). "Auth reads"
counts files that read `AuthContext`/`UserAuthContext` directly; those reads
are what has to move into the platform layer.

| Block | Existing source | Size | Ties to Nimbus | Work |
|---|---|---|---|---|
| Phone | `Phone/`, `lib/sip/`, `context/SoftphoneContext.jsx` | ~1,000 lines | `SoftphoneContext` reads both auth contexts and stored SIP settings; `PhoneScreen` is tied to the drawer; `panelTheme.js` has fixed colours | First block to move. Session comes in as input; phone body separated from the drawer; colours from the theme |
| Call history | `CallsLog/` | ~940 | `apiService`, navigation | Selection via callback instead of navigating |
| Live board | `Live/`, `hooks/useLiveEntities.js` | ~1,400 | Environment from context | Environment comes in as input |
| Dashboard widgets | `DashboardBuilder/` | ~2,300 | 1 auth read | Already a block system for widgets (templates, `react-grid-layout`, saved layouts); reuse it for page layout |
| Calls | `Calls/` | ~6,300 | 7 auth reads | Later; the most tangled screen |
| AI chat | `AIChat/` | ~1,700 | 1 auth read | Basis for the chat builder (streams from `/api/vmls/generate`) |
| Admin screens | `Users/`, `Extensions/`, `Segments/` and others | | Account-only | Stay out of the default customer starter |

Shared pieces every block already uses, kept as they are:

- Theme: `src/theme/tokens.js`, `theme.js`
- Dialogs: `src/components/ui/` (`ResponsiveDialog`, `ConfirmDialog`)
- Tables and filters: `src/components/shared/` (`ResponsiveTable`, `Filters`,
  date range picker)
- Small parts: `src/components/common/` (`StatusChip`, `StatCard`, `PageHeader`)
- Language: `src/i18n/` (`Bdi`, locale formatting) and
  [docs/i18n-guide.md](i18n-guide.md)

New blocks come from the CRM plan: `InteractionDrawer`, `ContactResolver`,
`DynamicFieldForm`, `ContactEditor`, `CallActivityEditor`, `ReminderEditor`,
`ActivityTimeline`, `ReminderList`.

### What a block looks like

Each block is a folder, following the repo's existing component + hook pattern:

```text
src/features/call-history/
  manifest.js        name, title, props, ACL key, API and realtime needs
  CallHistory.jsx    MUI component
  CallHistory.js     hook (state and actions)
  CallHistory.css
  locales/en.json, he.json
  index.js           what other code may import
```

```js
// manifest.js (proposed shape)
export default {
  name: 'call-history',
  title: 'Call history',
  aclKey: 'calls',
  needs: ['session'],
  props: { limit: { type: 'number', default: 25 } },
};
```

A block takes data and callbacks through props or narrow hooks. It does not read
the auth contexts, the URL's tenant, or `apiService` directly.

### The platform layer

One layer is **not** copied into the customer's code: the API client, the
session, SIP and the cable. Today these are `apiService.js` (one shared
instance), the two auth contexts, `SoftphoneContext` and `useWebSocket`. They
become one platform module that blocks use through hooks. We keep it updatable,
because call handling and security fixes must reach every customer.

## 2. Delivery: like shadcn/ui

We take shadcn's delivery model, not its library. The components stay MUI.

| shadcn | VoipAppz |
|---|---|
| `npx shadcn init` | A starter repo: login, layout, theme, platform layer, no features |
| `npx shadcn add button` | `npx voipappz add phone` copies `src/features/phone/` into the customer's app |
| Registry JSON | The block manifests collected into one JSON file |
| Blocks (whole sections) | Ready screens: phone, call history, CRM workspace, live board |
| You own the copied code | Same for blocks. The platform layer stays ours and is updated |

Updates to a copied block are the customer's choice: `npx voipappz diff phone`
shows what changed upstream. The CLI comes after the registry works; at first a
block is copied by hand from this repo.

## 3. One file assembles the app

`app.layout.json` says which blocks appear on which pages, the sidebar and the
theme. The router and sidebar read it; today the sidebar is the hard-coded
`NAV_ITEMS` list in `src/config/navConfig.js`.

```json
{
  "theme": { "primary": "#1565c0", "mode": "light" },
  "nav": ["calls", "contacts", "reminders"],
  "pages": {
    "calls": {
      "title": "Calls",
      "layout": [
        { "block": "call-history", "x": 0, "y": 0, "w": 2, "h": 4 },
        { "block": "phone", "x": 2, "y": 0, "w": 2, "h": 4, "props": { "compact": true } }
      ]
    }
  }
}
```

The grid uses the same `x/y/w/h` model as the existing widget board
(`DashboardBuilder/widgetLayout.js`). Nimbus itself is assembled from the same
kind of file, so it proves the blocks every day.

## 4. The chat builder

This is what makes the experience different. Customers are developers who do not
know VoIP. They say what they want, see it working, and keep real source code.

```text
"Put the phone on the right and the last 10 calls on the left"
  → the chat proposes a change to app.layout.json
  → live preview of the new page
  → apply or undo
```

It knows telephony, not just layout: it reads the registry and the customer's
account, so it can answer "you have no queue yet; create one?" or "this user
cannot see recordings; their ACL lacks that key".

Two levels, in order:

1. **Layout edits.** The chat only changes `app.layout.json`. Every change is
   checked against the registry (block exists, props valid, ACL key exists), is
   instant to preview and easy to undo. This is the first version.
2. **Code edits.** The chat changes the customer's own source and shows a diff
   ("add a VIP field to the contact form"). This works on the customer's copy,
   through their AI tool or ours.

Drag-and-drop editing sits next to the chat, reusing the widget board's grid.
The model runs server side only; no AI key in the browser. The existing AI chat
screen and its streaming endpoint are the starting point.

## Order of work

| Step | Deliverable | Done when |
|---|---|---|
| 1 | Block folder convention and manifest; move Phone into `src/features/phone/` | Nimbus phone behaves exactly as before; the block has no direct auth reads |
| 2 | Platform layer: client instance, session input, SIP and cable hooks | Phone and call history run with a session passed in, not read from Nimbus |
| 3 | `app.layout.json` drives Nimbus's sidebar and pages | `NAV_ITEMS` comes from the layout file; ACL filtering unchanged |
| 4 | First CRM story as blocks (CRM plan P3) | Save a contact with one custom field and create one reminder from a call |
| 5 | Starter repo and registry JSON | A clean app with no Nimbus code places a call using copied blocks |
| 6 | Chat builder v1: layout edits, preview, apply, undo | A developer builds a calls page by chat alone |
| 7 | CLI `add` and `diff` | A block is added and updated without copying by hand |

Steps 1 to 3 change Nimbus without changing what users see. Checks run in CI as
the repo requires; locally only lint.

## Open decisions

- How a customer's app gets its session and SIP credentials (open in the API
  skeleton plan).
- Where the chat model runs and who pays for it.
- The starter's repository, licence and branding rights.
- How copied blocks get updates: `diff` only, or a merge path.
- Which pilot customer goes first.

## Not in this plan

- Publishing npm packages before the blocks are stable.
- A new state library, build tool or design system.
- A full drag-and-drop page builder library. Add one (for example Puck) only if
  the grid and the chat are not enough.

# Communication platform: plan

Date: 15 October 2026. Status: plan only. No code, packages or deployment.
Replaces the draft on PR #207 (`docs/customer-platform-lego-research-plan.md`).

## The idea

Customers get the source code of a VoipAppz app built on this repo's React + MUI
components and assemble their own app from blocks, like Lego. **The phone and
communication are the heart.** Calls, messages and forms meet in one
conversation, and everything that happens is recorded in **Rails Event Store**.
Every app a customer builds (CRM, support desk, contact centre, their own
product) sits around that core.

The user grows into it step by step: a call bar, then a phone panel, then a
maximized workspace; first the phone, then timeline, inbox, forms and their own
pages.

## Principles

1. **Phone and communication first.** CRM and helpdesk are templates on top.
2. **Rails Event Store is the backbone.** Every domain follows the RailsEventStore
   `ecommerce` structure: commands, aggregates, events, read models, process
   managers. Configuration (forms, pages, macros) is event-sourced too.
3. **The user portal is the base.** Blocks are built and tested with a user
   session (`user_auth`, one environment, ACL-filtered), not an account admin.
4. **Blocks read read models and send commands.** They never touch the Event
   Store directly; the API authorizes every command.
5. **The browser is not a security boundary.** Model output and UI code
   authorize nothing; the API does.
6. **Every step ships on its own.**

## Already decided in the API repo

| Doc | What it settles |
|---|---|
| [Execution plan](https://github.com/voipappz/api/blob/main/docs/VOIPAPPZ_EXECUTION_PLAN.md) | Work order: map, protect, durable facts, starter, migration, operations |
| [SaaS core boundary](https://github.com/voipappz/api/blob/main/docs/SAAS_CORE_BOUNDARY.md) | Event Store gaps (separate pool, in-memory buffer, loss before write); outbox; public event envelope |
| [Customer application skeleton](https://github.com/voipappz/api/blob/main/docs/CUSTOMER_APPLICATION_SKELETON_PLAN.md) | Customer-owned starter as the primary deliverable |
| [React/MUI skeleton](https://github.com/voipappz/api/blob/main/docs/REACT_MUI_SKELETON_IMPLEMENTATION_PLAN.md) | Narrow feature in this repo first; inventory, restricted access, then adapters |
| [Minimal call CRM](https://github.com/voipappz/api/blob/main/docs/MINIMAL_CRM_PORTAL_IMPLEMENTATION_PLAN.md) | The CRM template's scope and blocks |
| [Application platform research](https://github.com/voipappz/api/blob/main/docs/APPLICATION_PLATFORM_MARKET_RESEARCH_AND_PLAN.md) | Adapt `ecommerce` domain code; do not merge its Rails app |
| `transcription-plan.md` (API, draft) | `CallTranscribed` event and `/api/calls/:id/transcript` |

## Best in breed: what we take from whom

| Source | Licence | We take | Where it lands |
|---|---|---|---|
| [RailsEventStore ecommerce](https://github.com/RailsEventStore/ecommerce) | MIT | Domains as folders, explicit command objects, aggregates, read model per screen, process managers tested as "given events, expect command", generated event catalog, test-first | Every backend domain |
| [Close](https://www.close.com) | Commercial, ideas only | Calls log themselves; persistent call bar; post-call note and outcome; Smart Views you can dial through | Phone sizes, timeline, dialer |
| [Chatwoot](https://github.com/chatwoot/chatwoot) | MIT except `enterprise/` | One inbox across channels; the conversation as the unit (status, assignee, labels); custom attributes; canned responses and macros; automation rules; apps in the conversation side panel; bot handoff | Conversation domain, inbox, macros, side-panel slots |
| [Zammad](https://github.com/zammad/zammad), [screenshots](https://zammad.org/screenshots) | AGPL-3.0, ideas only | CTI: caller log, caller ID matched to contacts, drivers per phone system. UI: three panes, open items as tabs, properties sidebar, text modules, stats dashboard with an activity stream | Caller ID, BYOP drivers, workspace layout, dashboard |
| [Discourse](https://github.com/discourse/discourse) | GPL-2.0, ideas only | Named UI slots for plugins ("outlets"), installable theme components, typed settings, MessageBus realtime that resumes from the last message ID, Voice plugin (WebRTC rooms, optional LiveKit) | Block slots, realtime resume, conference comparison |

Customers receive our source, so **no code is copied from GPL or AGPL projects**.
MIT code (`ecommerce`, Chatwoot core) may be adapted with attribution.

## Architecture

```text
Channels       Phone (SIP; Janus rooms later) · SMS · WhatsApp · web chat · email later
                 │  drivers per provider = BYOP adapters (Zammad CTI)
Caller ID      number → contact match → screen pop
                 │
Domains        Telephony · Conversation · Forms · Pages · Presence · Inbox · Contacts
(Rails Event   commands → aggregates → events → read models     (ecommerce)
 Store)        process managers = automation rules and macros   (Chatwoot)
                 │
Realtime       scoped notification with event ID; client resumes from last ID  (Discourse)
                 │
App            React + MUI blocks in named slots (Discourse outlets)
               Call bar → Phone panel → Maximized workspace (Close, Zammad layout)
                 ▲
Chat builder   proposes commands for forms, pages and macros
```

### Domains

| Domain | Aggregate | Events (examples) | Read models → blocks |
|---|---|---|---|
| Telephony | Call | `CallStarted`, `CallAnswered`, `CallHeld`, `CallTransferred`, `CallEnded`, `CallRecorded`, `CallTranscribed` | Call bar, call history |
| Conversation | Conversation | `ConversationOpened`, `MessageReceived`, `MessageSent`, `ConversationAssigned`, `ConversationLabelled`, `ConversationResolved` | Thread, inbox |
| Contacts | Contact, Organization | `ContactRegistered`, `ContactPhoneSet`, `ContactAssignedToOrganization` (adapted from `ecommerce` `domains/crm`) | Contact profile, caller ID |
| Forms | Form | `FormDefined`, `FieldAdded`, `FieldChanged`, `FormPublished`, `FormSubmitted` | Dynamic form, submissions in the timeline |
| Pages | Page | `BlockAdded`, `BlockMoved`, `BlockRemoved`, `PagePublished`, `ThemeChanged`, `NavChanged` | The app's pages, sidebar and theme |
| Presence | Agent | `AgentAvailable`, `AgentBusy`, `AgentAway` | Presence, live board |
| Inbox | Process manager | missed call, voicemail, unread message, reminder due → `InboxItemAdded`; handled → `InboxItemDone` | Inbox |
| Macros | Macro | `MacroDefined`, `MacroRun` | Macro buttons, text modules |
| Conference (later) | Room | `RoomOpened`, `ParticipantJoined`, `ParticipantLeft`, `RoomClosed` | Conference |

A call is part of a conversation: `CallAnswered` and `CallEnded` appear in the
same thread as messages and form submissions.

Existing foundations: Ruby Event Store 2.19.1 (`config/initializers/eventstore.rb`),
the `event_store_events` table, and `/api/events` with a call timeline
(`subject=call&subject_uuid=…`).

### Event Store rules

- **Close the gaps first** (`SAAS_CORE_BOUNDARY.md`): one transaction boundary
  (outbox) instead of a model write plus a separate-pool publish; no in-memory
  buffer as the success point; no switch event lost before it is written.
- **Version every event**; old events stay readable (upcasting).
- **Rebuilding read models never redials, resends or re-pops.**
- **Personal data:** form definitions, layouts and macros are plain events.
  Submitted answers and contact details are stored by reference or encrypted per
  contact so they can be deleted. Decide before step 5.
- **Event catalog** generated from code, as `ecommerce` does.

## The phone, in three sizes

| Size | What it shows | From |
|---|---|---|
| Call bar | Always on screen: caller, timer, answer, mute, hold, end | Close |
| Phone panel | Keypad, transfer, recent calls, presence | Redesign in commit `19d566b` on PR #207 |
| Maximized workspace | Three panes (Zammad): open items as tabs on the left; the conversation thread in the middle (calls, messages, forms, notes); properties on the right (status, assignee, labels, custom fields, contact, customer blocks) | Zammad + Chatwoot |

One SIP owner and one cable owner sit above all three sizes (as
`SoftphoneProvider` does today), so changing size or page never drops a call.
Changes in the properties pane are collected and saved as one command
(Zammad's Update bar).

The dashboard follows Zammad: stat tiles (from read models) and an activity
stream, which is the Event Store read directly as a feed.

## Blocks and slots

Each block is a folder: component, hook, manifest, `en`/`he` locales. The
manifest names the block, its version, the platform-layer version it needs, its
ACL keys, props and **slots** it can fill.

Named slots (Discourse outlets) where blocks plug in:
`call-bar`, `conversation-sidebar`, `conversation-composer`, `contact-profile`,
`dashboard-tile`, `inbox-item`. A customer's CRM form goes into
`conversation-sidebar` (Chatwoot dashboard apps).

The platform layer is not copied into customer code: user session in, an API
client with named methods only, one SIP owner, one cable owner. Today these are
`services/apiService.js`, the two auth contexts, `context/SoftphoneContext.jsx`
and `services/cable.js`.

## Forms and pages as events

The app renders forms and pages from read models. The chat builder and
drag-and-drop both produce the same commands:

```text
"Add a VIP checkbox to the call form and put the form next to the phone"
  → AddField(form: call, key: vip, type: boolean)
  → MoveBlock(page: calls, block: form-1, right_of: phone-1)
  → API checks the user's grants and validates
  → events stored → read models updated → preview → publish or undo
```

- Undo is a compensating command; history keeps every step and its author.
- Each submission records the form version it was filled in with.
- Field types are typed configuration (text, number, date, select, boolean), never code.
- The model sees the block registry and redacted capabilities, never credentials
  or customer records.
- No account changes (queues, numbers) from chat in v1.

## Step by step

| # | Step | API (Rails Event Store) | App (React + MUI) | Done when |
|---|---|---|---|---|
| 0 | Map | Current call and message events, where they can be lost | APIs, events, ACL keys each block needs as a user | One table, no assumptions |
| 1 | Dependable events | Outbox, event versions, no loss before write | Realtime resumes from the last event ID | Crash and retry tests: no loss, no duplicates, side-effect-free rebuilds |
| 2 | Telephony + Conversation | `Call` and `Conversation` aggregates, call-history and thread read models, test-first | Platform layer: user session in, named client, one SIP and one cable owner | Call history and thread come from read models |
| 3 | Caller ID | Contacts domain (from `ecommerce`), number matching, call log | Screen pop with exact, unknown and ambiguous matches | An incoming call shows the right contact or says it can't tell |
| 4 | Phone in three sizes | — | `19d566b` moved onto `main` (keeping its no-stored-password and device-JWT changes); call bar, panel, maximized | Resizing never drops the call; works for account and user sessions |
| 5 | Forms + Pages | Forms and Pages domains | Dynamic form and page assembly from read models; named slots | A form and a page are changed, previewed and undone |
| 6 | Timeline + Inbox | Timeline projection; Inbox process manager; assignment | Thread pane, inbox, stats dashboard with activity stream | A missed call lands in the inbox; a callback clears it |
| 7 | Messaging | SMS into the same conversation | Composer with text modules | Calls and SMS in one thread |
| 8 | Macros + automation | Macro aggregate; rules as process managers | Macro buttons | One click runs several commands, recorded as events |
| 9 | Starter app | Public event contract | Clean app with the communication core only | A user across two tenants; second tenant rejected; reconnect works |
| 10 | Chat builder v1 | Command-proposal endpoint with validation and grants | Chat beside the preview | A page and a form built by chat; invalid or unauthorized changes refused |
| 11 | Templates | CRM (Close-style, `ecommerce` CRM), support desk (Zammad and Chatwoot-style) | Template gallery | A new customer starts from a template |
| Later | | Conference (Janus; compare Discourse Voice and LiveKit), presence, deals and pipelines, reports and CSAT | Conference block, dialer over Smart Views | |

Checks run in CI as this repo requires; locally only lint.

## Decisions needed

1. **How far to event-source calls:** the `Call` stream as the source of truth, or
   today's call record plus events alongside.
2. **Ruby Event Store upgrade:** `ecommerce` runs a newer version than our 2.19.1
   with the ROM adapter.
3. **Personal data in events:** reference, or per-contact encryption.
4. **Customer customization:** commands (chat and drag-and-drop) for pages and
   forms, code only for new blocks; or layout files in the customer's repo.
5. How a customer's app gets its session and SIP credentials.
6. Where the chat model runs and who pays for it.
7. The starter's licence and branding; the first pilot customer.

## Not in this plan

- Copying code from GPL or AGPL projects.
- Merging the `ecommerce` Rails app or forking Chatwoot or Zammad.
- Publishing npm packages before blocks are stable.
- A new state library, build tool or design system.

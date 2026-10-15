# VoipAppz communication application framework: plan

Date: 15 October 2026. Status: plan only. No code, packages or deployment.
Replaces the draft on PR #207 (`docs/customer-platform-lego-research-plan.md`).

## 1. What we sell

An on-prem communication application framework. The customer installs the
VoipAppz stack (mothership + FreeSWITCH nodes, existing installer and offline
ISO) on their own servers, connects their own SIP carrier or PBX, and builds
their own communication app from React + MUI source blocks: softphone, calls,
messages, contacts, live board. Nothing leaves the building. A chat helps them
assemble pages. This matches how voipappz.com already talks: "in your cloud, at
your sites or with us", "bring your own carrier", "keep it".

**Pricing: one annual per-site licence, tiered by concurrent calls, with source
blocks, updates and standard support included.** Why: 3CX proved integrators
accept per-system-by-simultaneous-calls (about EUR 285-380 a year for 8 calls);
it is the same unit the current PCloud tiers already use (24 calls =
$332/month), so one price list serves both; per-minute (Twilio $0.0085-0.014,
Telnyx $0.002 + trunk, SignalWire $0.0066) is the cloud model we are arguing
against; per-seat (Flex $150 per named user, Chatwoot $19-99 per agent)
punishes the very customer who builds an app and adds users. One-time
onboarding is quoted separately, as today.

## 2. Who buys and why

- **Integrators and MSPs** who deliver phone systems to SMBs: one licence, a
  softphone and admin that work on day one, and they can brand and extend the
  app instead of hiding 3CX behind a wrapper.
- **Software teams adding voice to their product** (CRM, helpdesk, AI agent): a
  working React softphone and call history they paste into their app, on their
  servers, with no per-minute meter and no VoIP knowledge needed.
- **Regulated sites** (clinics, government, finance, private networks): calls,
  recordings and messages never leave their network; Twilio and Telnyx cannot
  offer this at any price.

## 3. Comparison

| | Twilio | 3CX | FreePBX | Wazo | Chatwoot (self-hosted) | VoipAppz framework |
|---|---|---|---|---|---|---|
| How you pay | Per minute + Flex $150/named user or $1/active hour; Studio per execution | Per system per year, by simultaneous calls (~EUR 285-380, 8 calls) | Core free (GPL); paid modules 1y/25y bundles; PBXact | Free (GPLv3); enterprise on quote | Community free; enterprise per agent ($19-99 cloud) | Annual per-site licence by concurrent calls |
| Out of the box (UI) | None; Flex agent desk is paid extra | Full PBX, web client, mobile apps | Admin GUI, user panel | Minimal UI, API first | Full agent inbox | Admin, portal, WebRTC softphone, live board, SMS, plus the source |
| Builder / no-code | Studio (visual flows) | Call Flow Designer (Pro+, Windows) | Modules only | None | Automation rules | Chat that assembles pages and forms |
| BYOC / BYOP | Yes, $0.004/min | Approved SIP trunk list | Any SIP trunk | Any SIP | No phone of its own | Any SIP carrier or existing PBX |
| Who runs it | Twilio, US cloud | You or a 3CX partner | You | You | You | You install; we support |
| Weakest point for a small dev | Costs stack per product and per minute; cloud only | Closed; no app source; thin API; support EUR 100/ticket | Needs Asterisk knowledge; PHP; no modern app SDK | GPL touches your code; community support only | No telephony; must fork a Rails app | Young ecosystem; you host it |

Sources: [Twilio Flex pricing](https://www.twilio.com/en-us/flex/pricing),
[Twilio voice US](https://www.twilio.com/en-us/voice/pricing/us),
[Twilio Studio](https://support.twilio.com/hc/en-us/articles/360007778033-How-Does-Twilio-Studio-Pricing-Work),
[Telnyx](https://telnyx.com/pricing/call-control),
[SignalWire](https://signalwire.com/pricing),
[Plivo](https://www.plivo.com/voice/pricing/us/),
[jambonz](https://www.jambonz.org/pricing/),
[3CX prices](https://skipcall.io/en/reviews/3cx),
[3CX 2026 changes](https://www.cloudtalk.io/blog/3cx-pricing/),
[FreePBX bundles](https://www.thetelecomspot.com/collections/freepbx),
[Sangoma support terms](https://sangomakb.atlassian.net/wiki/x/gQDQAQ),
[Wazo Platform](https://wazo-platform.org/),
[Chatwoot pricing](https://www.chatwoot.com/pricing),
[voipappz.com](https://voipappz.com).
3CX and Vonage figures come from secondary 2026 sources; their official pricing
pages did not load during research.

## 4. The framework, simple

- **What they install:** mothership + one FreeSWITCH node from the existing
  installer or ISO, their SIP carrier or PBX attached, admin console as today.
  One documented carrier topology.
- **What blocks they get:** the React + MUI source for softphone (SIP.js, call
  bar + phone panel), calls history, messages, contacts with caller-ID pop, live
  board. Each block is a folder: component, hook, `en`/`he` locales. One named
  API client and one user session wrap them.
- **History:** plain tables (calls, messages, contacts, notes) filled from the
  call and message events Ruby Event Store 2.19.1 already records, and the
  existing `/api/events` timeline per contact. Fix loss-before-write; nothing
  else in the event pipeline changes.
- **The chat:** sits beside the app, writes page layout JSON (which blocks,
  where) and a typed contact form; the customer commits the result to their
  repo. Their own LLM key.
- **What they build:** their own pages around the blocks (CRM panel, support
  desk, dispatch board) in normal React. We do not host their app.

**Cut from the earlier draft:** the Forms, Pages, Macros, Inbox and Presence
event-sourced domains; aggregates and process managers for anything but calls;
outbox, upcasting and event catalog work; realtime resume-from-last-ID; the
named-slot plugin system; the maximized three-pane workspace; templates
gallery; conference; the "personal data in events" question (plain tables,
deletable rows).

## 5. Steps

1. **Installable kit:** installer + admin + portal + softphone on one documented
   carrier topology. Sell: site licence as a PBX with a WebRTC softphone.
2. **Source blocks:** starter repo with the five blocks, named client, user
   session; one integrator builds one page. Sell: licence + paid onboarding.
3. **Calls that log themselves:** caller-ID pop, contact, post-call note, from
   existing events. Sell: to software teams adding voice.
4. **SMS in the same thread.** Sell: messaging add-on tier.
5. **Chat builder v1:** layout and form by chat. Sell: upsell for developers
   without VoIP knowledge.
6. **Two templates:** CRM panel and support desk. Sell: partner-delivered
   packages.

Checks run in CI as this repo requires; locally only lint.

## 7. CRM core on the event store

Decided 2026-10-16: the CRM layer is event-sourced and dynamic. The shape
comes from [RailsEventStore/ecommerce](https://github.com/RailsEventStore/ecommerce)
`domains/crm`: a command, an aggregate that applies an event, and read models
owned by the application that subscribe to events and write plain tables
(`apps/rails_application/app/read_models/customers/configuration.rb` wires
one handler per event). We copy that shape, not its deals, pipelines or
companies. Our API is Sinatra + Sequel with Ruby Event Store already wired as
`$event_store`; the node already publishes an `EventCall` per switch fact
(`action`: ringing, answer, bridge, hold, hangup, ...).

### Streams and events

| Stream | Events | Note |
|---|---|---|
| `contact-<uuid>` | ContactRegistered {contact_id, environment_uuid, phone}, ContactFieldSet {field, value, by_user_uuid}, ContactTagged {key, value}, ContactUntagged {key}, ContactMerged {into} | One event per field change, as ecommerce's ContactEmailSet; the field key is data, so a new field needs no new class. |
| `call-<call_uuid>` | the existing EventCall facts, plus CallerMatched {contact_id}, NoteAdded {text, by_user_uuid}, OutcomeSet {outcome} | Today EventCall sits only in the global stream and is found by `type_uuid`; linking each one into `call-<uuid>` gives the session timeline for free. |
| `form-<environment_uuid>` | FieldDefined {key, label, type, options, required}, FieldRetired {key} | The dynamic part: a site adds a field with an event, not a migration. |

### Dynamic fields and tags

- The form is the FieldDefined events folded into a field registry (key,
  label, type, options). The React `DynamicFieldForm` from the CRM plan
  renders from that registry; values go back as ContactFieldSet.
- "Tags" stay the meta key:value model every list screen already shows
  (`MetaTagChips`): ContactTagged writes into `contacts.meta`, so chips and
  list filters work unchanged.
- Read models are plain, rebuildable tables: `contacts` (uuid,
  environment_uuid, phone, name, email, fields jsonb, meta jsonb,
  last_session_at), `sessions` (call_uuid, environment_uuid, contact_uuid,
  direction, started_at, answered_at, ended_at, user_uuid, outcome) and
  `session_events` (call_uuid, at, kind, text). One idempotent handler per
  event, no external effects on replay.

### Live and history share one key

The phone reads `X-Va-Call-Uuid` from the INVITE (it already does), the
cable's `call_events` stream carries `{type: "call", type_uuid: <call_uuid>,
action}` live, and `call-<uuid>` holds the history. So the SIP session, the
live row and the timeline are the same session. The Sessions screen takes
live rows from the cable (`useLiveEntities`) and everything else from the read
models; it never polls.

### API and ACL

Form-url-encoded, tenant-scoped, ACL-gated like every other endpoint:
`GET /api/sessions` (history; live rows come from the cable),
`GET /api/sessions/:call_uuid/events`, `POST /api/sessions/:call_uuid/notes`,
`GET|PATCH /api/contacts/:uuid` (fields, meta), `GET|POST /api/forms`
(field definitions). A user sees a pane only with its key: `calls` for
sessions, `messages` for SMS, and two new keys, `notes` and `contacts`. The
phone needs no key: a user with an extension gets it.

### First version, about three weeks

One developer with Claude, API repo access, tests on CI. The phone is done
(PR #226, CI green).

1. Week 1, API: Contact aggregate, FieldDefined, the three read models, the
   endpoints above; link EventCall into `call-<uuid>`.
2. Week 2, app: Sessions list live from the cable plus history, the session
   timeline, the contact pane with the dynamic form and tags, ACL keys.
3. Week 3: notes and outcome, Hebrew and 375px, CI tests; a SIPp scenario
   that calls the user's extension and drives the phone and the timeline end
   to end.

## 8. What we take from Discourse

[discourse.org/features](https://www.discourse.org/features), read on
2026-10-16. Discourse is a forum, but it is the best example of a product
that ships source, stays simple, and still feels complete. The mapping:

| Discourse feature | Ours | When |
|---|---|---|
| Conversations, not pages (content loads as you scroll) | Sessions list scrolls, no pagination; live rows pinned on top | Step B1 |
| Simple, but with context (one flowing list, expandable context) | Session timeline is one list; a note or transfer expands in place | Step B2 |
| Chat in real time, move messages into topics | Notes and SMS live in the session; nothing is "moved", the session is the topic | Step B2, step 4 (SMS) |
| Reply via email | SMS and email replies land in the same session thread | Step 4 |
| A personal touch (custom sidebar, preferences) | Per-user column and layout choices we already store; ☰ hides the list | Done / B1 |
| Born mobile, born to touch | The 375px rule and the stacked three panes | Every step |
| Trust system, community moderation | ACL keys per pane and control; nothing without a key | Every step |
| Admin dashboard | The Dashboard board, with the Live seed (section 5, D1 to D3) | Plan D |
| Comprehensive API (any on-screen action through the API) | Rule for the framework: every screen action is a form-url-encoded endpoint, so a customer's block can do what our screen does | Every step |
| 100% open source | Customers get the source (section 1) | Done |
| One-click updates | The installable kit's update path from the dashboard | Step 1 |
| Auto-save drafts | Note drafts kept per session in the browser | B2 |
| Post revision history | Free: every change is an event in the store | Section 7 |
| Desktop notifications | Incoming call alerts already exist; add session mentions later | Done / later |
| Summarize topics (AI) | AI summary of a session, from the chat builder's LLM endpoint | Step 5 |
| Links automatically expand | Rich previews in notes | Later |
| Personal messaging | Agent to agent chat inside the app | Later |
| Dark mode and WCAG scheme | MUI theme, both modes, contrast checked | Later |
| Badges, emoji, polls, wiki posts, SEO, blog, invite-only | Not for a communication app | No |

The rule we keep from it: one list, one thread, one API, source in the
customer's hands, and a product that still looks finished with everything
else switched off.

## 6. Decisions for the owner

1. Tier prices per concurrent-call band, and whether source blocks ship in
   every tier or only above the first.
2. Licence for the source: customer may modify and run; may they redistribute?
3. Chat LLM: customer's own key (recommended) or metered through us?
4. First pilot: which integrator and which carrier topology?
5. Website: lead with on-prem, keeping PCloud as the "with us" option?

## Ideas kept for later (not in scope)

From Close: dialer over saved views. From Chatwoot: one inbox across channels,
macros. From Zammad: three-pane workspace, text modules. From Discourse: named
UI slots, realtime resume. From RailsEventStore `ecommerce`: full event
sourcing per domain. Janus conference rooms (API merged, no UI). Each returns
only when a paying customer asks for it.

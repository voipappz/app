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

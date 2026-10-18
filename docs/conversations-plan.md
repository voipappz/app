# Conversations: next steps

Written 2026-10-16. Builds on [communication-platform-plan.md](communication-platform-plan.md)
(sections 7 and 8), the API's `docs/CONVERSATIONS.md`, and the earlier research in
`voipappz-api/docs/MINIMAL_CRM_PORTAL_IMPLEMENTATION_PLAN.md` and `SAAS_CORE_BOUNDARY.md`
(roles, data model, "CRM is a first-party application, not core"). Voice first: a call is the
conversation, SMS comes later, no voicemail (VML is the bot).

## 1. Where we are

- API (`api-conversations`, PR merged): event-store only. Streams `call-<uuid>`,
  `conversations-<env>`, `contact-<uuid>`, `contact-phone-<env>-<key>`, `form-<env>`.
  Events `CallSummarized` (source of truth, on every CDR), `NoteAdded`, `CallerMatched`,
  `ContactRegistered`, `ContactFieldSet`, `ContactTagged/Untagged`, `FieldDefined/Retired`.
- Endpoints: `GET /api/conversations` (filters, page/per_page, order_by/order_kind, from/to,
  `X-Total`), `GET …/:call_uuid`, `GET …/:call_uuid/events`, `POST …/:call_uuid/notes`.
- Contact and form folds, their writers and `/contacts`, `/fields` endpoints: specified, not built.
- App (PRs #230, #231, #233-#235 on main), as the owner reshaped it in the Codex session of
  2026-10-16 ([conversations-history-module.md](conversations-history-module.md)):
  - **History only.** No Live tab; the list tabs are **All / Missed**, plus search on its own
    row, the date range and the view menu (sort, scope). Live calls belong to the phone.
  - **Two panes: conversation and phone.** List + thread on the left and middle, the phone on
    the right. The contact panel is gone from this screen.
  - **One card per call**, grouped by call ID (`groupCallHistory.js`), in plain language for a
    non-technical user (Close's "Called…", "Missed call from…"). The latest summary shows first;
    earlier events sit under "Call details". Notes flow between the cards; the button says
    "Save note".
  - An activity chart with Today / 7 days / 30 days / custom for the selected conversation
    (`ConversationActivity`, `HistoryPeriod`); **Sign out** in the phone header.
  - Modules: `useConversations`, `useConversationHistory`, `useConversationNotifications`,
    `SessionList`, `ConversationThread`, `CallSummary`, `NoteComposer`.
  - ACL keys `calls`/`call`, `notes`; `can('call','environment')` for "Everyone".
- Realtime (API PR #124): after an event is readable on its call stream, Ruby publishes
  `{type: "conversation.changed", version: 1, event_id, call_uuid}` over NATS to the existing
  user-scoped `Notifications` channel of the Crystal cable. No body, number or note on the wire.
  The app batches bursts (300 ms), skips duplicate event IDs and refetches from the API; it also
  refetches on reconnect, focus and every 60 s while visible. Incoming-call popups stay in the
  softphone. No new socket server.
- Rules kept: no read-model tables, the API never opens a socket (it only publishes the change
  notice to NATS), portal users only, one `Conversations` module, no "crm" naming, SMS out of
  scope.

## 2. Chatwoot mapping

Sources: [conversation.rb](https://github.com/chatwoot/chatwoot/blob/develop/app/models/conversation.rb)
(`status: open 0, resolved 1, pending 2, snoozed 3`; `priority`, `assignee_id`, `team_id`,
`snoozed_until`, `agent_last_seen_at`, `custom_attributes`),
[message.rb](https://github.com/chatwoot/chatwoot/blob/develop/app/models/message.rb)
(`message_type: incoming, outgoing, activity, template`; `private` = internal note),
[activity_message_handler.rb](https://github.com/chatwoot/chatwoot/blob/develop/app/models/concerns/activity_message_handler.rb)
(status, label, priority, mute changes become `message_type: :activity` rows),
[contact.rb](https://github.com/chatwoot/chatwoot/blob/develop/app/models/contact.rb)
(E.164 phone, unique email/identifier per account, `custom_attributes`),
[contact_merge_action.rb](https://github.com/chatwoot/chatwoot/blob/develop/app/actions/contact_merge_action.rb)
(moves conversations, messages, notes to the base; base attributes win; mergee destroyed),
[label.rb](https://github.com/chatwoot/chatwoot/blob/develop/app/models/label.rb) (lowercase title,
unique per account, color), [canned_response.rb](https://github.com/chatwoot/chatwoot/blob/develop/app/models/canned_response.rb)
(`short_code` unique per account, ranked search), [macro.rb](https://github.com/chatwoot/chatwoot/blob/develop/app/models/macro.rb)
(personal/global, list of actions), [automation_rule.rb](https://github.com/chatwoot/chatwoot/blob/develop/app/models/automation_rule.rb)
(event, conditions, actions, delay), [csat_survey_response.rb](https://github.com/chatwoot/chatwoot/blob/develop/app/models/csat_survey_response.rb)
(rating 1–5 per resolved conversation), [inbox.rb](https://github.com/chatwoot/chatwoot/blob/develop/app/models/inbox.rb)
(one inbox per channel; auto-assignment, CSAT flags), [account_user.rb](https://github.com/chatwoot/chatwoot/blob/develop/app/models/account_user.rb)
(`availability: online, offline, busy`, `auto_offline`), [conversation_finder.rb](https://github.com/chatwoot/chatwoot/blob/develop/app/finders/conversation_finder.rb)
(`assignee_type` me/unassigned/assigned/all, default `status=open`, 25 per page, meta counts
`mine_count`, `unassigned_count`, `all_count`), [routes.rb](https://github.com/chatwoot/chatwoot/blob/develop/config/routes.rb),
[keyboard shortcuts](https://chatwoot.com/features/keyboard-shortcuts), [reports](https://www.chatwoot.com/docs/user-guide/features/reports/overview),
[CSAT](https://www.chatwoot.com/docs/user-guide/features/csat).

| Chatwoot | Ours | Event store | Pane | When |
|---|---|---|---|---|
| Conversation status open/resolved/pending/snoozed | Call status open/resolved (snoozed later; no pending) | `ConversationResolved`/`Reopened`/`Snoozed` on `call-<uuid>`; last wins | List tabs, thread header | Now (snooze Later) |
| Assignee | The user responsible for the call; defaults to the answering user | `ConversationAssigned {user_uuid}` / `Unassigned`; default from `CallSummarized.user_uuid` | List row, thread header chip | Now |
| Team | Queue (`queue_name` already on the summary) | nothing new; filter on summary data | List filter | Later |
| Labels (fixed list, lowercase, color) | Meta tags `key:value`, same as contacts and every list screen | `ConversationLabeled {key,value}` / `Unlabeled {key}`; fold = map | Thread header chips, list filter | Now |
| Priority | — | — | — | Skip |
| Unread / `agent_last_seen_at` | Unseen since last visit | `ConversationSeen` on a per-user stream | List row dot | Later |
| Conversation custom attributes | Call fields (outcome codes, order no.) | `FieldDefined {scope: call}` in `form-<env>`, `CallFieldSet` on `call-<uuid>` | Thread header | Later |
| Activity messages | Lines of kind `status`, `assign`, `label` in the thread | Fold of the events above; no extra event | Thread | Now |
| Private note | `NoteAdded` | done | Thread composer | Done |
| Contact: identifiers, custom attributes | `contact-<uuid>`, phone key, `ContactFieldSet` | specified | Right pane | Now (finish) |
| Contact merge | Merge into another contact | `ContactMerged {into}` on the mergee, phone stream relinked, expected version on both | Right pane menu | Later |
| Contact notes | A note with no call | `NoteAdded` on `contact-<uuid>` | Right pane | Later |
| Inbox / channel | Environment + DID/queue | nothing: the environment is the inbox | — | Skip |
| Canned responses (`short_code`) | Canned notes, later canned SMS | `CannedDefined/Retired` in `canned-<env>` | Composer `::` picker (Zammad's [text modules](https://admin-docs.zammad.org/en/latest/manage/text-modules.html)) | Later |
| Macros | Post-call buttons ("Resolved: callback done") | one request doing note + label + resolve | Thread | Later |
| Automation rules | Our services/workflows/triggers already act on `EventCall`; a subscriber can auto-resolve | event subscriber, no UI | — | Later |
| CSAT | — (the VML bot can ask) | — | — | Skip |
| Reports (open/unattended/unassigned, per agent, resolutions) | `GET /api/conversations/summary` | fold of `conversations-<env>` | Dashboard board | Later |
| Agent availability online/busy/offline | Phone registration + in-call state we already have | — | — | Skip |
| Three panes, `j`/`k`, `⌘E` resolve, `⌘O` reopen, `⌘M` snooze, `/` search, `⌘↵` send | Same keys | — | All panes | Now |
| Mute, SLA, teams, campaigns | — | — | — | Skip |

Close cues ([calling](https://help.close.com/docs/calling-from-close), [Smart Views](https://help.close.com/docs/smart-views)):
the call bar stays visible for the whole call and a call note opens by itself when the call
connects; a Smart View is a saved filter that doubles as a to-do list. We keep the phone column
fixed, open the composer on answer, and save the list's view per user (already stored). Zammad
cues ([states](https://user-docs.zammad.org/en/6.3/basics/service-ticket/settings/state.html),
[triggers](https://admin-docs.zammad.org/en/latest/manage/trigger.html)): "pending reminder"
is our snooze; triggers are our services, not a second rules engine. Discourse: already mapped
in section 8 of the platform plan.

## 3. Lifecycle as events

All on `call-<uuid>`; the Linker links each into `conversations-<env>` as it does for
`NoteAdded`. Data always carries `call_uuid`, `environment_uuid`, `by_user_uuid`, `at`.

| Event | Extra data | Fold rule | ACL |
|---|---|---|---|
| `ConversationResolved` | `note?` | `status = resolved` | `call` write |
| `ConversationReopened` | — | `status = open` | `call` write |
| `ConversationSnoozed` | `until` | `status = snoozed` until `until`, then `open` (time check at fold, no job) | `call` write (Later) |
| `ConversationAssigned` | `user_uuid` | `assignee = user_uuid` | `call` write for self; `call` environment scope for others |
| `ConversationUnassigned` | — | `assignee = nil` | same |
| `ConversationLabeled` | `key`, `value` | `labels[key] = value` | `call` write |
| `ConversationUnlabeled` | `key` | delete `labels[key]` | `call` write |

Defaults, before any of these: status `open` once the call has ended (a live call has no
status); a bot call (`outcome = bot`) is `resolved` at birth; assignee is the summary's
`user_uuid` when answered, none when missed. Last event wins per field. Every event is also a
thread line (`kind` = `status` | `assign` | `label`, text from the event), which is Chatwoot's
activity message without a message table.

Where the RailsEventStore `ecommerce` command → aggregate → event shape applies
([domains/crm](https://github.com/RailsEventStore/ecommerce)): contacts, as today
(`expected_version` on `contact-<uuid>`), `FieldDefined` (unique key per environment, so
expected version on `form-<env>`) and later `ContactMerged` (reads both aggregates). For the
call lifecycle a plain `publish` is enough: the operations are idempotent and last-wins, two
agents resolving the same call is harmless, and `call-<uuid>` is also written by the router and
the Linker, which would make a tight expected version fail for no reason. One exception, later:
"claim" semantics for a missed call (two agents assign themselves) can use the version read at
fold time and answer 409 on conflict.

## 4. API additions

Same conventions as today: form-url-encoded, user token only, 404 for what the caller cannot
see, `page`/`per_page` (≤ 100), `order_by`/`order_kind`, `from`/`to`, `X-Total`. Chatwoot's
`assignee_type` and `meta` counts fit; its "POST labels overwrites" does not, we keep the
contact's `meta[k]` / `remove_meta[]` shape.

| Method | Path under `/api/conversations` | Params | ACL |
|---|---|---|---|
| GET | `/` | + `status=open\|resolved\|snoozed\|all` (default `all`, app sends `open`), `assignee=me\|unassigned\|all\|<user_uuid>`, `label=key[:value]` repeatable | `call` read |
| GET | `/meta` | same filters; answers `{open, mine, unassigned, resolved}` | `call` read |
| POST | `/:call_uuid/status` | `status=open\|resolved\|snoozed`, `until` (ISO, snoozed), `note?` | `call` write |
| POST | `/:call_uuid/assignments` | `user_uuid` (empty = unassign) | `call` write / environment |
| PATCH | `/:call_uuid` | `meta[k]=v`, `remove_meta[]=k` | `call` write |
| GET | `/labels` | distinct `key:value` seen in the environment (for the filter menu) | `call` read |
| GET | `/:call_uuid/events` | unchanged; new line kinds `status`, `assign`, `label` | `call` read |
| GET, POST, PATCH | `/contacts`, `/contacts/:uuid`, `/contacts/lookup`, `/fields` | as specified in CONVERSATIONS.md | `contact` |
| POST | `/contacts/:uuid/merge` (Later) | `into` | `contact` write + environment |
| GET, POST | `/canned` (Later) | `short_code`, `text`; `q` | `notes` |
| GET | `/summary` (Later) | `from`, `to`, `by=day\|user\|outcome\|status` | `call` environment |

`conversation` gains `status`, `assignee_uuid`, `assignee_name`, `labels: {k: v}`.

## 5. UI additions per pane

Every step follows the UX the owner set in Codex: plain words a non-technical user reads at a
glance, one card per call, technical detail only on demand, nothing that changes the selection
or clears a draft when an update arrives.

Left list: tabs become **Open | All | Missed** (no Live; Open shows the `/meta` count and is the
landing tab). View menu gains **Assignee: Mine / Unassigned / Everyone**
(replaces today's scope toggle, same `call` environment check) and **Label**. Row: status dot,
assignee initials, up to two label chips. `j`/`k` move the selection.

Middle thread: header gets a **Resolve / Reopen** button (`⌘E` / `⌘O`), an **assignee chip**
with a menu of the environment's users, and **label chips** with an add field (the same
`MetaTagChips` as the other screens). Status, assignment and label events render as small
centered activity lines in plain words ("Dana marked this done", "Assigned to you"). Composer: note as today, plus a split button **Add note and resolve**;
`⌘↵` sends; the composer focuses when the phone answers (Close); `::` canned picker later.
Shortcuts are off while typing, except `⌘↵`.

Right column: **the phone only.** The owner removed the contact panel; contact data returns in
step 4 inside the thread, not as a pane (see below).

## 6. Steps

| # | Step | Size | Proves |
|---|---|---|---|
| 1 | Status: two events, fold, `status` filter, `/meta`, `/status` endpoint; Open/Resolved tabs, Resolve/Reopen button, `⌘E`/`⌘O`, `j`/`k` | S (1 week) | Lifecycle on the call stream with activity lines, no read model, fold still fast at the 5,000-event scan |
| 2 | Assignment: two events, default assignee from the summary, `assignee` filter, `/assignments`; Mine/Unassigned menu, assignee chip | S (1 week) | Environment-scope ACL for acting on others' calls; users list reuse |
| 3 | Labels: two events, `PATCH :call_uuid`, `/labels`, label filter; chips in thread and list | S–M (1 week) | Tags as data on calls with the chip component every screen uses |
| 4 | Finish the contacts half already specified (folds, writers, `/contacts`, `/fields`, specs). In the app: the contact's name replaces the number in the list and thread header; fields and tags open from the header as a collapsible section, not a third pane | M | Contacts end to end without bringing the panel back; FieldDefined with expected version |
| 5 | Snooze: `ConversationSnoozed {until}`, time-based status at fold, Snoozed filter | S | A timed state with no job |
| 6 | Canned notes: `canned-<env>` stream, `::` picker in the composer | M | The template store SMS will reuse |
| 7 | SMS in the thread (platform plan step 4); status, assignee, labels apply unchanged | L | One thread for two channels |
| 8 | `/summary` for the Dashboard board; if the fold is slow here, the first app-owned read model (ecommerce shape) | M | When a read model is actually needed |
| 9 | Contact merge | M | Two-aggregate command with expected versions |

Each step ships its specs on CI and the Hebrew/375px check as this repo requires. Every new
event (status, assignment, label, contact) also emits `conversation.changed` through the same
NATS notice, so open screens refresh with no new realtime code.

## Rule for every step: modular

Owner's rule (2026-10-16): everything is built as small, separable modules.
On the API, one file per event group, one mediator per fold or command, one
endpoint file per resource, each with its own spec. In the app, one component
per pane or control (list, thread, date range, dark panel, contact panel,
phone), one hook per data concern, one spec file per component, strings in
the `conversations` namespace. A step that cannot be added or removed on its
own is not done.

## 7. Open decisions

1. Is an answered call **open until resolved** (Chatwoot's default), or resolved at birth with
   only missed calls open? The second means fewer clicks for a voice team; the first gives a
   real work queue. Proposal: open until resolved, and "Add note and resolve" in one click.
2. ACL: resolve/assign/label under the existing `call` write key (proposal), or a new
   `conversations` key so a role can read calls without acting on them?
3. Labels: free `key:value` as on contacts (proposal), or an admin-defined list per environment
   with colors (Chatwoot's Label) via a `FieldDefined` of type `label`?
4. ~~Landing tab Open or Live~~ — decided 2026-10-16: no Live tab. Landing is **Open** once
   step 1 ships; **All** until then.
5. Does an agent who was not on the call need `call` environment scope to resolve it, or is a
   missed call in the user's queue theirs to act on?

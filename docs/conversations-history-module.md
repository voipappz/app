# Basic user portal: conversation history and phone

The portal shows saved conversations (list and selected thread) beside the phone.
On small screens the list opens with the menu button and the phone sits above
the thread. There is no admin navigation, contact panel or Live tab on this screen.
SMS is outside this change.

## Module boundaries

- `ConversationsScreen`: composes the history UI and the existing phone.
- `useConversations`: permissions, search/filter state and saved call selection.
- `useConversationHistory`: loads events by call ID and posts notes. Accepts an
  API adapter; it does not read auth context, browser storage or SIP state.
- `SessionList`: displays saved call rows and reports selection through callbacks.
- `ConversationThread` and `CallSummary`: display chronological events and call
  summary details supplied by the API.
- `NoteComposer`: owns one call's draft and submission state.

The backend owns Event Store. Its Conversations endpoint folds completed calls
from the environment stream and reads the selected call/contact's event stream.
The UI uses `GET /api/conversations`, `GET /api/conversations/:call_uuid/events`
and `POST /api/conversations/:call_uuid/notes`; no direct store access or new
backend event contract is introduced. Summary event data carries call duration,
agent and recording details, which are not guaranteed on list rows.

Incoming phone alerts remain in the existing SIP/softphone module and do not
change the history selection. `useConversationNotifications` subscribes to the
existing user-scoped `Notifications` channel on the shared ActionCable consumer.
Ruby emits `{type: "conversation.changed", version: 1, event_id, call_uuid}`
after the event is readable from its call stream. No event body, number or note
is sent on cable. Bursts are batched for 300ms; duplicate event IDs are ignored.
The list and selected thread refresh from the authorized API without changing
the selection or note draft. Reconnect, focus and a visible-page 60s recovery
refresh recover missed best-effort notifications. No Crystal channel or new
WebSocket service is required.

Local verification is limited to `npm run lint`. Regression tests for stale
responses, note drafts and save/refresh failures are supplied for CI.

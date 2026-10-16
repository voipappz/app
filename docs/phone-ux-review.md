# Phone UX review (user portal)

The phone drawer gets a call room for a USER session only. An account signed
into the admin console keeps the phone exactly as it was; the split is
`useIsUserSession()` inside `PhoneScreen.jsx`, nothing else changes.

The look follows the advanced-communication Janus app (dark room, avatar
circles that glow while that side speaks, "Call duration", round controls)
and the old Ionic portal's phone drawer. What a user sees in a call:

- "Call duration" over a bold tabular timer once the call is up; Incoming /
  Outgoing while it rings.
- Two avatar circles: you (with your extension and a Muted chip) and the
  remote party. A circle's border glows green while that side speaks, from a
  voice-activity reading of the local and remote streams (`useSpeaking`,
  streams exposed by `useSipPhone`).
- A status line with `role="status"`: Ringing, Connecting, Connected, On hold.
- Four round labelled controls: Mute, Hold, Transfer, Keypad. Mute and Hold
  expose `aria-pressed`; Transfer and Keypad expose `aria-expanded`. The DTMF
  keypad opens on demand and starts closed for every new call, as does the
  transfer panel.
- A fixed bar under the body with a round red Hang up, plus a round green
  Answer while an inbound call rings (then the red one reads Decline).
- Dialpad keys are 44px MUI buttons, the Call button carries its label, and
  the number field and backspace have accessible names.

All copy goes through the `phone` i18n namespace, English and Hebrew; nothing
is hard-coded in the component. The SIP.js session, media, hold (waits for the
PBX re-INVITE) and `TransferControls` are unchanged. A conference later is
more circles in the same row.

## Verification before merging

Local checks stop at `npm run lint` (CLAUDE.md). Unit tests run in CI
(`PhoneScreen.test.jsx`, `useSpeaking.test.js`). Still to check by hand:

- A 375px drawer in English and Hebrew, including a long SIP URI as the
  remote party.
- Receive, answer and decline a call as a user; confirm the toast and the
  drawer bar drive the same actions.
- The glow follows who is talking; it stops on mute (you) and on hold (them).
- Mute, hold/resume, keypad tones, blind and attended transfer during a call.
- Sign in as an account: the phone must look as it did before this change.

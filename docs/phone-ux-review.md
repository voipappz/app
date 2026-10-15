# Phone UX review

The customer app builder plan (blocks, delivery and the chat builder) is
in [Customer app builder](customer-platform-lego-research-plan.md).

This branch improves the existing Nimbus SIP.js phone presentation. It uses the
existing MUI icon set and palette, with a caller card, explicit call status,
labeled mute/hold/transfer controls, an expandable DTMF keypad, and an answer/end
call footer outside the scrolling drawer body. Idle dialpad keys are native
buttons so keyboard users can activate them. New copy is in English and Hebrew.

The generic caller icon does not claim a verified identity or indicate speech.
The existing SIP.js session and media implementation is unchanged. Hold still
waits for the PBX response and remains disabled while a transfer owns the call.
TransferControls retains the existing blind and attended transfer flow. Keypad
and transfer panel visibility reset for each new primary call.

## Developer verification before merging

Local verification is limited to `npm run lint` by AGENTS.md. Unit tests and
builds belong in CI. This UI change has not been tested in a live call or browser.

- Check desktop and a 320px drawer in English and Hebrew, including long SIP URIs.
- Dial using mouse and keyboard; confirm registration errors remain visible.
- Receive, answer and decline a call; confirm the existing toast and drawer
  buttons both use the same call actions.
- During a call, check mute, hold/resume, keypad tones, blind transfer and attended
  transfer including cancel and complete. Check the hang-up footer while viewing
  settings/logs and while scrolling a short drawer.
- End a call and start another; the keypad and transfer panel should start closed.

## Janus scope

This is a reviewable design step, not a conference implementation. No Janus SDK,
new dependencies, imported archive assets or alternative phone stack are added.
The separate API foundation provides opt-in AudioBridge room lifecycle. The
VA-Crystal/FreeSWITCH mod_janus and Lua changes remain in their separate worktree.
Conference participant controls, active-call conversion, multi-phone audio
verification and VideoRoom support still need implementation and end-to-end
validation before they can be exposed here.

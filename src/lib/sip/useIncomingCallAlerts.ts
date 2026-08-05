import { useEffect } from "react";
import type { CallInfo } from "./useSipPhone";
import { RINGBACK, RINGTONE, primeAudioOnGesture, startTone, type TonePattern } from "./tones";

export function incomingAlertKey(call: CallInfo | null): string | null {
  return call?.direction === "inbound" && call.state === "ringing" ? call.id : null;
}

/**
 * Which progress tone the current call warrants, if any.
 *
 * Outbound gets one too: `ringing` here means a 180 came back, so the far end
 * really is alerting. Without it an outgoing call is dead silence until answer,
 * and the caller cannot tell a ringing phone from a broken one.
 *
 * The returned `key` changes only when the tone should change, so the effect
 * below does not restart the oscillator on every unrelated re-render.
 */
export function toneForCall(call: CallInfo | null): { key: string; pattern: TonePattern } | null {
  if (call?.state !== "ringing") return null;
  return call.direction === "inbound"
    ? { key: `in:${call.id}`, pattern: RINGTONE }
    : { key: `out:${call.id}`, pattern: RINGBACK };
}

export async function requestIncomingCallNotifications(): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  try { await Notification.requestPermission(); } catch { /* unsupported policy/browser */ }
}

// Ringtone and system notification are derived effects of the canonical call
// state. They never mutate SIP state and always stop when the UUID/state changes.
export function useIncomingCallAlerts(call: CallInfo | null): void {
  const tone = toneForCall(call);
  const toneKey = tone?.key ?? null;
  const notifyKey = incomingAlertKey(call);
  const remote = call?.remote ?? "";

  // Arm the audio unlock on mount, not on the call: `resume()` only succeeds
  // from a user gesture, and there is no gesture when an INVITE arrives.
  useEffect(() => { primeAudioOnGesture(); }, []);

  // Keyed on the string alone, never on `tone`: the object is rebuilt every
  // render, and depending on it would tear down and restart the oscillator each
  // time an unrelated field of `call` changed. The key already encodes the
  // direction, so the pattern is recovered from it rather than closed over.
  useEffect(() => {
    if (!toneKey) return;
    return startTone(toneKey.startsWith("in:") ? RINGTONE : RINGBACK);
  }, [toneKey]);

  useEffect(() => {
    if (!notifyKey) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;

    let notification: Notification | null = null;
    try {
      notification = new Notification("Incoming call", { body: remote, tag: `sip-call-${notifyKey}`, requireInteraction: true });
      notification.onclick = () => { window.focus(); notification?.close(); };
    } catch { /* browser/policy may block notifications */ }

    return () => notification?.close();
  }, [notifyKey, remote]);
}

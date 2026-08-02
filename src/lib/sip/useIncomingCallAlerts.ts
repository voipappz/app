import { useEffect } from "react";
import type { CallInfo } from "./useSipPhone";

export function incomingAlertKey(call: CallInfo | null): string | null {
  return call?.direction === "inbound" && call.state === "ringing" ? call.id : null;
}

export async function requestIncomingCallNotifications(): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  try { await Notification.requestPermission(); } catch { /* unsupported policy/browser */ }
}

// Ringtone and system notification are derived effects of the canonical call
// state. They never mutate SIP state and always stop when the UUID/state changes.
export function useIncomingCallAlerts(call: CallInfo | null): void {
  const key = incomingAlertKey(call);
  useEffect(() => {
    if (!key || !call) return;

    let context: AudioContext | null = null;
    let oscillator: OscillatorNode | null = null;
    let gain: GainNode | null = null;
    let pulse: ReturnType<typeof setInterval> | null = null;
    try {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtor) {
        context = new AudioCtor();
        oscillator = context.createOscillator();
        gain = context.createGain();
        oscillator.frequency.value = 440;
        gain.gain.value = 0.08;
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        void context.resume().catch(() => {});
        pulse = setInterval(() => {
          if (!context || !gain) return;
          gain.gain.setValueAtTime(gain.gain.value > 0 ? 0 : 0.08, context.currentTime);
        }, 700);
      }
    } catch { /* visual toast remains available when audio is blocked */ }

    let notification: Notification | null = null;
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
      try {
        notification = new Notification("Incoming call", { body: call.remote, tag: `sip-call-${key}`, requireInteraction: true });
        notification.onclick = () => { window.focus(); notification?.close(); };
      } catch { /* browser/policy may block notifications */ }
    }

    return () => {
      if (pulse) clearInterval(pulse);
      try { oscillator?.stop(); } catch { /* already stopped */ }
      void context?.close().catch(() => {});
      notification?.close();
    };
  }, [key, call]);
}

// Call progress tones.
//
// Why this is a module and not a few lines inside the alert hook: browsers
// suspend an AudioContext created outside a user gesture, and `resume()` from a
// timer or a network callback is refused. A ringtone built when the INVITE
// arrives is therefore silent — which is exactly what shipped. The fix is to
// create and resume ONE context on the first click or keypress (logging in is
// enough) and keep it for the life of the page; tones started later just
// attach to a context that is already running.
//
// The context is deliberately never closed. Closing it would need another
// gesture to get audio back, and the next call may not come with one.

export interface TonePattern {
  /** Simultaneous frequencies, in Hz. Two of them give the familiar warble. */
  freqs: number[];
  onMs: number;
  offMs: number;
  /** 0..1. Kept low — this plays unexpectedly, at whatever volume is set. */
  gain: number;
}

/** Inbound: pulsing, insistent, meant to be noticed across a room. */
export const RINGTONE: TonePattern = { freqs: [440, 480], onMs: 700, offMs: 700, gain: 0.06 };

/** Outbound after 180: ITU cadence (425 Hz, 1s on / 3s off) — "it is ringing at the far end". */
export const RINGBACK: TonePattern = { freqs: [425], onMs: 1000, offMs: 3000, gain: 0.045 };

type AudioCtor = typeof AudioContext;

let shared: AudioContext | null = null;
let unhook: (() => void) | null = null;

function ctor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext
    || (window as typeof window & { webkitAudioContext?: AudioCtor }).webkitAudioContext
    || null;
}

function context(): AudioContext | null {
  if (shared) return shared;
  const Ctor = ctor();
  if (!Ctor) return null;
  try { shared = new Ctor(); } catch { return null; }
  return shared;
}

/** True once the context exists and is actually running (i.e. tones will be heard). */
export function audioUnlocked(): boolean {
  return shared?.state === "running";
}

/**
 * Arm the one-time unlock. Safe to call repeatedly; the listeners remove
 * themselves as soon as the context is running. Call it early — at phone mount,
 * not when a call arrives — so an ordinary click has already done the work by
 * the time the first INVITE lands.
 */
export function primeAudioOnGesture(): void {
  if (unhook || audioUnlocked() || typeof window === "undefined") return;

  const events = ["pointerdown", "keydown", "touchstart"] as const;
  const onGesture = () => {
    const ctx = context();
    if (!ctx) { unhook?.(); return; }
    void ctx.resume().then(() => { if (ctx.state === "running") unhook?.(); }).catch(() => {});
  };

  unhook = () => {
    for (const name of events) window.removeEventListener(name, onGesture);
    unhook = null;
  };
  for (const name of events) window.addEventListener(name, onGesture, { passive: true });
}

/**
 * Start `pattern`, looping until the returned stop function is called. Stopping
 * is idempotent. Returns a no-op when Web Audio is unavailable, so callers can
 * treat the visual toast as the guaranteed alert and the tone as a bonus.
 */
export function startTone(pattern: TonePattern): () => void {
  const ctx = context();
  if (!ctx) return () => {};
  // A gesture may have happened since priming without our listener seeing it
  // (e.g. inside an iframe); asking again is free and sometimes wins.
  if (ctx.state !== "running") void ctx.resume().catch(() => {});

  let gain: GainNode;
  let oscillators: OscillatorNode[];
  try {
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    oscillators = pattern.freqs.map((hz) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = hz;
      osc.connect(gain);
      osc.start();
      return osc;
    });
  } catch {
    return () => {};
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let audible = false;
  const tick = () => {
    audible = !audible;
    // Ramp rather than jump: stepping the gain of a running oscillator clicks.
    gain.gain.setTargetAtTime(audible ? pattern.gain : 0, ctx.currentTime, 0.01);
    timer = setTimeout(tick, audible ? pattern.onMs : pattern.offMs);
  };
  tick();

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    try {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
      // Let the fade finish before the oscillators die, or the stop itself clicks.
      for (const osc of oscillators) osc.stop(ctx.currentTime + 0.08);
    } catch { /* context already gone */ }
    setTimeout(() => { try { gain.disconnect(); } catch { /* already detached */ } }, 200);
  };
}

/** Test seam: forget the shared context so the next call builds a fresh one. */
export function resetToneAudioForTests(): void {
  unhook?.();
  shared = null;
}

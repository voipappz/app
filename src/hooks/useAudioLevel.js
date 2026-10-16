import { useEffect, useState } from 'react';

const SPEAKING_ABOVE = 10;   // average byte level that counts as speech
const FULL_SCALE = 60;       // average byte level shown as a full equalizer
const STEP = 0.03;           // re-render only when the level moves this much

// How loud is this stream right now? Reads an analyser every animation frame
// and answers `{ level, speaking }`: level is 0..1 smoothed for an equalizer,
// speaking is a plain yes/no for a glow. Taken from the advanced-communication
// Janus room (useVoiceActivityDetector), extended with the level so the phone
// can draw Close-style audio bars. Without a stream, or in a browser with no
// AudioContext, it answers silence and does nothing.
const SILENCE = { level: 0, speaking: false };

export function useAudioLevel(stream) {
  const [state, setState] = useState(SILENCE);

  useEffect(() => {
    const Ctx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!stream || !Ctx || typeof stream.getAudioTracks !== 'function' || stream.getAudioTracks().length === 0) {
      setState(SILENCE);
      return undefined;
    }
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    let level = 0;
    let shown = SILENCE;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i];
      const avg = sum / data.length;
      level = level * 0.6 + Math.min(1, avg / FULL_SCALE) * 0.4;
      const speaking = avg > SPEAKING_ABOVE;
      if (speaking !== shown.speaking || Math.abs(level - shown.level) > STEP) {
        shown = { level, speaking };
        setState(shown);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      Promise.resolve(ctx.close?.()).catch(() => {});
      setState(SILENCE);
    };
  }, [stream]);

  return state;
}

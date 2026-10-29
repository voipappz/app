// One call to the voice bot through Builder's bridge, in Earshot's native
// framing: the caller's audio as binary PCM16 mono 16 kHz in 20 ms packets,
// `speech_started` / `speech_stopped` text events around each utterance; the
// bot answers with binary PCM16 16 kHz and `{"type":"clear"}` on barge-in.

export const SAMPLE_RATE = 16000;
export const PACKET_SAMPLES = 320; // 20 ms

// Float samples [-1, 1] to little-endian PCM16.
export function toPcm16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function fromPcm16(buffer) {
  const pcm = new Int16Array(buffer);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) out[i] = pcm[i] / 0x8000;
  return out;
}

// Collects the microphone into 20 ms packets on the audio thread.
const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${PACKET_SAMPLES}); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === ${PACKET_SAMPLES}) { this.port.postMessage(this.buf.slice()); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('builder-capture', Capture);
`;

export async function createBotCall(url, { onError, onClose }) {
  // The context runs at 16 kHz: the browser resamples the microphone in and
  // the bot's audio out.
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  const module = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }));
  await context.audioWorklet.addModule(module);
  URL.revokeObjectURL(module);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  const source = context.createMediaStreamSource(stream);
  const capture = new AudioWorkletNode(context, 'builder-capture');
  source.connect(capture);

  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('Could not reach the bot through Builder.'));
  });

  let speaking = false;
  let playAt = 0;
  const playing = new Set();

  const clearPlayback = () => {
    for (const node of playing) { try { node.stop(); } catch { /* already ended */ } }
    playing.clear();
    playAt = 0;
  };

  capture.port.onmessage = ({ data }) => {
    if (speaking && socket.readyState === WebSocket.OPEN) socket.send(toPcm16(data).buffer);
  };

  socket.onmessage = ({ data }) => {
    if (typeof data === 'string') {
      let event;
      try { event = JSON.parse(data); } catch { return; }
      if (event.type === 'clear') clearPlayback();
      else if (event.type === 'builder_error') onError?.(event.message);
      return;
    }
    const samples = fromPcm16(data);
    if (!samples.length) return;
    const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    playAt = Math.max(playAt, context.currentTime + 0.05);
    node.start(playAt);
    playAt += buffer.duration;
    playing.add(node);
    node.onended = () => playing.delete(node);
  };

  const close = () => {
    speaking = false;
    clearPlayback();
    try { socket.close(); } catch { /* closed */ }
    stream.getTracks().forEach((track) => track.stop());
    context.close().catch(() => {});
  };
  socket.onclose = () => { close(); onClose?.(); };

  const sendEvent = (type) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type }));
  };

  return {
    get open() { return socket.readyState === WebSocket.OPEN; },
    startSpeaking() {
      if (context.state === 'suspended') context.resume();
      // Talking over the bot interrupts it, as on a phone line.
      clearPlayback();
      speaking = true;
      sendEvent('speech_started');
    },
    stopSpeaking() {
      speaking = false;
      sendEvent('speech_stopped');
    },
    close
  };
}

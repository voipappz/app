// Development-only va-crystal CallEvents generator. The returned values match
// node/realtime/sessions.cr#event_record_json and must still pass through
// normalizeCableEvent before they are accepted by the app.
export interface MockCrystalCallOptions {
  callId?: string;
  direction?: "inbound" | "outbound";
  from?: string;
  to?: string;
  nowEpoch?: number;
}

export function mockCrystalCallSequence(options: MockCrystalCallOptions = {}) {
  const now = Math.floor(options.nowEpoch ?? Date.now() / 1000);
  const started = now - 65;
  const callId = options.callId || crypto.randomUUID();
  const direction = options.direction || "inbound";
  const metadata = {
    call_uuid: callId,
    channel_uuid: `mock-channel-${callId}`,
    environment_uuid: "mock-environment",
    call_type: direction,
    caller_id_number: options.from || "100",
    user_to: options.to || "200",
  };
  return [
    { type: "call", type_uuid: callId, action: "number.ringing", created_at: String(started), metadata },
    { type: "call", type_uuid: callId, action: "number.answer", created_at: String(started + 5), metadata },
    { type: "call", type_uuid: callId, action: "number.hangup", created_at: String(started + 65), metadata },
  ];
}

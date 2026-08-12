/** Deterministic NATS fixtures for local Deno tests and smoke runs. */
export function mockNatsEventSequence(nowEpoch = 1_700_000_000) {
  const callId = 'mock-nats-call-1';
  const metadata = {
    call_uuid: callId,
    environment_uuid: 'mock-environment',
    caller_id_number: '100',
    user_to: '200',
    call_type: 'inbound',
  };
  return {
    realtime: [
      { type: 'call', type_uuid: callId, action: 'number.ringing', created_at: String(nowEpoch), metadata },
      { type: 'call', type_uuid: callId, action: 'number.answer', created_at: String(nowEpoch + 5), metadata },
      { type: 'call', type_uuid: callId, action: 'number.hangup', created_at: String(nowEpoch + 65), metadata },
    ],
    cdr: [{
      call_uuid: callId,
      // Mirrors va-crystal EventSubscriber.build_cdr_payload: variable_* keys
      // have their prefix removed into data; native ESL keys stay metadata.
      data: {
        va_call_uuid: callId,
        va_environment_uuid: metadata.environment_uuid,
        va_call_type: metadata.call_type,
        caller_id_number: metadata.caller_id_number,
        user_to: metadata.user_to,
        duration: '65',
        billsec: '60',
        hangup_cause: 'NORMAL_CLEARING',
      },
      metadata: {
        'Event-Name': 'CHANNEL_HANGUP_COMPLETE',
        'Event-Date-Timestamp': String((nowEpoch + 65) * 1_000_000),
        'FreeSWITCH-Hostname': 'mock-fs-node-1',
      },
    }],
  };
}

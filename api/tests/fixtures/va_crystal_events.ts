// Fixtures mirror va-crystal/node/realtime/sessions.cr#event_record_json:
// {type,type_uuid,action,created_at,user_uuid?,metadata{...string values...}}.
const baseMetadata = {
  call_uuid: "call-local-1",
  channel_uuid: "channel-local-1",
  environment_uuid: "environment-local-1",
  call_type: "inbound",
  caller_id_number: "100",
  user_to: "200",
};

export const VA_CRYSTAL_CALL_SEQUENCE = [
  {
    type: "call",
    type_uuid: "call-local-1",
    action: "number.ringing",
    created_at: "1700000000",
    user_uuid: "user-local-1",
    metadata: { ...baseMetadata },
  },
  {
    type: "call",
    type_uuid: "call-local-1",
    action: "number.answer",
    created_at: "1700000005",
    user_uuid: "user-local-1",
    metadata: { ...baseMetadata },
  },
  {
    type: "call",
    type_uuid: "call-local-1",
    action: "number.hangup",
    created_at: "1700000065",
    user_uuid: "user-local-1",
    metadata: { ...baseMetadata },
  },
];

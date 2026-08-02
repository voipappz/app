import { assertEquals } from "@std/assert";
import { normalizeCableEvent } from "../cable.ts";
import { mockCrystalCallSequence } from "../mock_crystal_events.ts";

Deno.test("Crystal mock emits the real ringing-answer-hangup JSON-text contract", () => {
  const raw = mockCrystalCallSequence({
    callId: "mock-call-1",
    direction: "outbound",
    from: "101",
    to: "202",
    nowEpoch: 1_700_000_065,
  });
  assertEquals(raw.map((event) => event.action), ["number.ringing", "number.answer", "number.hangup"]);
  assertEquals(raw.map((event) => event.created_at), ["1700000000", "1700000005", "1700000065"]);

  const normalized = raw.map((event) => normalizeCableEvent(JSON.stringify(event)));
  assertEquals(normalized.map((event) => event?.wsType), ["call.ringing", "call.answered", "call.completed"]);
  assertEquals(normalized.every((event) => event?.wsPayload.call_id === "mock-call-1"), true);
  assertEquals(normalized[0]?.wsPayload.direction, "outbound");
});

// Tests for the ActionCable client (api/cable.ts): JWT minting, the cable→
// canonical event normalizer, and the WS handshake/ingest — all with a fake
// socket and no network.
import { assertEquals, assert } from "@std/assert";
import {
  mintCableToken, normalizeCableEvent, createCableClient,
  type WebSocketLike, type Normalized,
} from "../cable.ts";

function b64urlToStr(s: string): string {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}

Deno.test("mintCableToken — HS256 JWT with account_uuid, signature is secret-bound", async () => {
  const secret = "shhh-secret";
  const token = await mintCableToken(secret, "acct-123");
  const [h, p, sig] = token.split(".");
  assertEquals(token.split(".").length, 3);
  assertEquals(JSON.parse(b64urlToStr(h)).alg, "HS256");
  assertEquals(JSON.parse(b64urlToStr(p)).account_uuid, "acct-123");

  // HMAC is deterministic: same secret+claims → identical token (lets a backend
  // mint a stable long-lived token). A different secret yields a different sig,
  // so cable's constant-time signature check would reject a forged token.
  assertEquals(await mintCableToken(secret, "acct-123"), token);
  const forged = await mintCableToken("wrong-secret", "acct-123");
  assert(forged.split(".")[2] !== sig, "signature must depend on the secret");
});

Deno.test("normalizeCableEvent — number.* maps to call.* with metadata", () => {
  const n = normalizeCableEvent({
    type: "call", type_uuid: "C1", action: "number.answer", created_at: "1700000000",
    user_uuid: "U1", metadata: { caller_id_number: "100", user_to: "200", call_type: "inbound", call_uuid: "C1" },
  });
  assert(n);
  assertEquals(n!.wsType, "call.answered");
  assertEquals(n!.wsPayload.call_id, "C1");
  assertEquals(n!.wsPayload.from, "100");
  assertEquals(n!.wsPayload.to, "200");
  assertEquals(n!.wsPayload.state, "answered");
  assertEquals(n!.occurredAtIso, new Date(1700000000 * 1000).toISOString());
});

Deno.test("normalizeCableEvent — ringing/hangup verbs", () => {
  assertEquals(normalizeCableEvent({ action: "number.ringing", type_uuid: "C" })!.wsType, "call.ringing");
  assertEquals(normalizeCableEvent({ action: "number.hangup", type_uuid: "C" })!.wsType, "call.completed");
});

Deno.test("normalizeCableEvent — user.*/queue.* pass through, garbage dropped", () => {
  assertEquals(normalizeCableEvent({ action: "user.answer", type_uuid: "C" })!.wsType, "user.answer");
  assertEquals(normalizeCableEvent({ action: "queue.start", type_uuid: "C" })!.wsType, "queue.start");
  assertEquals(normalizeCableEvent(null), null);
  assertEquals(normalizeCableEvent({ type: "call" }), null); // no action
});

// Fake WebSocket capturing sent frames and exposing emit() to drive the client.
class FakeSocket implements WebSocketLike {
  sent: string[] = [];
  handlers: Record<string, (ev: any) => void> = {};
  closed = false;
  addEventListener(type: string, cb: (ev: any) => void) { this.handlers[type] = cb; }
  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; this.handlers["close"]?.({}); }
  emit(type: string, data?: unknown) { this.handlers[type]?.({ data }); }
}

Deno.test("createCableClient — welcome→subscribe, confirm→ready, data→onEvent, reject/stop", async () => {
  let sock!: FakeSocket;
  const events: Normalized[] = [];
  const client = createCableClient({
    url: "ws://x/cable", token: "tok", channel: "CallEvents",
    onEvent: (n) => { events.push(n); },
    socketFactory: () => (sock = new FakeSocket()),
  });

  // welcome → client subscribes with the right identifier
  sock.emit("message", JSON.stringify({ type: "welcome" }));
  const subCmd = JSON.parse(sock.sent[0]);
  assertEquals(subCmd.command, "subscribe");
  assertEquals(JSON.parse(subCmd.identifier).channel, "CallEvents");

  // confirm_subscription → ready
  sock.emit("message", JSON.stringify({ type: "confirm_subscription" }));
  assert(client.ready());

  // data frame → normalized event delivered to onEvent
  sock.emit("message", JSON.stringify({
    identifier: subCmd.identifier,
    message: { type: "call", type_uuid: "C9", action: "number.hangup", created_at: "1700000000", metadata: { caller_id_number: "555" } },
  }));
  await Promise.resolve();
  assertEquals(events.length, 1);
  assertEquals(events[0].wsType, "call.completed");
  assertEquals(events[0].wsPayload.call_id, "C9");

  // ping is ignored (no throw, no event)
  sock.emit("message", JSON.stringify({ type: "ping", message: 123 }));
  assertEquals(events.length, 1);

  // stop() closes and clears ready
  client.stop();
  assert(sock.closed);
  assert(!client.ready());
});

Deno.test("createCableClient — reject_subscription leaves it not ready", () => {
  let sock!: FakeSocket;
  const client = createCableClient({
    url: "ws://x/cable", token: "tok",
    onEvent: () => {},
    socketFactory: () => (sock = new FakeSocket()),
  });
  sock.emit("message", JSON.stringify({ type: "welcome" }));
  sock.emit("message", JSON.stringify({ type: "reject_subscription" }));
  assert(!client.ready());
  client.stop();
});

Deno.test("normalizeCableEvent — transcribe.done maps to transcription.completed", () => {
  const n = normalizeCableEvent({
    type: "call", type_uuid: "c-1", action: "transcribe.done", created_at: "1750000000",
    metadata: {
      call_uuid: "c-1", language: "he-IL", transcript: "שלום, התקשרתי לגבי החשבונית",
      ai: JSON.stringify({ summary: "בירור חשבונית", segments: [{ speaker: "A", text: "שלום" }] }),
    },
  });
  assert(n);
  assertEquals(n!.wsType, "transcription.completed");
  assertEquals(n!.wsPayload.call_id, "c-1");
  assertEquals(n!.wsPayload.language, "he-IL");
  assertEquals(n!.wsPayload.text, "שלום, התקשרתי לגבי החשבונית");
  assertEquals((n!.wsPayload.segments as unknown[]).length, 1);
  assertEquals(n!.wsPayload.summary, "בירור חשבונית");
});

Deno.test("normalizeCableEvent — transcribe.done without ai falls back to raw-text segment", () => {
  const n = normalizeCableEvent({
    type: "call", type_uuid: "c-2", action: "transcribe.done",
    metadata: { transcript: "טקסט גולמי", language: "he-IL" },
  });
  assertEquals(n!.wsType, "transcription.completed");
  assertEquals((n!.wsPayload.segments as { text: string }[])[0].text, "טקסט גולמי");
});

Deno.test("normalizeCableEvent — transcribe.error maps to transcription.failed", () => {
  const n = normalizeCableEvent({
    type: "call", type_uuid: "c-3", action: "transcribe.error", metadata: { error: "stt 401" },
  });
  assertEquals(n!.wsType, "transcription.failed");
  assertEquals(n!.wsPayload.error, "stt 401");
});

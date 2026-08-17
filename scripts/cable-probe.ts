// Probe the va-crystal cable with a REAL session, and say exactly which stage
// refuses us. Run it via `make cable-probe AUTH='<localStorage.auth>'`.
//
// The node authorizes the CONNECTION from `?token=` before any channel exists
// (va-crystal node/realtime/app.cr:83-110), so the three outcomes are distinct
// and mean different things:
//
//   no welcome, then close   -> the TOKEN was refused. Nothing app-side fixes it.
//   welcome, reject_subscription -> token fine, the channel params are wrong.
//   welcome, confirm_subscription -> we are in; state frames print as they arrive.
//
// Deno only — no host node/npm needed, and no dependency on the app being built.

const CABLE_URL = Deno.env.get("CABLE_URL") || "ws://switch.voipappz.io:4000/cable";
const SECONDS = Number(Deno.env.get("SECONDS") || 30);

// The whole `localStorage.auth` blob is the easiest thing to copy out of
// devtools, so accept that and pick the two fields out of it. TOKEN/ID stay
// available for a token that did not come from a browser session.
function credentials(): { token: string; id: string } {
  const token = (Deno.env.get("TOKEN") || "").trim();
  const id = (Deno.env.get("ID") || "").trim();
  if (token && id) return { token, id };

  const auth = (Deno.env.get("AUTH") || "").trim();
  if (!auth) {
    console.error("Need a session. Either:");
    console.error("  make cable-probe AUTH='<paste localStorage.auth here>'");
    console.error("  make cable-probe TOKEN=<jwt> ID=<user_uuid>");
    Deno.exit(2);
  }
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(auth);
  } catch {
    console.error("AUTH is not JSON. Copy the whole value of localStorage.auth, quoted:");
    console.error(`  make cable-probe AUTH='{"access":"…","user_uuid":"…"}'`);
    Deno.exit(2);
  }
  const resolved = { token: token || parsed.access, id: id || parsed.user_uuid };
  if (!resolved.token || !resolved.id) {
    console.error(`AUTH is missing ${!resolved.token ? "access" : "user_uuid"} — is the session complete?`);
    Deno.exit(2);
  }
  return resolved;
}

const { token, id } = credentials();
const identifier = JSON.stringify({ channel: "StateChannel", scope: "user", id });

// Tokens are credentials — print only enough to tell two of them apart, and
// enough shape to spot the "opaque, not a JWT" case that cannot verify.
const segments = token.split(".").length;
console.log(`cable    ${CABLE_URL}`);
console.log(`user     ${id}`);
console.log(`token    ${token.slice(0, 8)}…${token.slice(-4)} (${token.length} chars, ${segments} dot-segments${segments === 3 ? " — looks like a JWT" : " — NOT a JWT, the node cannot decode this"})`);
console.log(`listening ${SECONDS}s\n`);

const t0 = Date.now();
const ms = () => String(Date.now() - t0).padStart(6);
let welcomed = false, confirmed = false, frames = 0;

const ws = new WebSocket(`${CABLE_URL}?token=${encodeURIComponent(token)}`, "actioncable-v1-json");

ws.addEventListener("open", () => console.log(`${ms()}  ws open`));
ws.addEventListener("error", () => console.log(`${ms()}  ws error`));

ws.addEventListener("message", (ev) => {
  const raw = String(ev.data);
  let frame: Record<string, unknown>;
  try { frame = JSON.parse(raw); } catch { console.log(`${ms()}  unparsed ${raw.slice(0, 200)}`); return; }

  if (frame.type === "ping") return;                    // keepalive, per CABLE_SPEC §1
  if (frame.type === "welcome") {
    welcomed = true;
    console.log(`${ms()}  welcome → subscribe ${identifier}`);
    ws.send(JSON.stringify({ command: "subscribe", identifier }));
    return;
  }
  if (frame.type === "confirm_subscription") { confirmed = true; console.log(`${ms()}  confirm_subscription`); return; }
  if (frame.type === "reject_subscription") { console.log(`${ms()}  reject_subscription`); return; }
  if (frame.type) { console.log(`${ms()}  ${frame.type}`); return; }

  // Data frame: no `type`, carries { identifier, message } (CABLE_SPEC §3).
  frames++;
  console.log(`${ms()}  STATE #${frames} ${JSON.stringify(frame.message).slice(0, 800)}`);
});

ws.addEventListener("close", (ev) => {
  console.log(`${ms()}  close code=${ev.code} reason=${JSON.stringify(ev.reason)}`);
  console.log(`\nwelcome=${welcomed} subscribed=${confirmed} state_frames=${frames}`);
  if (!welcomed) {
    console.log("\n>> TOKEN REFUSED — closed before the welcome frame.");
    console.log("   The node verifies ?token= against its SECRET_KEY before any channel exists,");
    console.log("   so scope/id never got a look. Either this token is not a JWT the node can");
    console.log("   decode, or the node's SECRET_KEY is not the mothership's issuer secret.");
  } else if (!confirmed) {
    console.log("\n>> SUBSCRIPTION REFUSED — the connection was fine, the channel params were not.");
    console.log(`   Sent: ${identifier}`);
  } else if (frames === 0) {
    console.log("\n>> SUBSCRIBED, but this user produced no state changes while listening.");
    console.log("   Place or receive a call on that extension and run it again.");
  } else {
    console.log("\n>> WORKING end to end.");
  }
  Deno.exit(welcomed && confirmed ? 0 : 1);
});

setTimeout(() => { try { ws.close(); } catch { /* already gone */ } }, SECONDS * 1000);

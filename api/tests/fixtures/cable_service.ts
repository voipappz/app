import { mockCrystalCallSequence } from '../../mock_crystal_events.ts';

const port = Number.parseInt(Deno.env.get('CABLE_FIXTURE_PORT') || '14223', 10);
const expectedToken = Deno.env.get('CABLE_FIXTURE_TOKEN') || 'ci-cable-token';
const readyFile = Deno.env.get('CABLE_FIXTURE_READY_FILE') || '';
const callId = Deno.env.get('CABLE_FIXTURE_CALL_ID') || 'ci-cable-call';
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const events = mockCrystalCallSequence({
  callId,
  direction: 'inbound',
  from: '100',
  to: '200',
});

const server = Deno.serve({
  hostname: '127.0.0.1',
  port,
  onListen: () => console.log(`ActionCable fixture ready on ws://127.0.0.1:${port}/cable`),
}, (request) => {
  const url = new URL(request.url);
  if (url.pathname !== '/cable') return new Response('not found', { status: 404 });
  if (url.searchParams.get('token') !== expectedToken) {
    return new Response('unauthorized', { status: 401 });
  }
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('websocket required', { status: 426 });
  }

  const { socket, response } = Deno.upgradeWebSocket(request, { protocol: 'actioncable-v1-json' });
  let published = false;

  socket.onopen = () => socket.send(JSON.stringify({ type: 'welcome' }));
  socket.onmessage = async ({ data }) => {
    if (published || typeof data !== 'string') return;
    let command: { command?: string; identifier?: string };
    try {
      command = JSON.parse(data);
    } catch {
      return;
    }
    if (command.command !== 'subscribe' || !command.identifier) return;

    let identifier: { channel?: string };
    try {
      identifier = JSON.parse(command.identifier);
    } catch {
      socket.send(JSON.stringify({ type: 'reject_subscription', identifier: command.identifier }));
      return;
    }
    if (identifier.channel !== 'CallEvents') {
      socket.send(JSON.stringify({ type: 'reject_subscription', identifier: command.identifier }));
      return;
    }

    published = true;
    socket.send(JSON.stringify({ type: 'confirm_subscription', identifier: command.identifier }));
    for (const event of events) {
      await delay(100);
      socket.send(JSON.stringify({
        identifier: command.identifier,
        // va-crystal broadcasts event_record_json, so ActionCable carries JSON text.
        message: JSON.stringify(event),
      }));
    }
    console.log(`ActionCable fixture published ${events.length} events for ${callId}`);
  };

  return response;
});

if (readyFile) await Deno.writeTextFile(readyFile, 'ready\n');
await server.finished;

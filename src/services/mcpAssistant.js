import { config } from '../config';

/**
 * Asking the shared console's MCP assistant a question, in one call.
 *
 * This is used by the shared ⌘K command palette. It deliberately stays a
 * service so no portal-only UI owns the MCP question flow.
 *
 * NO LLM RUNS. A question is matched to a small, deterministic set of
 * read-only MCP tools, and the answer is composed from what the tool returns.
 * That is worth knowing before writing a prompt into the box: "how many calls
 * today" is understood, "why did Dana hang up" is not.
 */
const rpc = async (token, method, params = {}) => {
  const response = await fetch(`${config.apiBaseUrl}/api/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `${method}-${Date.now()}`, method, params }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(body.error?.message || 'The MCP server did not accept this request.');
  return body.result;
};

export const intentFor = (question) => {
  const text = question.toLowerCase();
  if (/abandon|abandod/.test(text)) return { tool: 'calls.summary', answer: 'abandoned' };
  if (text.includes('live call') || text.includes('active call')) return { tool: 'calls.live' };
  if (text.includes('call') && (text.includes('today') || /how many|count|total/.test(text))) {
    return { tool: 'calls.summary', answer: 'total' };
  }
  if (text.includes('call') && /recent|history|last/.test(text)) {
    return { tool: 'calls.history', arguments: { minutes: '1440', limit: '10' } };
  }
  if (/device|extension|phone/.test(text)) return { tool: 'devices.list' };
  if (/log|error|failure|failed/.test(text)) {
    const errorsOnly = /error|failure|failed/.test(text);
    return { tool: 'logs.search', arguments: { minutes: '1440', limit: '20', ...(errorsOnly ? { severity: 'err' } : {}) } };
  }
  return null;
};

const plural = (count, singular, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

export const formatAnswer = (intent, data) => {
  if (intent.tool === 'calls.summary') {
    const total = data.total || 0;
    const abandoned = data.abandoned || 0;
    if (intent.answer === 'abandoned') {
      return abandoned > 0
        ? `Yes. You have ${plural(abandoned, 'abandoned call')} today, out of ${plural(total, 'call')} in total.`
        : `No. You have no abandoned calls today. You have ${plural(total, 'call')} in total.`;
    }
    return `You had ${plural(total, 'call')} today: ${data.answered || 0} answered, ${data.no_answer || 0} no answer, and ${abandoned} abandoned.`;
  }
  if (intent.tool === 'calls.history') {
    const calls = data.cdrs || [];
    return calls.length === 0 ? 'I found no recent calls in the last 24 hours.' : `I found ${plural(calls.length, 'recent call')}.`;
  }
  if (intent.tool === 'calls.live') {
    const calls = data.calls || [];
    return calls.length === 0 ? 'There are no active calls right now.' : `There are ${plural(calls.length, 'active call')} right now.`;
  }
  if (intent.tool === 'devices.list') {
    const devices = data.devices || [];
    const registered = devices.filter((device) => device.registered).length;
    return `You have ${plural(devices.length, 'device')}; ${registered} ${registered === 1 ? 'is' : 'are'} registered now.`;
  }
  if (intent.tool === 'logs.search') {
    const lines = data.lines || [];
    return lines.length === 0 ? 'I found no matching log errors.' : `I found ${plural(lines.length, 'matching log line')}.`;
  }
  return 'The request completed.';
};

/** What the portal can answer, in the words a person would use. */
export const ASSISTANT_CAN_ANSWER = 'today’s call count, abandoned or recent calls, devices, and logs';

/** One click each: the questions the assistant is known to answer. */
export const SUGGESTIONS = [
  'How many calls did I have today?',
  'Do I have abandoned calls?',
  'Show my recent calls',
  'Show errors in the logs',
];

// Tools whose raw result is worth showing under the sentence.
const DETAILED_TOOLS = new Set(['calls.history', 'logs.search']);

/**
 * The session's usable tools: initialize, then tools/list without the
 * destructive ones. Rejects when the server cannot be reached, which is the
 * one thing a chat has to say up front.
 */
export async function listMcpTools(token) {
  if (!token) throw new Error('Sign in again to use the MCP tools.');
  await rpc(token, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'VoipAppz console', version: '1' },
  });
  const response = await rpc(token, 'tools/list');
  return (response?.tools || []).filter((tool) => !tool.annotations?.destructiveHint);
}

/**
 * Ask a question. Resolves to { text } — the answer as a sentence — and never
 * rejects: a question it cannot map, a tool that fails and a network error are
 * all answers a person needs to read, not exceptions for a search box.
 */
export async function askMcpAssistant(token, question) {
  const trimmed = String(question || '').trim();
  if (!trimmed) return { text: '' };
  if (!token) return { text: 'Sign in again to ask about your calls.' };

  const intent = intentFor(trimmed);
  if (!intent) return { text: `I can answer about ${ASSISTANT_CAN_ANSWER}.` };

  try {
    const response = await rpc(token, 'tools/call', { name: intent.tool, arguments: intent.arguments || {} });
    if (response.isError) return { text: response.content?.[0]?.text || 'The tool could not complete the request.' };
    const data = response.structuredContent || {};
    return { text: formatAnswer(intent, data), details: DETAILED_TOOLS.has(intent.tool) ? data : null };
  } catch (error) {
    return { text: error.message || 'The tool could not complete the request.' };
  }
}

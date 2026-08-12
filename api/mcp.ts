// Stateless MCP Streamable HTTP surface over the local DuckDB projection.
// This module is deliberately read-only: it receives an EventStore-shaped
// reader and has no access to Cable, NATS, the mothership, or write methods.
import type {
  DashboardSnapshot,
  EventListQuery,
  EventStoreStats,
  StoredEventPage,
} from "./event_store.ts";

const LATEST_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  LATEST_PROTOCOL_VERSION,
]);

const RESPONSE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface DuckDbMcpReader {
  page(query?: EventListQuery): Promise<StoredEventPage>;
  dashboardSnapshot(
    fromEpoch: number,
    toEpoch: number,
    recentLimit?: number,
  ): Promise<DashboardSnapshot>;
  stats(): Promise<EventStoreStats>;
}

export interface DuckDbMcpOptions {
  authToken: string;
  serverVersion?: string;
}

export interface DuckDbMcpRequestContext {
  allowUnauthenticated?: boolean;
}

const tools = [
  {
    name: "duckdb_events_search",
    description:
      "Search the raw events persisted in the portal's local DuckDB. Returns normalized fields and the untouched raw_payload.",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "Text search across IDs, types, actions, payload, and raw payload.",
        },
        event_type: {
          type: "string",
          description: "Exact normalized event type, for example call.cdr.",
        },
        action: {
          type: "string",
          description: "Exact producer action, for example number.hangup.",
        },
        call_id: { type: "string", description: "Exact call UUID." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "duckdb_call_timeline",
    description:
      "Read one call's DuckDB event timeline in chronological order, including untouched raw events.",
    inputSchema: {
      type: "object",
      properties: {
        call_id: { type: "string", description: "Exact call UUID." },
        limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
      },
      required: ["call_id"],
      additionalProperties: false,
    },
  },
  {
    name: "duckdb_dashboard_snapshot",
    description:
      "Compute call KPIs, hourly buckets, and recent calls from DuckDB only.",
    inputSchema: {
      type: "object",
      properties: {
        from_epoch: {
          type: "integer",
          minimum: 0,
          description:
            "Inclusive start time as Unix seconds; defaults to 24 hours before to_epoch.",
        },
        to_epoch: {
          type: "integer",
          minimum: 0,
          description: "Inclusive end time as Unix seconds; defaults to now.",
        },
        recent_limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "duckdb_event_store_stats",
    description:
      "Report DuckDB event count, retention, and last received timestamp.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
] as const;

const schemaText = `DuckDB table: events
- event_id VARCHAR PRIMARY KEY: producer ID or stable hash used for idempotency
- call_id VARCHAR: normalized call UUID when present
- event_type VARCHAR: normalized type such as call.ringing, call.answered, call.completed, or call.cdr
- action VARCHAR: original producer action
- occurred_at TIMESTAMP / occurred_at_epoch BIGINT: producer event time
- payload JSON: normalized projection used by the Dashboard
- raw_payload JSON: untouched object received from Cable or Core NATS
- received_at TIMESTAMP: local persistence time

The store is append-only for events. MCP exposes read tools only and never queries the mothership.`;

function rpcResult(id: JsonRpcId, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: RESPONSE_HEADERS,
  });
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  status = 200,
): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    {
      status,
      headers: RESPONSE_HEADERS,
    },
  );
}

function toolResult(value: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function toolFailure(message: string) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function objectParams(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("arguments must be an object");
  }
  return value as Record<string, unknown>;
}

function stringArg(
  args: Record<string, unknown>,
  name: string,
  required = false,
): string | undefined {
  const value = args[name];
  if (value == null || value === "") {
    if (required) throw new Error(`${name} is required`);
    return undefined;
  }
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const trimmed = value.trim();
  if (!trimmed && required) throw new Error(`${name} is required`);
  if (trimmed.length > 200) {
    throw new Error(`${name} must be 200 characters or fewer`);
  }
  return trimmed || undefined;
}

function integerArg(
  args: Record<string, unknown>,
  name: string,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const value = args[name] ?? fallback;
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) ||
    value < minimum || value > maximum
  ) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

async function callTool(
  reader: DuckDbMcpReader,
  params: unknown,
): Promise<unknown> {
  try {
    const outer = objectParams(params);
    const name = stringArg(outer, "name", true)!;
    const args = objectParams(outer.arguments);
    if (name === "duckdb_events_search") {
      const limit = integerArg(args, "limit", 25, 1, 100);
      const offset = integerArg(args, "offset", 0, 0);
      const query = {
        q: stringArg(args, "q"),
        eventType: stringArg(args, "event_type"),
        action: stringArg(args, "action"),
        callId: stringArg(args, "call_id"),
        limit,
        offset,
      };
      const page = await reader.page(query);
      return toolResult({ ...page, limit, offset, source: "duckdb" });
    }

    if (name === "duckdb_call_timeline") {
      const callId = stringArg(args, "call_id", true)!;
      const limit = integerArg(args, "limit", 100, 1, 1000);
      const page = await reader.page({ callId, limit, offset: 0 });
      return toolResult({
        call_id: callId,
        events: [...page.events].reverse(),
        returned: page.events.length,
        total: page.total,
        order: "oldest_first",
        source: "duckdb",
      });
    }

    if (name === "duckdb_dashboard_snapshot") {
      const now = Math.floor(Date.now() / 1000);
      const to = integerArg(args, "to_epoch", now, 0);
      const from = integerArg(args, "from_epoch", Math.max(0, to - 86400), 0);
      const recentLimit = integerArg(args, "recent_limit", 10, 1, 50);
      if (from > to) {
        throw new Error("from_epoch must be less than or equal to to_epoch");
      }
      return toolResult({
        ...await reader.dashboardSnapshot(from, to, recentLimit),
        from_epoch: from,
        to_epoch: to,
        source: "duckdb",
      });
    }

    if (name === "duckdb_event_store_stats") {
      return toolResult({ ...await reader.stats(), source: "duckdb" });
    }

    throw new Error(`unknown tool: ${name}`);
  } catch (error) {
    return toolFailure(
      error instanceof Error ? error.message : "DuckDB query failed",
    );
  }
}

/** Build the opt-in, token-protected MCP endpoint used by the Deno server. */
export function createDuckDbMcpHandler(
  reader: DuckDbMcpReader,
  options: DuckDbMcpOptions,
) {
  return async (
    request: Request,
    context: DuckDbMcpRequestContext = {},
  ): Promise<Response> => {
    if (!options.authToken && !context.allowUnauthenticated) {
      return new Response(
        JSON.stringify({ error: "MCP auth token not configured" }),
        {
          status: 503,
          headers: RESPONSE_HEADERS,
        },
      );
    }
    if (!sameOrigin(request)) {
      return new Response(JSON.stringify({ error: "Forbidden origin" }), {
        status: 403,
        headers: RESPONSE_HEADERS,
      });
    }
    if (options.authToken && !context.allowUnauthenticated &&
      request.headers.get("authorization") !== `Bearer ${options.authToken}`
    ) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...RESPONSE_HEADERS, "WWW-Authenticate": "Bearer" },
      });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...RESPONSE_HEADERS, Allow: "POST" },
      });
    }

    let message: unknown;
    try {
      message = await request.json();
    } catch {
      return rpcError(null, -32700, "Parse error", 400);
    }
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return rpcError(null, -32600, "Invalid Request", 400);
    }
    const rpc = message as Partial<JsonRpcRequest>;
    const id = rpc.id ?? null;
    if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
      return rpcError(id, -32600, "Invalid Request", 400);
    }

    // MCP notifications intentionally have no JSON-RPC response body.
    if (rpc.id === undefined) {
      return new Response(null, {
        status: 202,
        headers: { "Cache-Control": "no-store" },
      });
    }

    try {
      if (rpc.method === "initialize") {
        const params = objectParams(rpc.params);
        const requested = typeof params.protocolVersion === "string"
          ? params.protocolVersion
          : "";
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested)
          ? requested
          : LATEST_PROTOCOL_VERSION;
        return rpcResult(id, {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
          },
          serverInfo: {
            name: "voipappz-duckdb",
            version: options.serverVersion ?? "1.0.0",
          },
          instructions:
            "Read-only access to locally consumed DuckDB events. Use duckdb_call_timeline before building event-driven customizations.",
        });
      }
      if (rpc.method === "ping") return rpcResult(id, {});
      if (rpc.method === "tools/list") return rpcResult(id, { tools });
      if (rpc.method === "tools/call") {
        return rpcResult(id, await callTool(reader, rpc.params));
      }
      if (rpc.method === "resources/list") {
        return rpcResult(id, {
          resources: [
            {
              uri: "duckdb://events/schema",
              name: "DuckDB event schema",
              description: "Stored event columns and data ownership rules.",
              mimeType: "text/plain",
            },
            {
              uri: "duckdb://events/stats",
              name: "DuckDB event store stats",
              description: "Current row count and last persisted event time.",
              mimeType: "application/json",
            },
          ],
        });
      }
      if (rpc.method === "resources/templates/list") {
        return rpcResult(id, { resourceTemplates: [] });
      }
      if (rpc.method === "resources/read") {
        const params = objectParams(rpc.params);
        if (params.uri === "duckdb://events/schema") {
          return rpcResult(id, {
            contents: [{
              uri: params.uri,
              mimeType: "text/plain",
              text: schemaText,
            }],
          });
        }
        if (params.uri === "duckdb://events/stats") {
          return rpcResult(id, {
            contents: [{
              uri: params.uri,
              mimeType: "application/json",
              text: JSON.stringify(
                { ...await reader.stats(), source: "duckdb" },
                null,
                2,
              ),
            }],
          });
        }
        return rpcError(id, -32602, "Unknown resource URI");
      }
      return rpcError(id, -32601, "Method not found");
    } catch (error) {
      return rpcError(
        id,
        -32602,
        error instanceof Error ? error.message : "Invalid params",
      );
    }
  };
}

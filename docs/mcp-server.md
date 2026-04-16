# MCP Server for Detection Data

This document explains the MCP (Model Context Protocol) server that exposes detection data stored in InfluxDB to AI assistants such as Claude Code and gemini-cli.

## What is MCP?

The Model Context Protocol is an open standard that lets AI assistants talk to external systems through a uniform interface. An MCP server exposes three primitives:

| Primitive | Initiated by | Purpose |
|---|---|---|
| **Tools** | The model | Perform actions or fetch dynamic data on demand |
| **Resources** | The client / user | Expose read-only context the model can reference |
| **Prompts** | The user | Reusable prompt templates with arguments |

This server only implements **tools** — they are the right primitive for "let the AI query my time-series database in response to questions." Resources and prompts can be added later (the wiring points are stubbed in `mcp/src/index.ts`).

## Why a separate container?

The MCP server runs as its own process in `compose.yml`, not bolted into the existing Express server. Two reasons:

1. **Transport requires it.** MCP is process-oriented. Local clients use stdio (the client spawns the server as a child process); remote clients use Streamable HTTP. Either way the server is a separate process.
2. **Independent deployment.** The MCP server reads from InfluxDB but has no relationship to the detection ingest server. Splitting them keeps responsibilities clean and lets either evolve without coupling.

The server uses **Streamable HTTP transport** so any MCP client on the host can connect over `http://localhost:3002/mcp` — including Claude Code, gemini-cli, or a custom client built with the SDK.

## Architecture

```
Claude Code                 gemini-cli
   |                            |
   |   POST /mcp (JSON-RPC)     |
   +------------+---------------+
                |
                v
        MCP Server (:3002)
                |
                | @influxdata/influxdb-client (read-only QueryApi)
                v
        InfluxDB 2.x (:8086)
```

The MCP container shares the same internal Docker network as `server`, `influxdb`, and `grafana` — it talks to InfluxDB via `http://influxdb:8086` (the same DNS name the ingest server uses).

## Tools

All three tools wrap Flux queries against the schema documented in [tsdb-and-grafana.md](./tsdb-and-grafana.md#data-model).

### `list_detected_classes`

Returns the distinct object classes detected in a window, with total counts.

**Inputs:**
- `hoursBack` — `int`, 1-720, default 24

**Example response:**
```json
[
  { "class": "person", "totalCount": 623 },
  { "class": "cell phone", "totalCount": 7 }
]
```

### `recent_detection_counts`

Returns time-bucketed counts for one class (or all classes if `className` is omitted). Useful for spotting trends.

**Inputs:**
- `className` — `string`, optional (e.g. `"person"`)
- `hoursBack` — `int`, 1-168, default 1
- `bucketMinutes` — `int`, 1-60, default 5

### `detection_summary`

High-level summary: total frames processed plus the top-N classes by count, each with an averaged confidence score.

**Inputs:**
- `hoursBack` — `int`, 1-168, default 24
- `topN` — `int`, 1-50, default 10

## File Layout

```
mcp/
  Dockerfile        # Bun runtime, EXPOSE 3002
  package.json      # @modelcontextprotocol/sdk, zod, express, influxdb-client
  tsconfig.json     # Mirror of server/tsconfig.json (Node16, strict)
  src/
    index.ts        # Express + Streamable HTTP transport, session mgmt
    tools.ts        # The three tools above
    influx.ts       # Read-only InfluxDB QueryApi + queryRows() helper
```

The structure intentionally mirrors `server/` so the two services are easy to compare side-by-side.

## Running It

The MCP service is part of the main Compose stack:

```bash
docker compose up --build
```

Look for the log line:

```
MCP server listening on http://localhost:3002/mcp
```

To run only the MCP container:

```bash
docker compose up --build mcp
```

## Connecting Clients

### Claude Code

A project-level config already exists at the repo root:

```json
// .mcp.json
{
  "mcpServers": {
    "detection": {
      "type": "http",
      "url": "http://localhost:3002/mcp"
    }
  }
}
```

Restart Claude Code in this directory and run `/mcp` to verify the `detection` server appears with three tools.

### gemini-cli

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "detection": {
      "httpUrl": "http://localhost:3002/mcp"
    }
  }
}
```

Note the dialect difference — Claude Code uses `type` + `url`; gemini-cli uses `httpUrl`. Same server, different config keys.

Verify with:

```bash
gemini
# inside the REPL
/mcp list
```

## Smoke Testing with curl

Streamable HTTP requires both `Content-Type: application/json` and `Accept: application/json, text/event-stream` on every request.

**1. Initialize and capture the session id:**

```bash
curl -i -X POST http://localhost:3002/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": { "name": "curl", "version": "0" }
    }
  }'
```

The response headers include `mcp-session-id: <uuid>`. Capture it.

**2. List the available tools:**

```bash
SID="<paste session id>"
curl -s -X POST http://localhost:3002/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

**3. Call a tool:**

```bash
curl -s -X POST http://localhost:3002/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
       "params":{"name":"list_detected_classes","arguments":{"hoursBack":24}}}'
```

If the client app has been writing data, you will see a JSON array of `{class, totalCount}` objects. Otherwise the result will be `[]` — open `http://localhost:8080`, grant camera access, and let detections accumulate for 30 seconds.

## Useful Prompts

Once connected via Claude Code or gemini-cli, ask things like:

- *"What objects has my camera detected in the last 24 hours?"*
- *"Plot the count of `person` detections every 5 minutes for the last hour."*
- *"Compare the last hour to the previous hour — anything unusual?"*
- *"Give me a high-level summary of what was seen today, with confidence scores."*

The model picks the right tool(s) based on the question and chains calls together.

## Limitations (Intentionally)

This is a learning-focused implementation. The following are not implemented:

- **Authentication.** No bearer tokens, no OAuth. Do not expose port 3002 outside `localhost` without adding auth.
- **Rate limiting.** The Zod `.max()` bounds on tool inputs are the only guard against expensive queries.
- **Resources and prompts.** Stubs are commented in `mcp/src/index.ts:34-35` if you want to add them later.
- **Streaming responses.** All tool responses return as a single JSON blob; SSE streaming is unused.
- **Observability.** Plain `console.log` only — no structured logs, metrics, or traces.

## Default Credentials

| Service | Detail |
|---|---|
| MCP server | No auth — bound to `localhost:3002` |
| InfluxDB connection | Same env vars as the ingest server (`INFLUXDB_URL`, `INFLUXDB_TOKEN`, `INFLUXDB_ORG`, `INFLUXDB_BUCKET`) |

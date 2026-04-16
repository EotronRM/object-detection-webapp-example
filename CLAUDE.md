# Object Detection Web App

Real-time object detection running entirely in the browser using YOLOv26n. The model runs client-side via ONNX Runtime (WebGPU with WASM fallback) through `@huggingface/transformers`.

## Project Structure

- `client/` — React + TypeScript + Vite web app (Bun as package manager)
- `server/` — Express.js API server (Bun runtime), receives detection summaries and writes to InfluxDB
- `mcp/` — MCP (Model Context Protocol) server (Bun + Express), exposes detection data from InfluxDB to AI assistants over Streamable HTTP at `:3002/mcp`
- `grafana/` — Grafana provisioning config and pre-built dashboards
- `docs/` — Architecture docs: [`tsdb-and-grafana.md`](docs/tsdb-and-grafana.md), [`mcp-server.md`](docs/mcp-server.md)

## Tech Stack

- **Runtime/Package Manager:** Bun
- **Framework:** React 19, TypeScript, Vite
- **Styling:** Tailwind CSS v4 (Vite plugin)
- **ML:** `@huggingface/transformers` with model `onnx-community/yolo26n-ONNX`
- **Inference:** WebGPU (fp16) with automatic WASM (fp32) fallback
- **TSDB:** InfluxDB 2.x (Flux query language)
- **Dashboards:** Grafana 11.x (auto-provisioned)
- **MCP:** `@modelcontextprotocol/sdk` with Streamable HTTP transport, Zod-typed tool inputs

## Commands

Client commands run from `client/`:

```bash
bun install        # Install dependencies
bun run dev        # Start dev server
bun run build      # Type-check + production build
bun run lint       # ESLint
bun run preview    # Preview production build
```

### Docker Compose (full stack)

```bash
docker compose up --build   # Start all services
```

| Service   | URL                       | Credentials          |
|-----------|---------------------------|----------------------|
| Client    | http://localhost:8080     | —                    |
| Server    | http://localhost:3001     | —                    |
| MCP       | http://localhost:3002/mcp | — (no auth, localhost only) |
| InfluxDB  | http://localhost:8086     | admin / adminpassword |
| Grafana   | http://localhost:3000     | admin / admin (or anonymous) |

## Architecture Notes

- The model is loaded once and cached via a singleton promise (`modelSession.ts`)
- Camera feed is captured via `getUserMedia`, inference runs per-frame using `requestAnimationFrame` with a non-blocking pattern (skips frames while inference is in-flight)
- Postprocessing converts raw YOLO output (logits + pred_boxes) to pixel-coordinate detections with sigmoid confidence scoring
- Vite config sets COOP/COEP headers required for `SharedArrayBuffer` (needed by ONNX WASM backend)
- `@huggingface/transformers` is excluded from Vite's `optimizeDeps` to avoid bundling issues
- The `server/` and `mcp/` services share the same InfluxDB env-var convention (`INFLUXDB_URL`, `INFLUXDB_TOKEN`, `INFLUXDB_ORG`, `INFLUXDB_BUCKET`); `server/` writes via `WriteApi`, `mcp/` reads via `QueryApi`
- MCP service is session-managed (per-client `StreamableHTTPServerTransport` keyed by `mcp-session-id` header); only tools are implemented — resource/prompt registration points are stubbed in `mcp/src/index.ts`
- Project-level `.mcp.json` at the repo root auto-registers the `detection` MCP server with Claude Code when working in this directory

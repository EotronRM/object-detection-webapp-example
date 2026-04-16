# Object Detection Web App

Real-time object detection running in the browser using YOLOv26n. The model runs client-side via ONNX Runtime (WebGPU with WASM fallback) through `@huggingface/transformers`. Detection summaries are sent to an Express server every 5 seconds.

## Architecture

- **client/** — React + TypeScript + Vite app that captures webcam video, runs YOLOv26n inference per frame, and displays bounding boxes with an FPS/stats panel
- **server/** — Express v5 + TypeScript server that receives detection summaries and writes them to InfluxDB
- **mcp/** — MCP (Model Context Protocol) server that exposes detection data from InfluxDB to AI assistants over Streamable HTTP
- **grafana/** — Provisioned Grafana dashboards for visualizing detection metrics

## Documentation

- [Time-Series Storage with InfluxDB + Grafana](docs/tsdb-and-grafana.md) — how detection data flows into InfluxDB and how Grafana visualizes it
- [MCP Server for Detection Data](docs/mcp-server.md) — connecting Claude Code or gemini-cli to query detection data conversationally

## Prerequisites

- [Bun](https://bun.sh/) (for local development)
- [Docker](https://www.docker.com/) (for containerized setup)

## Local Development

Start the server and client in separate terminals:

```bash
# Terminal 1 — server
cd server
bun install
bun run dev

# Terminal 2 — client
cd client
bun install
bun run dev
```

The client runs at `http://localhost:5173` and the server at `http://localhost:3001`.

## Docker Compose

```bash
docker compose up --build
```

| Service   | URL                     |
|-----------|-------------------------|
| Client    | http://localhost:8080   |
| Server    | http://localhost:3001   |
| MCP       | http://localhost:3002/mcp |
| InfluxDB  | http://localhost:8086   |
| Grafana   | http://localhost:3000   |

See [`docs/tsdb-and-grafana.md`](docs/tsdb-and-grafana.md) and [`docs/mcp-server.md`](docs/mcp-server.md) for details on the InfluxDB / Grafana setup and MCP server respectively.

## How It Works

1. The browser loads the YOLOv26n ONNX model (downloaded and cached from Hugging Face)
2. Webcam frames are processed in real-time — inference runs on WebGPU when available, falling back to WASM
3. Bounding boxes and labels are drawn on a canvas overlay
4. Every 5 seconds, an aggregated summary (object counts and average confidence per class) is POSTed to the server

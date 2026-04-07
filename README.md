# Object Detection Web App

Real-time object detection running in the browser using YOLOv26n. The model runs client-side via ONNX Runtime (WebGPU with WASM fallback) through `@huggingface/transformers`. Detection summaries are sent to an Express server every 5 seconds.

## Architecture

- **client/** — React + TypeScript + Vite app that captures webcam video, runs YOLOv26n inference per frame, and displays bounding boxes with an FPS/stats panel
- **server/** — Express v5 + TypeScript server that receives and logs aggregated detection summaries

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

The client is served at `http://localhost:8080` and the server at `http://localhost:3001`.

## How It Works

1. The browser loads the YOLOv26n ONNX model (downloaded and cached from Hugging Face)
2. Webcam frames are processed in real-time — inference runs on WebGPU when available, falling back to WASM
3. Bounding boxes and labels are drawn on a canvas overlay
4. Every 5 seconds, an aggregated summary (object counts and average confidence per class) is POSTed to the server

# Time-Series Storage with InfluxDB + Grafana

This document explains how detection data flows from the browser into InfluxDB and how Grafana visualizes it.

## Why a TSDB?

The object detection client produces a stream of detection summaries every 5 seconds: counts per class, average confidence scores, and frames processed. This data is naturally **timestamped, append-only, and metric-shaped** — a textbook fit for a time-series database.

A TSDB like InfluxDB is optimized for exactly this pattern: high-throughput writes of timestamped points, fast range queries ("last 15 minutes"), and built-in windowing/aggregation functions.

## Why InfluxDB 2.x?

| Consideration | InfluxDB 2.x | TimescaleDB (Postgres) |
|---|---|---|
| Data model fit | Tags + fields map directly to detection data | Requires schema design, hypertable setup |
| Setup complexity | Single container, auto-setup via env vars | Postgres + extension, SQL migrations |
| Query language | Flux (purpose-built for time-series) | SQL (universal but verbose for windowing) |
| Built-in UI | Yes (Data Explorer at port 8086) | No (database only) |
| Grafana integration | First-class datasource | First-class datasource |

InfluxDB was chosen because the detection data maps directly to its concepts with zero schema design, and it ships with its own UI for exploring data alongside Grafana.

## Architecture

```
Browser (React + YOLOv26n)
    |
    | POST /api/detections (every 5s)
    v
Express Server (:3001)
    |
    | @influxdata/influxdb-client
    v
InfluxDB 2.x (:8086)
    ^
    | Flux queries
    |
Grafana (:3000)
```

All four services run via `docker compose up --build`.

## Data Model

The client aggregates per-frame detections into 5-second windows (see `client/src/utils/detectionAggregator.ts`) and POSTs a summary:

```json
{
  "timestamp": "2026-04-14T12:00:00.000Z",
  "intervalMs": 5000,
  "framesProcessed": 42,
  "detections": {
    "person": { "count": 15, "avgConfidence": 0.92 },
    "car": { "count": 3, "avgConfidence": 0.85 }
  }
}
```

The server (`server/src/influx.ts`) converts this into two InfluxDB **measurements**:

### `frames` measurement

One point per 5-second interval, tracking inference throughput.

| Field | Type | Description |
|---|---|---|
| `processed` | int | Number of frames where inference ran |
| `intervalMs` | int | Aggregation window size (always 5000) |

### `detection` measurement

One point per detected class per interval.

| Tag | Description |
|---|---|
| `class` | Object class label (e.g. "person", "car") |

| Field | Type | Description |
|---|---|---|
| `count` | int | Total detections of this class in the window |
| `avgConfidence` | float | Mean confidence score (0 to 1) |

**Why two measurements?** The `frames` measurement has exactly one row per interval regardless of how many classes were detected. The `detection` measurement fans out by class. This keeps queries for each panel simple and avoids null fields.

**Why `class` is a tag, not a field?** Tags are indexed in InfluxDB, making `filter(fn: (r) => r.class == "person")` fast. Fields are not indexed but can hold numeric values. The rule of thumb: metadata you filter/group by goes in tags, numeric values you aggregate go in fields.

## Grafana Dashboard

A pre-provisioned dashboard is loaded automatically on startup with three panels:

### 1. Detection Counts per Class

Line chart showing how many times each object class was detected over time. Each class gets its own colored line. Uses `sum` aggregation within each window period.

```flux
from(bucket: "detections")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r._measurement == "detection" and r._field == "count")
  |> group(columns: ["class"])
  |> aggregateWindow(every: v.windowPeriod, fn: sum, createEmpty: false)
```

### 2. Average Confidence per Class

Line chart tracking model confidence per class over time. Y-axis is 0% to 100%. Uses `mean` aggregation. Useful for noticing when the model struggles with certain objects (e.g. confidence drops at a distance or in poor lighting).

```flux
from(bucket: "detections")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r._measurement == "detection" and r._field == "avgConfidence")
  |> group(columns: ["class"])
  |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)
```

### 3. Frames Processed per Interval

Bar chart showing how many inference frames the browser processed in each window. A drop here indicates the browser is struggling (e.g. WebGPU vs WASM fallback, or a heavy scene with many detections).

```flux
from(bucket: "detections")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r._measurement == "frames" and r._field == "processed")
  |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)
```

The dashboard auto-refreshes every 5 seconds and defaults to a 15-minute time range.

## Grafana Provisioning

Grafana is configured entirely through files mounted into the container — no manual setup needed:

```
grafana/
  provisioning/
    datasources/
      influxdb.yml      # Connects Grafana to InfluxDB (Flux mode)
    dashboards/
      dashboards.yml    # Tells Grafana where to find dashboard JSON files
  dashboards/
    object-detection.json   # The pre-built dashboard
```

Anonymous access is enabled (`GF_AUTH_ANONYMOUS_ENABLED=true`) so you can view dashboards without logging in.

## InfluxDB Key Concepts

If you're new to InfluxDB, here's how its terminology maps to this project:

| InfluxDB Term | What It Means Here |
|---|---|
| **Bucket** | `detections` — the database where all points are stored |
| **Measurement** | `detection` or `frames` — like a table name |
| **Tag** | `class` — indexed metadata for filtering/grouping |
| **Field** | `count`, `avgConfidence`, `processed` — the actual numeric values |
| **Point** | A single row: timestamp + tags + fields |
| **Flux** | InfluxDB's query language, used in Grafana panels |

## Exploring the Data

Beyond Grafana, you can explore data directly in the InfluxDB UI at `http://localhost:8086` (admin / adminpassword):

1. Go to **Data Explorer** in the left sidebar
2. Select the `detections` bucket
3. Choose a measurement (`detection` or `frames`)
4. Apply filters and see results as a table or graph

This is useful for ad-hoc queries and learning Flux syntax interactively.

## Default Credentials

| Service | Username | Password | Notes |
|---|---|---|---|
| InfluxDB | admin | adminpassword | Full admin access to the UI and API |
| Grafana | admin | admin | Or use anonymous access (Viewer role) |

These are for local development only. For any shared deployment, use a `.env` file and proper secrets management.

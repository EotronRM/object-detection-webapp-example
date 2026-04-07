import type { Detection, DetectionSummary } from '../types/detection';

const INTERVAL_MS = 5000;
const SERVER_URL = 'http://localhost:3001/api/detections';

let frames: Detection[][] = [];
let timerId: ReturnType<typeof setInterval> | null = null;

function buildSummary(): DetectionSummary {
  const classTotals = new Map<string, { count: number; totalConfidence: number }>();

  for (const frameDetections of frames) {
    for (const det of frameDetections) {
      const entry = classTotals.get(det.label);
      if (entry) {
        entry.count++;
        entry.totalConfidence += det.score;
      } else {
        classTotals.set(det.label, { count: 1, totalConfidence: det.score });
      }
    }
  }

  const detections: DetectionSummary['detections'] = {};
  for (const [label, { count, totalConfidence }] of classTotals) {
    detections[label] = { count, avgConfidence: totalConfidence / count };
  }

  return {
    timestamp: new Date().toISOString(),
    intervalMs: INTERVAL_MS,
    framesProcessed: frames.length,
    detections,
  };
}

async function flush() {
  const summary = buildSummary();
  frames = [];

  try {
    await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summary),
    });
  } catch {
    console.warn('Failed to send detection summary to server');
  }
}

export function pushDetections(detections: Detection[]) {
  frames.push(detections);
}

export function startAggregator() {
  if (timerId) return;
  frames = [];
  timerId = setInterval(flush, INTERVAL_MS);
}

export function stopAggregator() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  frames = [];
}

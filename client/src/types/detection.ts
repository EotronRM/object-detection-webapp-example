export interface Detection {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] in canvas pixel coords
  score: number;
  classId: number;
  label: string;
}

export interface DetectionSummary {
  timestamp: string;
  intervalMs: number;
  framesProcessed: number;
  detections: Record<string, { count: number; avgConfidence: number }>;
}

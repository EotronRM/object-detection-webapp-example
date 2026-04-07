import type { Detection } from '../types/detection';

export function drawDetections(
  ctx: CanvasRenderingContext2D,
  detections: Detection[],
): void {
  ctx.lineWidth = 2;
  ctx.font = '14px sans-serif';
  ctx.textBaseline = 'top';

  for (const det of detections) {
    const [x1, y1, x2, y2] = det.bbox;
    const w = x2 - x1;
    const h = y2 - y1;

    // Bounding box
    ctx.strokeStyle = '#22c55e';
    ctx.strokeRect(x1, y1, w, h);

    // Label text
    const label = `${det.label} ${Math.round(det.score * 100)}%`;
    const textMetrics = ctx.measureText(label);
    const textHeight = 18;
    const padding = 4;

    // Label background
    ctx.fillStyle = 'rgba(34, 197, 94, 0.7)';
    ctx.fillRect(
      x1,
      y1 - textHeight - padding,
      textMetrics.width + padding * 2,
      textHeight + padding,
    );

    // Label text
    ctx.fillStyle = '#000';
    ctx.fillText(label, x1 + padding, y1 - textHeight - padding + 2);
  }
}

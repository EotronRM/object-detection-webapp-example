import type { Detection } from '../types/detection';
import { COCO_LABELS } from './cocoLabels';

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function postprocess(
  logits: Float32Array,
  predBoxes: Float32Array,
  numDetections: number,
  numClasses: number,
  canvasWidth: number,
  canvasHeight: number,
  confidenceThreshold = 0.5,
): Detection[] {
  const detections: Detection[] = [];

  for (let i = 0; i < numDetections; i++) {
    // Find best class for this detection
    const logitsOffset = i * numClasses;
    let maxScore = -Infinity;
    let bestClass = 0;

    for (let c = 0; c < numClasses; c++) {
      const score = logits[logitsOffset + c];
      if (score > maxScore) {
        maxScore = score;
        bestClass = c;
      }
    }

    const confidence = sigmoid(maxScore);
    if (confidence < confidenceThreshold) continue;

    // Convert [cx, cy, w, h] normalized -> [x1, y1, x2, y2] pixel coords
    const boxOffset = i * 4;
    const cx = predBoxes[boxOffset];
    const cy = predBoxes[boxOffset + 1];
    const w = predBoxes[boxOffset + 2];
    const h = predBoxes[boxOffset + 3];

    const x1 = (cx - w / 2) * canvasWidth;
    const y1 = (cy - h / 2) * canvasHeight;
    const x2 = (cx + w / 2) * canvasWidth;
    const y2 = (cy + h / 2) * canvasHeight;

    detections.push({
      bbox: [x1, y1, x2, y2],
      score: confidence,
      classId: bestClass,
      label: COCO_LABELS[bestClass] ?? `class_${bestClass}`,
    });
  }

  // Sort by confidence descending
  detections.sort((a, b) => b.score - a.score);
  return detections;
}

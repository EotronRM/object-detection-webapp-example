import express from 'express';
import cors from 'cors';

interface ClassSummary {
  count: number;
  avgConfidence: number;
}

interface DetectionSummary {
  timestamp: string;
  intervalMs: number;
  framesProcessed: number;
  detections: Record<string, ClassSummary>;
}

const app = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.post('/api/detections', (req, res) => {
  const summary = req.body as DetectionSummary;

  console.log(`\n--- Detection Summary (${summary.timestamp}) ---`);
  console.log(`Frames processed: ${summary.framesProcessed}`);

  const entries = Object.entries(summary.detections);
  if (entries.length === 0) {
    console.log('No objects detected');
  } else {
    for (const [label, info] of entries) {
      console.log(`  ${label}: ${info.count}x (avg confidence: ${(info.avgConfidence * 100).toFixed(1)}%)`);
    }
  }

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

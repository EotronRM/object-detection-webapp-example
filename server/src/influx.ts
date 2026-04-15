import { InfluxDB, Point } from '@influxdata/influxdb-client';

const url = process.env.INFLUXDB_URL ?? 'http://localhost:8086';
const token = process.env.INFLUXDB_TOKEN ?? 'my-super-secret-token';
const org = process.env.INFLUXDB_ORG ?? 'detection-org';
const bucket = process.env.INFLUXDB_BUCKET ?? 'detections';

const client = new InfluxDB({ url, token });
const writeApi = client.getWriteApi(org, bucket, 'ms');

process.on('beforeExit', async () => {
  await writeApi.close();
});

export function writeSummary(summary: {
  timestamp: string;
  intervalMs: number;
  framesProcessed: number;
  detections: Record<string, { count: number; avgConfidence: number }>;
}): void {
  const ts = new Date(summary.timestamp);

  const framesPoint = new Point('frames')
    .timestamp(ts)
    .intField('processed', summary.framesProcessed)
    .intField('intervalMs', summary.intervalMs);
  writeApi.writePoint(framesPoint);

  for (const [label, info] of Object.entries(summary.detections)) {
    const point = new Point('detection')
      .tag('class', label)
      .timestamp(ts)
      .intField('count', info.count)
      .floatField('avgConfidence', info.avgConfidence);
    writeApi.writePoint(point);
  }

  writeApi.flush().catch((err) => {
    console.error('InfluxDB write error:', err);
  });
}

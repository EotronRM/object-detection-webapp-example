import { InfluxDB } from '@influxdata/influxdb-client';

const url = process.env.INFLUXDB_URL ?? 'http://localhost:8086';
const token = process.env.INFLUXDB_TOKEN ?? 'my-super-secret-token';
const org = process.env.INFLUXDB_ORG ?? 'detection-org';
export const bucket = process.env.INFLUXDB_BUCKET ?? 'detections';

const client = new InfluxDB({ url, token });
export const queryApi = client.getQueryApi(org);

export async function queryRows<T = Record<string, unknown>>(flux: string): Promise<T[]> {
  const rows: T[] = [];
  return new Promise((resolve, reject) => {
    queryApi.queryRows(flux, {
      next(row, tableMeta) {
        rows.push(tableMeta.toObject(row) as T);
      },
      error(err) {
        reject(err);
      },
      complete() {
        resolve(rows);
      },
    });
  });
}

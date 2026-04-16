import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { queryRows, bucket } from './influx.js';

const safeClassName = (s: string) => s.replace(/[^A-Za-z0-9_\-]/g, '');

export function registerTools(server: McpServer): void {
  server.registerTool(
    'list_detected_classes',
    {
      title: 'List detected object classes',
      description:
        'Returns the distinct object classes detected within the given time window, ' +
        'with the total count of detection events for each class.',
      inputSchema: {
        hoursBack: z
          .number()
          .int()
          .min(1)
          .max(24 * 30)
          .default(24)
          .describe('How many hours back to look. Default 24, max 720.'),
      },
    },
    async ({ hoursBack }) => {
      const flux = `
        from(bucket: "${bucket}")
          |> range(start: -${hoursBack}h)
          |> filter(fn: (r) => r._measurement == "detection" and r._field == "count")
          |> group(columns: ["class"])
          |> sum()
          |> group()
          |> sort(columns: ["_value"], desc: true)
      `;
      const rows = await queryRows<{ class: string; _value: number }>(flux);
      const summary = rows.map((r) => ({ class: r.class, totalCount: r._value }));
      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  server.registerTool(
    'recent_detection_counts',
    {
      title: 'Recent detection counts (time-bucketed)',
      description:
        'Returns counts per time bucket for one object class (or all classes if className ' +
        'is omitted). Useful for spotting trends over time.',
      inputSchema: {
        className: z
          .string()
          .optional()
          .describe('Object class to filter, e.g. "person". Omit for all classes.'),
        hoursBack: z
          .number()
          .int()
          .min(1)
          .max(24 * 7)
          .default(1)
          .describe('How many hours back to look. Default 1, max 168.'),
        bucketMinutes: z
          .number()
          .int()
          .min(1)
          .max(60)
          .default(5)
          .describe('Time bucket size in minutes. Default 5.'),
      },
    },
    async ({ className, hoursBack, bucketMinutes }) => {
      const classFilter = className
        ? `and r.class == "${safeClassName(className)}"`
        : '';
      const flux = `
        from(bucket: "${bucket}")
          |> range(start: -${hoursBack}h)
          |> filter(fn: (r) => r._measurement == "detection"
                            and r._field == "count" ${classFilter})
          |> aggregateWindow(every: ${bucketMinutes}m, fn: sum, createEmpty: false)
          |> keep(columns: ["_time", "class", "_value"])
      `;
      const rows = await queryRows<{ _time: string; class: string; _value: number }>(flux);
      return {
        content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
      };
    },
  );

  server.registerTool(
    'detection_summary',
    {
      title: 'Detection summary for a time range',
      description:
        'High-level summary: total frames processed and the top-N classes by count, ' +
        'each with an average confidence (averaged across detection events in the window).',
      inputSchema: {
        hoursBack: z
          .number()
          .int()
          .min(1)
          .max(24 * 7)
          .default(24)
          .describe('How many hours back to look. Default 24, max 168.'),
        topN: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe('Number of top classes to return. Default 10.'),
      },
    },
    async ({ hoursBack, topN }) => {
      const framesFlux = `
        from(bucket: "${bucket}")
          |> range(start: -${hoursBack}h)
          |> filter(fn: (r) => r._measurement == "frames" and r._field == "processed")
          |> sum()
      `;
      const perClassFlux = `
        from(bucket: "${bucket}")
          |> range(start: -${hoursBack}h)
          |> filter(fn: (r) => r._measurement == "detection")
          |> pivot(rowKey:["_time","class"], columnKey:["_field"], valueColumn:"_value")
          |> group(columns:["class"])
          |> reduce(
              identity: {totalCount: 0, sumConf: 0.0, n: 0},
              fn: (r, accumulator) => ({
                totalCount: accumulator.totalCount + int(v: r.count),
                sumConf:    accumulator.sumConf + r.avgConfidence,
                n:          accumulator.n + 1,
              })
          )
          |> map(fn: (r) => ({ class: r.class,
                               totalCount: r.totalCount,
                               avgConfidence: r.sumConf / float(v: r.n) }))
          |> sort(columns:["totalCount"], desc:true)
          |> limit(n: ${topN})
      `;

      const [frames, perClass] = await Promise.all([
        queryRows<{ _value: number }>(framesFlux),
        queryRows<{ class: string; totalCount: number; avgConfidence: number }>(perClassFlux),
      ]);

      const out = {
        windowHours: hoursBack,
        totalFramesProcessed: frames[0]?._value ?? 0,
        topClasses: perClass,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
      };
    },
  );
}

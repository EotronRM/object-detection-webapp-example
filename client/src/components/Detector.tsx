import { useEffect, useRef, useCallback, useState } from 'react';
import { RawImage } from '@huggingface/transformers';
import type { PreTrainedModel, Processor } from '@huggingface/transformers';
import { postprocess } from '../utils/postprocessing';
import { drawDetections } from '../utils/drawBoxes';
import { pushDetections, startAggregator, stopAggregator } from '../utils/detectionAggregator';
import type { Detection } from '../types/detection';

const ROLLING_WINDOW = 30;
const backend = navigator.gpu ? 'WebGPU' : 'WASM';

interface DetectorProps {
  model: PreTrainedModel;
  processor: Processor;
}

export default function Detector({ model, processor }: DetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const isProcessingRef = useRef(false);
  const lastDetectionsRef = useRef<Detection[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const inferenceTimesRef = useRef<number[]>([]);

  const [stats, setStats] = useState({ inferenceMs: 0, fps: 0 });

  const runInference = useCallback(
    async (video: HTMLVideoElement, width: number, height: number) => {
      const t0 = performance.now();

      // Draw video to offscreen canvas to get pixel data
      const offscreen = new OffscreenCanvas(video.videoWidth, video.videoHeight);
      const offCtx = offscreen.getContext('2d')!;
      offCtx.drawImage(video, 0, 0);
      const imageData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);

      // Create RawImage from pixel data (RGBA)
      const rawImage = new RawImage(imageData.data, offscreen.width, offscreen.height, 4);

      // Run processor to get model inputs
      const inputs = await processor(rawImage);

      // Run model
      const output = await model(inputs);

      const elapsed = performance.now() - t0;

      // Update rolling average
      const times = inferenceTimesRef.current;
      times.push(elapsed);
      if (times.length > ROLLING_WINDOW) times.shift();
      const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
      setStats({ inferenceMs: Math.round(avgMs), fps: Math.round(1000 / avgMs) });

      // Extract raw tensor data
      const logits = output.logits.data as Float32Array;
      const predBoxes = output.pred_boxes.data as Float32Array;
      const numDetections = output.logits.dims[1];
      const numClasses = output.logits.dims[2];

      return postprocess(logits, predBoxes, numDetections, numClasses, width, height, 0.7);
    },
    [model, processor],
  );

  useEffect(() => {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let stopped = false;

    async function start() {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      });
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      function loop() {
        if (stopped) return;

        // Always draw video frame for smooth display
        ctx.drawImage(video, 0, 0);
        drawDetections(ctx, lastDetectionsRef.current);

        // Run inference if not already processing
        if (!isProcessingRef.current) {
          isProcessingRef.current = true;
          runInference(video, canvas.width, canvas.height)
            .then((detections) => {
              lastDetectionsRef.current = detections;
              pushDetections(detections);
            })
            .catch((err) => {
              console.error('Inference error:', err);
            })
            .finally(() => {
              isProcessingRef.current = false;
            });
        }

        animFrameRef.current = requestAnimationFrame(loop);
      }

      animFrameRef.current = requestAnimationFrame(loop);
      startAggregator();
    }

    start().catch((err) => console.error('Camera start error:', err));

    return () => {
      stopped = true;
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopAggregator();
    };
  }, [runInference]);

  return (
    <div className="flex flex-col items-center gap-4">
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="max-w-full rounded-lg" />
      <div className="flex gap-6 rounded-lg bg-gray-900 px-6 py-3 text-sm text-gray-300">
        <span>Inference: <strong className="text-white">{stats.inferenceMs} ms</strong></span>
        <span>FPS: <strong className="text-white">{stats.fps}</strong></span>
        <span>Backend: <strong className="text-white">{backend}</strong></span>
      </div>
    </div>
  );
}

import { AutoModel, AutoProcessor, type PreTrainedModel, type Processor, type ProgressInfo } from '@huggingface/transformers';

const MODEL_ID = 'onnx-community/yolo26n-ONNX';

let sessionPromise: Promise<{ model: PreTrainedModel; processor: Processor }> | null = null;

export function loadModel(
  onProgress?: (progress: ProgressInfo) => void,
): Promise<{ model: PreTrainedModel; processor: Processor }> {
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const device = navigator.gpu ? 'webgpu' : 'wasm';
    const dtype = navigator.gpu ? 'fp16' : 'fp32';

    try {
      const [model, processor] = await Promise.all([
        AutoModel.from_pretrained(MODEL_ID, {
          device,
          dtype,
          progress_callback: onProgress,
        }),
        AutoProcessor.from_pretrained(MODEL_ID),
      ]);
      return { model, processor };
    } catch (e) {
      // If WebGPU failed, retry with WASM
      if (device === 'webgpu') {
        console.warn('WebGPU failed, falling back to WASM:', e);
        const [model, processor] = await Promise.all([
          AutoModel.from_pretrained(MODEL_ID, {
            device: 'wasm',
            dtype: 'fp32',
            progress_callback: onProgress,
          }),
          AutoProcessor.from_pretrained(MODEL_ID),
        ]);
        return { model, processor };
      }
      throw e;
    }
  })();

  // Reset on failure so user can retry
  sessionPromise.catch(() => {
    sessionPromise = null;
  });

  return sessionPromise;
}

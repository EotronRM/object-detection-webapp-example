import { useState, useEffect } from 'react';
import type { PreTrainedModel, Processor, ProgressInfo } from '@huggingface/transformers';
import { loadModel } from './utils/modelSession';
import Detector from './components/Detector';

type AppState =
  | { status: 'loading'; progress: string }
  | { status: 'ready'; model: PreTrainedModel; processor: Processor }
  | { status: 'error'; message: string };

export default function App() {
  const [state, setState] = useState<AppState>({ status: 'loading', progress: 'Initializing...' });

  useEffect(() => {
    const onProgress = (info: ProgressInfo) => {
      if (info.status === 'progress' && info.total) {
        const pct = Math.round((info.loaded / info.total) * 100);
        setState({ status: 'loading', progress: `Downloading model... ${pct}%` });
      } else if (info.status === 'ready') {
        setState((s) => (s.status === 'loading' ? { ...s, progress: 'Model ready, starting...' } : s));
      }
    };

    loadModel(onProgress)
      .then(({ model, processor }) => {
        setState({ status: 'ready', model, processor });
      })
      .catch((err) => {
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <div className="mb-4 text-2xl font-semibold">Object Detection</div>
          <div className="text-gray-400">{state.progress}</div>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <div className="mb-4 text-2xl font-semibold text-red-400">Error</div>
          <div className="text-gray-400">{state.message}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 p-4">
      <h1 className="text-2xl font-semibold text-white">YOLO26n Object Detection</h1>
      <Detector model={state.model} processor={state.processor} />
    </div>
  );
}

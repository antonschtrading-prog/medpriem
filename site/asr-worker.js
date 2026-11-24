// Inference executes in this Web Worker on the user's device.
// This first prototype downloads free model weights and library code from trusted public hosts.
// It MUST NOT be used for identifiable patient recordings until dependencies are self-hosted,
// egress is locked down, and privacy/legal testing is complete.
const ENGINE_VERSION = '3.8.1';
import { resolveModel } from './model-options.js';
let transcriber = null;
let loadedModelKey = null;
let busy = false;

async function init(modelKey) {
  if (transcriber && loadedModelKey === modelKey) return transcriber;
  const model = resolveModel(modelKey);
  if (transcriber?.dispose) await transcriber.dispose();
  transcriber = null;
  const { pipeline } = await import(`https://cdn.jsdelivr.net/npm/@huggingface/transformers@${ENGINE_VERSION}`);
  transcriber = await pipeline('automatic-speech-recognition', model.id, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: info => {
      if (info && info.status === 'progress') self.postMessage({ type: 'model-progress', file: info.file || '', progress: info.progress || 0 });
    },
  });
  loadedModelKey = modelKey;
  return transcriber;
}

self.onmessage = async ({ data }) => {
  if (data?.type !== 'recognize' || busy) return;
  busy = true;
  try {
    const samples = data.samples;
    if (!(samples instanceof Float32Array) || samples.length < 8000 || samples.length > 16000 * 30) {
      throw new Error('Неверный аудиофрагмент (допустимо от 0,5 до 30 секунд).');
    }
    self.postMessage({ type: 'engine-state', state: 'loading' });
    const pipe = await init(data.modelKey ?? 'tiny');
    self.postMessage({ type: 'engine-state', state: 'running' });
    const result = await pipe(samples, { language: 'russian', task: 'transcribe', return_timestamps: false });
    self.postMessage({ type: 'recognized', id: data.id, text: result?.text || '' });
  } catch (error) {
    self.postMessage({ type: 'error', id: data?.id, message: error instanceof Error ? error.message : String(error) });
  } finally {
    busy = false;
  }
};

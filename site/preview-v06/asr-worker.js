// Browser-only inference. Do not use identifiable patient recordings until third-party
// scripts/weights are self-hosted, audited, and network egress is restricted.
import { resolveModel } from './model-options.js';
const ENGINE_VERSION = '3.8.1';
let transcriber = null;
let loadedModelKey = null;
let busy = false;

async function init(modelKey) {
  if (transcriber && loadedModelKey === modelKey) return transcriber;
  const model = resolveModel(modelKey);
  if (transcriber?.dispose) await transcriber.dispose();
  transcriber = null;
  loadedModelKey = null;
  const { pipeline } = await import(`https://cdn.jsdelivr.net/npm/@huggingface/transformers@${ENGINE_VERSION}`);
  transcriber = await pipeline('automatic-speech-recognition', model.id, {
    device: 'wasm', dtype: 'q8',
    progress_callback: info => {
      if (info?.status === 'progress') self.postMessage({ type: 'model-progress', file: info.file || '', progress: info.progress || 0 });
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
    const model = resolveModel(data.modelKey ?? 'base');
    self.postMessage({ type: 'engine-state', state: 'loading' });
    const pipe = await init(data.modelKey ?? 'base');
    self.postMessage({ type: 'engine-state', state: 'running' });
    // CTC models do not support Whisper's language/task/decoding generation options.
    const options = model.family === 'whisper'
      ? { language: 'russian', task: 'transcribe', return_timestamps: true,
          ...(data.retry ? { no_repeat_ngram_size: 4, repetition_penalty: 1.12, max_new_tokens: 160 } : {}) }
      : {};
    let result;
    try {
      result = await pipe(samples, options);
    } catch (error) {
      // Some older ONNX Whisper exports cannot produce timestamps.
      // Keep previous transcription behavior rather than failing the whole recording.
      if (model.family !== 'whisper' || !/timestamp|attention|alignment/i.test(String(error?.message || error))) throw error;
      result = await pipe(samples, { ...options, return_timestamps: false });
    }
    self.postMessage({ type: 'recognized', id: data.id, text: result?.text || '', chunks: Array.isArray(result?.chunks) ? result.chunks.map(c => ({ text: c.text, timestamp: c.timestamp })) : [] });
  } catch (error) {
    self.postMessage({ type: 'error', id: data?.id, message: error instanceof Error ? error.message : String(error) });
  } finally {
    busy = false;
  }
};

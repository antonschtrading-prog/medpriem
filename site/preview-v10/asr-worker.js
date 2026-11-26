import { loadGigaam } from './gigaam.js';
// Browser-only inference. Do not use identifiable patient recordings until third-party
// scripts/weights are self-hosted, audited, and network egress is restricted.
import { resolveModel } from './model-options.js';
const ENGINE_VERSION = '3.8.1';
const BUILD_ID = '10-audit-20261127';
let transcriber = null;
let loadedModelKey = null;
let busy = false;

async function init(modelKey) {
  if (transcriber && loadedModelKey === modelKey) return transcriber;
  const model = resolveModel(modelKey);
  if (transcriber?.dispose) await transcriber.dispose();
  transcriber = null;
  loadedModelKey = null;
  if (model.family === 'gigaam') {
    self.postMessage({type:'model-config',modelKey,encoderDtype:'int8',decoderDtype:'int8',build:BUILD_ID});
    transcriber=await loadGigaam(undefined,modelKey);loadedModelKey=modelKey;return transcriber;
  }
  const { pipeline } = await import(`https://cdn.jsdelivr.net/npm/@huggingface/transformers@${ENGINE_VERSION}`);
  const progress_callback = info => {
    if (info?.status === 'progress') self.postMessage({
      type: 'model-progress', file: info.file || '', progress: info.progress || 0,
    });
  };
  // The fp32 Turbo encoder is >2 GB and relies on an external .onnx_data
  // file unsupported by our current browser runtime. q4 is self-contained.
  const mixedDtype = { encoder_model: 'q4', decoder_model_merged: 'q4' };
  const initialDtype = model.family === 'whisper' && ['turbo', 'turbo_ru'].includes(modelKey)
    ? mixedDtype
    : 'q8';
  self.postMessage({ type: 'model-config', modelKey,
    encoderDtype: typeof initialDtype === 'object' ? initialDtype.encoder_model : initialDtype,
    decoderDtype: typeof initialDtype === 'object' ? initialDtype.decoder_model_merged : initialDtype,
    build: BUILD_ID,
  });
  try {
    transcriber = await pipeline('automatic-speech-recognition', model.id, {
      device: 'wasm', dtype: initialDtype, progress_callback,
    });
  } catch (error) {
    // q8 Whisper convolution can contain unsupported ConvInteger on WASM.
    // Retry only this specific kernel error, not OOM/network/invalid-file failures.
    if (model.family !== 'whisper' ||
        !/ConvInteger|Conv_quant/i.test(String(error?.message || error)) ||
        initialDtype !== 'q8') throw error;
    self.postMessage({ type: 'engine-state', state: 'fallback-q4-encoder' });
    transcriber = await pipeline('automatic-speech-recognition', model.id, {
      device: 'wasm', dtype: mixedDtype, progress_callback,
    });
  }
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
    const model = resolveModel(data.modelKey ?? 'gigaam');
    self.postMessage({ type: 'engine-state', state: 'loading' });
    const pipe = await init(data.modelKey ?? 'gigaam');
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
    const reason = error instanceof Error ? error.message : String(error);
    const hint = /Module\.MountedFiles|encoder_model\.onnx_data/i.test(reason)
      ? 'Браузер выбрал ONNX с внешним файлом весов. Версия worker=' + BUILD_ID +
        '. Это ошибка выбора/совместимости модели, не аудиозаписи.'
      : '';
    self.postMessage({ type: 'error', id: data?.id, message: hint ? hint + ' ' + reason : reason });
  } finally {
    busy = false;
  }
};

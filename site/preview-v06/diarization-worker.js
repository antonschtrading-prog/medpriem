// Experimental on-device acoustic diarization via sherpa-onnx WASM.
// The Hugging Face files are downloaded; audio is passed only into this local worker.
// External binary/runtime has not yet been independently audited for clinical use.
const ROOT = 'https://huggingface.co/Transcripta/sherpa-onnx-speaker-diarization-wasm/resolve/main/';
const ENGINE_JS = 'sherpa-onnx-wasm-main-speaker-diarization.js';
const API_JS = 'sherpa-onnx-speaker-diarization.js';
let initialized = null;
let diarizer = null;

async function initialize() {
  if (diarizer) return diarizer;
  if (initialized) return initialized;
  initialized = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Истекло время загрузки движка разделения голосов.')), 180000);
    self.Module = {
      locateFile(path) { return ROOT + path; },
      onRuntimeInitialized() {
        try {
          if (typeof self.createOfflineSpeakerDiarization !== 'function') {
            throw new Error('Не загрузился интерфейс диаризации.');
          }
          diarizer = self.createOfflineSpeakerDiarization(self.Module);
          clearTimeout(timeout);
          resolve(diarizer);
        } catch (err) { clearTimeout(timeout); reject(err); }
      },
      onAbort(reason) { clearTimeout(timeout); reject(new Error('Движок разделения голосов остановился: ' + String(reason))); },
      printErr() {},
    };
    try {
      // Classic worker because the Emscripten preload uses importScripts.
      importScripts(ROOT + API_JS);
      importScripts(ROOT + ENGINE_JS);
    } catch (err) { clearTimeout(timeout); reject(err); }
  });
  try { return await initialized; }
  catch (error) { initialized = null; throw error; }
}
self.onmessage = async ({ data }) => {
  if (data?.type !== 'diarize') return;
  const id = data.id;
  try {
    if (!(data.samples instanceof Float32Array) || data.samples.length < 16000 || data.samples.length > 16000 * 3600) {
      throw new Error('Некорректная запись для разделения голосов (1 секунда — 60 минут).');
    }
    self.postMessage({ type: 'diarization-progress', id, message: 'Загружаю локальный движок и модели голосов…' });
    const engine = await initialize();
    self.postMessage({ type: 'diarization-progress', id, message: 'Определяю смены голосов на устройстве…' });
    const segments = await engine.process(data.samples);
    if (!Array.isArray(segments)) throw new Error('Модель вернула неожиданный формат интервалов.');
    self.postMessage({ type: 'diarization-result', id, segments });
  } catch (error) {
    self.postMessage({ type: 'diarization-error', id, message: error instanceof Error ? error.message : String(error) });
  }
};

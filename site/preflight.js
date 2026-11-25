// Small preflight requests inspect manifests only; no audio samples ever leave the browser.
import { resolveModel } from './model-options.js';
import { checkSileroRuntime } from './silero-segmentation.js';

export async function checkModelManifest(modelKey, fetcher = fetch) {
  const { id, family } = resolveModel(modelKey);
  const turbo = modelKey === 'turbo' || modelKey === 'turbo_ru';
  const url = 'https://huggingface.co/' + id + '/resolve/main/config.json';
  const response = await fetcher(url, { method: 'GET', cache: 'no-store' });
  if (!response.ok) throw new Error('Модель недоступна: HTTP ' + response.status);
  const config = await response.json();
  if (!config || typeof config !== 'object' || !config.model_type) {
    throw new Error('У модели отсутствует корректная конфигурация.');
  }
  const filesUrl = 'https://huggingface.co/api/models/' + id + '/tree/main/onnx';
  const filesResponse = await fetcher(filesUrl, { method: 'GET', cache: 'no-store' });
  if (!filesResponse.ok) throw new Error('Нельзя проверить ONNX-файлы: HTTP ' + filesResponse.status);
  const files = await filesResponse.json();
  const paths = Array.isArray(files) ? files.map(f => String(f.path || '').split('/').pop()) : [];
  const encoder = paths.some(name => /^encoder_model_(quantized|int8|uint8)\.onnx$/.test(name));
  const decoder = paths.some(name => /^decoder_model(_merged)?_(quantized|int8|uint8)\.onnx$/.test(name));
  // CTC exports contain one acoustic model, not Whisper's encoder/decoder pair.
  const singleModel = paths.some(name => /^model_(quantized|int8|uint8)\.onnx$/.test(name));
  const q4Encoder = paths.includes('encoder_model_q4.onnx');
  const q4Decoder = paths.includes('decoder_model_merged_q4.onnx');
  const q8Ready = family === 'ctc' ? singleModel : encoder && decoder;
  const ready = turbo ? q4Encoder && q4Decoder : q8Ready;
  return { id, type: config.model_type, family, ready, q8Ready, encoder, decoder, singleModel, q4Encoder, q4Decoder, turbo };
}

export async function runEnginePreflight(modelKey, update = () => {}) {
  const checks = [];
  update('Проверяю настоящую загрузку и короткий запуск Silero VAD…');
  try {
    const result = await checkSileroRuntime();
    checks.push({ name: 'Silero VAD / WASM', ok: true, details: 'Выполнен локальный тест ' + result.checkedSeconds + ' с тишины.' });
  } catch (error) {
    checks.push({ name: 'Silero VAD / WASM', ok: false, details: String(error?.message || error) });
  }
  update('Проверяю конфигурацию выбранной модели. Большие веса не загружаю…');
  try {
    const result = await checkModelManifest(modelKey);
    checks.push({ name: 'ASR: выбранные ONNX-файлы', ok: result.ready,
      details: result.id + ', тип ' + result.type + (result.turbo ? ', q4 encoder=' + result.q4Encoder + ', q4 decoder=' + result.q4Decoder : result.family === 'ctc' ? ', q8 CTC model=' + result.singleModel : ', q8 encoder=' + result.encoder + ', decoder=' + result.decoder) + '. Реальное распознавание НЕ проверено.' });
  } catch (error) {
    checks.push({ name: 'ASR: выбранные ONNX-файлы', ok: false, details: String(error?.message || error) });
  }
  return checks;
}

// Small preflight requests inspect manifests only; no audio samples ever leave the browser.
import { resolveModel } from './model-options.js';
import { checkSileroRuntime } from './silero-segmentation.js';

export async function checkModelManifest(modelKey, fetcher = fetch) {
  const { id } = resolveModel(modelKey);
  const url = 'https://huggingface.co/' + id + '/resolve/main/config.json';
  const response = await fetcher(url, { method: 'GET', cache: 'no-store' });
  if (!response.ok) throw new Error('Модель недоступна: HTTP ' + response.status);
  const config = await response.json();
  if (!config || typeof config !== 'object' || !config.model_type) {
    throw new Error('У модели отсутствует корректная конфигурация.');
  }
  return { id, type: config.model_type };
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
    checks.push({ name: 'ASR: доступность манифеста', ok: true, details: result.id + ', тип ' + result.type + '. Реальное распознавание НЕ проверено.' });
  } catch (error) {
    checks.push({ name: 'ASR: доступность манифеста', ok: false, details: String(error?.message || error) });
  }
  return checks;
}

import { resolveModel } from './model-options.js';
// Explicitly exported local checkpoint. No browser storage, cookies or server uploads.
export const CHECKPOINT_VERSION = 1;
export const CHECKPOINT_EXTENSION = '.medpriem.json';
export const DEFAULT_CHUNK_SECONDS = 25;

export function sourceIdentity(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || !Number.isFinite(file.lastModified)) {
    throw new Error('Некорректные сведения об аудиофайле.');
  }
  return { name: String(file.name), size: file.size, lastModified: file.lastModified };
}

export function createCheckpoint({ file, segments, chunkSeconds = DEFAULT_CHUNK_SECONDS, durationSeconds, completed = false, modelKey = 'tiny' }) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 3600) throw new Error('Неверная длительность записи.');
  if (!Array.isArray(segments) || !Number.isInteger(chunkSeconds) || chunkSeconds < 5 || chunkSeconds > 30) throw new Error('Некорректные параметры контрольной точки.');
  resolveModel(modelKey);
  const total = Math.ceil(durationSeconds / chunkSeconds);
  if (segments.length > total) throw new Error('Слишком много фрагментов.');
  const rows = segments.map((segment, i) => {
    if (!segment || !Number.isFinite(segment.startSeconds) || Math.abs(segment.startSeconds - i * chunkSeconds) > 0.02) {
      throw new Error('Нарушен порядок фрагментов.');
    }
    if (typeof segment.text !== 'string' || segment.text.length > 10000) throw new Error('Некорректный текст фрагмента.');
    return { startSeconds: segment.startSeconds, text: segment.text };
  });
  return { format: 'medpriem-local-checkpoint', version: CHECKPOINT_VERSION, source: sourceIdentity(file), durationSeconds, chunkSeconds, modelKey, completed: completed && rows.length === total, segments: rows };
}

export function readCheckpoint(content, file) {
  if (typeof content !== 'string' || content.length > 2_000_000) throw new Error('Контрольная точка слишком большая.');
  let data;
  try { data = JSON.parse(content.replace(/^\uFEFF/, '')); } catch { throw new Error('Неверный формат файла контрольной точки.'); }
  if (data?.format !== 'medpriem-local-checkpoint' || data.version !== CHECKPOINT_VERSION) throw new Error('Неизвестная версия контрольной точки.');
  const expected = sourceIdentity(file);
  if (!data.source || ['name','size','lastModified'].some(k => data.source[k] !== expected[k])) {
    throw new Error('Контрольная точка относится к другой аудиозаписи. Выберите исходный файл.');
  }
  const checked = createCheckpoint({ file, segments: data.segments, chunkSeconds: data.chunkSeconds, durationSeconds: data.durationSeconds, completed: data.completed, modelKey: data.modelKey ?? 'tiny' });
  // Guard against corrupted or manipulated resume positions.
  return { ...checked, nextIndex: checked.segments.length };
}

export function memoryEstimateMiB({ durationSeconds, sampleRate, channels }) {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || !Number.isFinite(sampleRate) || !Number.isFinite(channels)) throw new Error('Неверные параметры звука.');
  // WebAudio may retain the original decoded buffer alongside the 16 kHz copy.
  const decoded = durationSeconds * sampleRate * channels * 4;
  const mono16k = durationSeconds * 16000 * 4;
  return Math.ceil((decoded + mono16k) / (1024 * 1024));
}

import { sourceIdentity } from './checkpoint.js';
import { resolveModel } from './model-options.js';
import { SEGMENTATION_VERSION } from './pause-segmentation.js';
export const PAUSE_CHECKPOINT_VERSION = 2;

export function createPauseCheckpoint({ file, durationSeconds, modelKey, ranges, segments, completed = false }) {
  resolveModel(modelKey);
  if (!(durationSeconds > 0 && durationSeconds <= 3600) || !Array.isArray(ranges) ||
      !ranges.length || ranges.length > 500 || !Array.isArray(segments) || segments.length > ranges.length) {
    throw new Error('Некорректная контрольная точка нового конвейера.');
  }
  let previousEnd = 0;
  const checkedRanges = ranges.map((r, i) => {
    const startSample = r.startSample, endSample = r.endSample;
    if (!Number.isSafeInteger(startSample) || !Number.isSafeInteger(endSample) || startSample !== previousEnd ||
        endSample <= startSample || (endSample - startSample) > 16000 * 29.6 ||
        endSample > Math.ceil(durationSeconds * 16000) + 2) throw new Error('Нарушены границы фрагментов.');
    previousEnd = endSample;
    return { startSample, endSample, startSeconds: startSample / 16000, endSeconds: endSample / 16000 };
  });
  if (Math.abs(previousEnd / 16000 - durationSeconds) > 0.2) throw new Error('Запись не покрыта фрагментами полностью.');
  const rows = segments.map((s, i) => {
    if (!s || Math.abs(s.startSeconds - checkedRanges[i].startSeconds) > 0.03 ||
        typeof s.text !== 'string' || s.text.length > 10000) throw new Error('Некорректная последовательность расшифровки.');
    return { startSeconds: s.startSeconds, text: s.text,
      timedChunks: Array.isArray(s.timedChunks) ? s.timedChunks : [] };
  });
  return { format: 'medpriem-local-checkpoint', version: PAUSE_CHECKPOINT_VERSION,
    segmentation: SEGMENTATION_VERSION, source: sourceIdentity(file), durationSeconds, modelKey,
    ranges: checkedRanges, completed: completed && rows.length === checkedRanges.length, segments: rows };
}

export function readPauseCheckpoint(content, file) {
  if (typeof content !== 'string' || content.length > 3000000) throw new Error('Контрольная точка слишком большая.');
  let data;
  try { data = JSON.parse(content.replace(/^\uFEFF/, '')); } catch { throw new Error('Некорректный файл контрольной точки.'); }
  if (data?.version !== PAUSE_CHECKPOINT_VERSION || data?.segmentation !== SEGMENTATION_VERSION)
    throw new Error('Несовместимая версия сегментации.');
  const identity = sourceIdentity(file);
  if (!data.source || ['name', 'size', 'lastModified'].some(k => data.source[k] !== identity[k]))
    throw new Error('Контрольная точка относится к другому файлу.');
  const checked = createPauseCheckpoint({ file, durationSeconds: data.durationSeconds, modelKey: data.modelKey,
    ranges: data.ranges, segments: data.segments, completed: data.completed });
  return { ...checked, nextIndex: checked.segments.length };
}

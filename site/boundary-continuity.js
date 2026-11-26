// Conservative continuity between two local ASR windows. No words are invented.
export const CONTEXT_OVERLAP_SECONDS = 0.65;
const words = text => String(text ?? '').match(/[\p{L}\p{N}]+/gu) || [];
const normalized = t => t.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

// Keep checkpoint ranges non-overlapping; overlap only the PCM passed into ASR.
export function recognitionWindow(ranges, index, sampleRate = 16000) {
  const range = ranges[index];
  if (!range) throw new Error('Нет границ фрагмента.');
  const previous = ranges[index - 1];
  const canOverlap = index > 0 && previous?.forcedCut === true;
  const length = range.endSample - range.startSample;
  const budget = Math.max(0, Math.floor(29.95 * sampleRate) - length);
  const desired = canOverlap ? Math.min(Math.round(CONTEXT_OVERLAP_SECONDS * sampleRate), budget) : 0;
  return { startSample: range.startSample - desired, endSample: range.endSample, overlapSeconds: desired / sampleRate };
}

// Only remove verifiably duplicated tokens at the segment boundary.
// Ambiguous text is preserved, flagged and referred to the recording.
export function reconcileBoundary(previousText, currentText, hasOverlap) {
  const prior = words(previousText);
  const next = words(currentText);
  if (!hasOverlap || prior.length < 2 || next.length < 2)
    return { text: currentText, removedWords: 0, requiresReview: false };
  let match = 0;
  for (let count = Math.min(12, prior.length, next.length); count >= 2; count--) {
    const tail = prior.slice(-count).map(normalized);
    const head = next.slice(0, count).map(normalized);
    if (tail.every((v, i) => v === head[i])) { match = count; break; }
  }
  if (!match) return { text: currentText, removedWords: 0, requiresReview: true };
  const boundaries = [...String(currentText).matchAll(/[\p{L}\p{N}]+/gu)];
  const after = boundaries[match - 1].index + boundaries[match - 1][0].length;
  return { text: currentText.slice(after).replace(/^[\s,.;:!?…—–-]+/u, ''), removedWords: match, requiresReview: false };
}

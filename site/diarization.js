// Time-aligned speaker turns from a real acoustic diarization engine.
// This module does not infer a speaker from transcribed words.
export function normalizeSpeakerTurns(raw, durationSeconds) {
  if (!Array.isArray(raw) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Некорректные результаты определения голосов.');
  const turns = [];
  const seen = new Map();
  for (const item of [...raw].sort((a,b) => Number(a.start)-Number(b.start))) {
    const start = Math.max(0, Math.min(durationSeconds, Number(item.start)));
    const end = Math.max(0, Math.min(durationSeconds, Number(item.end)));
    const id = String(item.speaker);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !/^\d+$/.test(id)) continue;
    if (!seen.has(id)) seen.set(id, seen.size + 1);
    turns.push({ startSeconds: start, endSeconds: end, speaker: seen.get(id) });
  }
  return turns;
}
export function speakerForWindow(start, end, turns) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const totals = new Map();
  for (const t of turns) {
    const overlap = Math.max(0, Math.min(end, t.endSeconds) - Math.max(start, t.startSeconds));
    if (overlap > 0) totals.set(t.speaker, (totals.get(t.speaker) || 0) + overlap);
  }
  const ranked = [...totals.entries()].sort((a,b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] < 0.4) return null;
  const total = ranked.reduce((sum, entry) => sum + entry[1], 0);
  return ranked[0][1] / total >= 0.94 ? ranked[0][0] : null;
}
export function diarizedTranscript(segments, turns, durationSeconds, timeLabel) {
  return segments.map((s,i) => {
    const start = Number(s.startSeconds);
    const end = Math.min(durationSeconds, i+1 < segments.length ? Number(segments[i+1].startSeconds) : durationSeconds);
    const speaker = speakerForWindow(start, end, turns);
    const label = speaker ? `Говорящий ${speaker} (автоматически, проверьте)` : 'Говорящий не определён / возможна смена голосов';
    return `[${timeLabel(start)}] ${label}: ${String(s.text || '').trim()}`;
  }).join('\n\n');
}

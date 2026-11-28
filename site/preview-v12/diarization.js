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
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !id || id === 'undefined' || id === 'null') continue;
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
  if (!ranked.length || ranked[0][1] < (end-start)*0.7) return null;
  const total = ranked.reduce((sum, entry) => sum + entry[1], 0);
  return ranked[0][1] / total >= 0.94 ? ranked[0][0] : null;
}
// Never silently discard words when ASR timings are absent or malformed.
export function diarizedTranscript(segments, turns, durationSeconds, timeLabel) {
  const lines = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const start = Number(s.startSeconds);
    const end = Math.min(durationSeconds, i+1 < segments.length ? Number(segments[i+1].startSeconds) : durationSeconds);
    const chunks = Array.isArray(s.timedChunks) ? s.timedChunks : [];
    const sameWords = chunks.length > 0 &&
      chunks.every(c => typeof c.text === 'string' && Array.isArray(c.timestamp) && c.timestamp.length === 2 &&
        Number.isFinite(c.timestamp[0]) && Number.isFinite(c.timestamp[1]) &&
        c.timestamp[0] >= 0 && c.timestamp[1] > c.timestamp[0] && c.timestamp[1] <= (end-start)+0.5) &&
      chunks.map(c => c.text).join('').replace(/\s+/g,'') === String(s.text || '').replace(/\s+/g,'');
    if (sameWords) {
      const groups = [];
      for (const chunk of chunks) {
        const voice = speakerForWindow(start + chunk.timestamp[0], start + chunk.timestamp[1], turns);
        const last = groups.at(-1);
        if (last && last.voice === voice) {
          last.text += chunk.text;
        } else {
          groups.push({ voice, at: start + chunk.timestamp[0], text: chunk.text });
        }
      }
      for (const group of groups) {
        const label = group.voice ? `Говорящий ${group.voice} (автоматически, проверьте)` : 'Говорящий не определён';
        lines.push(`[${timeLabel(group.at)}] ${label}: ${group.text.trim()}`);
      }
    } else {
      const voice = speakerForWindow(start, end, turns);
      const label = voice ? `Говорящий ${voice} (автоматически, проверьте)` : 'Говорящий не определён / возможна смена голосов';
      lines.push(`[${timeLabel(start)}] ${label}: ${String(s.text || '').trim()}`);
    }
  }
  return lines.join('\n\n');
}

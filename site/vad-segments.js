// Pure interval planner for a future acoustic VAD, e.g. Silero.
// Input speech intervals must come from the audio model, never from transcript text.
// This module does not perform VAD or speaker identification.
export function planSpeechWindows(intervals, duration, options = {}) {
  const { maxSeconds = 25, padSeconds = 0.2, mergeGapSeconds = 0.35, minSeconds = 0.5 } = options;
  if (![duration, maxSeconds, padSeconds, mergeGapSeconds, minSeconds].every(Number.isFinite) ||
      duration <= 0 || maxSeconds <= 0 || padSeconds < 0 ||
      mergeGapSeconds < 0 || minSeconds <= 0 || minSeconds > maxSeconds ||
      padSeconds * 2 >= maxSeconds) throw new Error('Неверные параметры VAD.');
  if (!Array.isArray(intervals)) throw new Error('VAD должен вернуть массив интервалов.');
  const valid = intervals.map(i => {
    const start = Number(i.startSeconds), end = Number(i.endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 ||
        end <= start || end > duration + 0.001) throw new Error('Неверный речевой интервал.');
    return { start, end: Math.min(duration, end) };
  }).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const interval of valid) {
    const last = merged.at(-1);
    if (last && interval.start - last.end <= mergeGapSeconds) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  const out = [];
  for (const item of merged) {
    let cursor = item.start;
    const coreCapacity = maxSeconds - 2 * padSeconds;
    while (cursor < item.end - 1e-7) {
      const next = Math.min(item.end, cursor + coreCapacity);
      const startSeconds = Math.max(0, cursor - padSeconds);
      const endSeconds = Math.min(duration, next + padSeconds);
      if (endSeconds - startSeconds >= minSeconds) {
        out.push({ startSeconds, endSeconds, speechStartSeconds: cursor, speechEndSeconds: next });
      }
      cursor = next;
    }
  }
  return out;
}

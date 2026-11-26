// MedPriem local-only audio preprocessing. No network access in this module.
export const TARGET_SAMPLE_RATE = 16000;
export const CHUNK_SECONDS = 25;
export const MAX_PILOT_SECONDS = 3600; // experimental ceiling; decoded long M4A may exceed Safari memory

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function validateAudioBuffer(buffer) {
  if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0 || !buffer.numberOfChannels || !buffer.sampleRate) {
    throw new Error('Не удалось прочитать аудиозапись. Проверьте формат файла.');
  }
  if (buffer.duration > MAX_PILOT_SECONDS) {
    throw new Error(`Экспериментальная версия ограничена ${MAX_PILOT_SECONDS / 60} минутами. Длинные записи могут не поместиться в память браузера.`);
  }
  return buffer.duration;
}

// Mono mix and downsample using local window averaging. Avoid a second full-res mono copy.
export function to16kMono(audioBuffer) {
  validateAudioBuffer(audioBuffer);
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, i) => audioBuffer.getChannelData(i));
  const inputRate = audioBuffer.sampleRate;
  const outputLength = Math.floor(audioBuffer.length * TARGET_SAMPLE_RATE / inputRate);
  if (!Number.isSafeInteger(outputLength) || outputLength <= 0) throw new Error('Некорректная длительность звука.');
  const out = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * inputRate / TARGET_SAMPLE_RATE);
    const end = Math.max(start + 1, Math.min(audioBuffer.length, Math.floor((i + 1) * inputRate / TARGET_SAMPLE_RATE)));
    let total = 0;
    for (let j = start; j < end; j++) {
      let sample = 0;
      for (const channel of channels) sample += channel[j] || 0;
      total += sample / channels.length;
    }
    out[i] = total / (end - start);
  }
  return out;
}

export function chunkRanges(sampleCount, sampleRate = TARGET_SAMPLE_RATE, chunkSeconds = CHUNK_SECONDS) {
  if (!Number.isInteger(sampleCount) || sampleCount < 0) throw new Error('Неверная длина аудио.');
  const chunkSamples = Math.floor(sampleRate * chunkSeconds);
  if (chunkSamples <= 0) throw new Error('Неверные параметры сегментации.');
  const result = [];
  for (let offset = 0; offset < sampleCount; offset += chunkSamples) {
    result.push({ startSample: offset, endSample: Math.min(sampleCount, offset + chunkSamples), startSeconds: offset / sampleRate });
  }
  return result;
}

export function normalizeRecognition(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

export function buildTranscript(segments, partial = false) {
  const body = segments.map(s => `[${formatTime(s.startSeconds)}] ${normalizeRecognition(s.text) || '[речь не распознана]'}`).join('\n\n');
  return `${partial ? 'ВНИМАНИЕ: НЕПОЛНАЯ РАСШИФРОВКА\n\n' : ''}${body}`;
}

// Decode and downsample one window at a time to avoid retaining a full hour-long 16 kHz Float32Array.
// The browser still decodes the original compressed recording in full; that memory cost remains.
export function to16kMonoRange(audioBuffer, startSample, endSample) {
  validateAudioBuffer(audioBuffer);
  const outputLength = Math.floor(audioBuffer.length * TARGET_SAMPLE_RATE / audioBuffer.sampleRate);
  if (!Number.isSafeInteger(startSample) || !Number.isSafeInteger(endSample) || startSample < 0 || endSample > outputLength || startSample >= endSample) {
    throw new Error('Неверные границы аудиофрагмента.');
  }
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, i) => audioBuffer.getChannelData(i));
  const result = new Float32Array(endSample - startSample);
  for (let index = startSample; index < endSample; index++) {
    const from = Math.floor(index * audioBuffer.sampleRate / TARGET_SAMPLE_RATE);
    const to = Math.max(from + 1, Math.min(audioBuffer.length, Math.floor((index + 1) * audioBuffer.sampleRate / TARGET_SAMPLE_RATE)));
    let sum = 0;
    for (let src = from; src < to; src++) {
      for (const channel of channels) sum += (channel[src] || 0) / channels.length;
    }
    result[index - startSample] = sum / (to - from);
  }
  return result;
}

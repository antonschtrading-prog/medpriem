// v0.6: deterministic local pause-aware segmentation, no external models or network.
// This is an acoustic energy baseline, NOT Silero VAD. Silero requires separately validated WASM integration.
export const SEGMENTATION_VERSION = 'pause-energy-v1';
const FRAME_SECONDS = 0.04;

export function pauseAwareRanges(audioBuffer, {
  sampleRate = 16000, minSeconds = 10, targetSeconds = 22, maxSeconds = 29,
} = {}) {
  if (!audioBuffer || !Number.isFinite(audioBuffer.sampleRate) || !Number.isFinite(audioBuffer.length) ||
      !Number.isInteger(audioBuffer.numberOfChannels) || audioBuffer.numberOfChannels < 1 ||
      !Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !(minSeconds > 0 && minSeconds < targetSeconds && targetSeconds < maxSeconds && maxSeconds <= 29.5)) {
    throw new Error('Некорректные параметры сегментации по паузам.');
  }
  const originalRate = audioBuffer.sampleRate;
  const outputLength = Math.floor(audioBuffer.length * sampleRate / originalRate);
  if (outputLength <= 0) return [];
  const frameSize = Math.max(1, Math.round(originalRate * FRAME_SECONDS));
  const frames = Math.ceil(audioBuffer.length / frameSize);
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, i) => audioBuffer.getChannelData(i));
  const energies = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    const from = frame * frameSize;
    const to = Math.min(audioBuffer.length, from + frameSize);
    const stride = Math.max(1, Math.floor(originalRate / 8000));
    let sum = 0, count = 0;
    for (let j = from; j < to; j += stride) {
      let sample = 0;
      for (const channel of channels) sample += channel[j] / channels.length;
      sum += sample * sample;
      count++;
    }
    energies[frame] = Math.sqrt(sum / Math.max(1, count));
  }
  const ordered = Array.from(energies).sort((a, b) => a - b);
  const floor = ordered[Math.floor(ordered.length * 0.15)] || 0;
  const silenceThreshold = Math.max(0.004, Math.min(0.04, floor * 2.2));
  const output = [];
  let startFrame = 0;
  const minFrames = Math.ceil(minSeconds / FRAME_SECONDS);
  const maxFrames = Math.floor(maxSeconds / FRAME_SECONDS);
  const targetFrames = Math.round(targetSeconds / FRAME_SECONDS);
  while (startFrame < frames) {
    const maxEnd = Math.min(frames, startFrame + maxFrames);
    let endFrame = maxEnd;
    if (maxEnd < frames && maxEnd - startFrame > minFrames) {
      const candidates = [];
      for (let f = startFrame + minFrames; f <= maxEnd; f++) {
        // Prefer a sustained quiet region rather than a single zero crossing.
        const a = Math.max(0, f - 4), b = Math.min(frames, f + 4);
        let sum = 0;
        for (let k = a; k < b; k++) sum += energies[k];
        const energy = sum / (b - a);
        if (energy <= silenceThreshold) candidates.push({ frame: f, score: Math.abs(f - (startFrame + targetFrames)) });
      }
      if (candidates.length) {
        candidates.sort((a, b) => a.score - b.score);
        endFrame = candidates[0].frame;
      }
    }
    const startSample = Math.floor(startFrame * frameSize * sampleRate / originalRate);
    const endSample = Math.min(outputLength, Math.floor(endFrame * frameSize * sampleRate / originalRate));
    if (endSample > startSample) output.push({
      startSample, endSample, startSeconds: startSample / sampleRate,
      endSeconds: endSample / sampleRate, forcedCut: endFrame === maxEnd && maxEnd < frames,
    });
    startFrame = endFrame;
  }
  // Do not feed a final sub-0.5-second tail to the ASR worker.
  if (output.length > 1 && output[output.length - 1].endSample - output[output.length - 1].startSample < sampleRate / 2) {
    const tail = output.pop();
    output[output.length - 1].endSample = tail.endSample;
    output[output.length - 1].endSeconds = tail.endSeconds;
    output[output.length - 1].forcedCut = true;
  }
  if (output.length) output[output.length - 1].endSample = outputLength;
  if (output.length) output[output.length - 1].endSeconds = outputLength / sampleRate;
  return output;
}

// Experimental local silence-aware segmentation, not Silero VAD.
// Keeps every sample, chooses boundaries in quieter regions when available.
export function pauseAwareRanges(buffer, outputRate = 16000, options = {}) {
  const { targetSeconds = 18, minSeconds = 7, maxSeconds = 28 } = options;
  if (!buffer || !Number.isFinite(buffer.sampleRate) || !Number.isFinite(buffer.length) || buffer.length <= 0) throw new Error('Invalid audio');
  if (!(minSeconds > 0 && minSeconds < targetSeconds && targetSeconds < maxSeconds && maxSeconds <= 30)) throw new Error('Invalid segment limits');
  const sampleCount = Math.floor(buffer.length * outputRate / buffer.sampleRate);
  if (sampleCount <= 0) throw new Error('Empty audio');
  const frameSeconds = 0.05;
  const frameSize = Math.max(1, Math.round(buffer.sampleRate * frameSeconds));
  const frames = Math.ceil(buffer.length / frameSize);
  const channel = buffer.getChannelData(0);
  const energies = new Float32Array(frames);
  for (let k = 0; k < frames; k++) {
    const a = k * frameSize, b = Math.min(buffer.length, a + frameSize);
    let sum = 0, count = 0;
    const stride = Math.max(1, Math.floor(buffer.sampleRate / 4000));
    for (let j = a; j < b; j += stride) { const v = channel[j] || 0; sum += v*v; count++; }
    energies[k] = Math.sqrt(sum / Math.max(1, count));
  }
  const sorted = Array.from(energies).sort((a,b)=>a-b);
  const floor = sorted[Math.floor((sorted.length-1)*0.2)] || 0;
  const ceiling = sorted[Math.floor((sorted.length-1)*0.8)] || 0;
  const quietThreshold = Math.max(0.0015, Math.min(0.025, floor*2.2, ceiling*0.20));
  const min = Math.round(minSeconds*outputRate);
  const target = Math.round(targetSeconds*outputRate);
  const max = Math.round(maxSeconds*outputRate);
  const ranges = [];
  let start = 0;
  while (start < sampleCount) {
    const remaining = sampleCount-start;
    if (remaining <= max) {
      ranges.push({startSample:start,endSample:sampleCount,startSeconds:start/outputRate});
      break;
    }
    const low = start + min, high = Math.min(sampleCount, start+max);
    const ideal = start+target;
    let best = null, bestScore = Infinity;
    const firstFrame = Math.ceil(low / outputRate / frameSeconds);
    const lastFrame = Math.floor(high / outputRate / frameSeconds);
    for (let f = firstFrame; f <= lastFrame; f++) {
      // Require a quiet neighborhood, not a single low-energy sample.
      if (f < 2 || f+2 >= frames) continue;
      const energy = Math.max(energies[f-2],energies[f-1],energies[f],energies[f+1],energies[f+2]);
      if (energy > quietThreshold) continue;
      const pos = Math.min(sampleCount,Math.round(f*frameSeconds*outputRate));
      const score = Math.abs(pos-ideal);
      if (score < bestScore) {best=pos;bestScore=score;}
    }
    const end = Math.max(start+1, Math.min(sampleCount, best ?? high));
    ranges.push({startSample:start,endSample:end,startSeconds:start/outputRate});
    start = end;
  }
  return ranges;
}

// Silero VAD browser adapter. Scripts and weights fetched only after user consents and starts.
// The VAD receives PCM locally; only open-source runtime / model assets are downloaded.
import { to16kMono } from './audio.js';
const VAD_ROOT = 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.31/dist/';
const ORT_ROOT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
let scriptsPromise = null;
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = url;
    tag.onload = resolve;
    tag.onerror = () => reject(new Error('Недоступна библиотека Silero: ' + url));
    document.head.append(tag);
  });
}
async function ensureSilero() {
  if (!scriptsPromise) scriptsPromise = (async () => {
    await loadScript(ORT_ROOT + 'ort.wasm.min.js');
    await loadScript(VAD_ROOT + 'bundle.min.js');
    if (!globalThis.vad?.NonRealTimeVAD) throw new Error('Silero NonRealTimeVAD недоступен в браузере.');
  })();
  try { return await scriptsPromise; }
  catch (error) { scriptsPromise = null; throw error; }
}

// Checks actual WASM/model initialisation and a short inference, not only CDN availability.
export async function checkSileroRuntime() {
  await ensureSilero();
  const detector = await globalThis.vad.NonRealTimeVAD.new({
    model: 'v5', baseAssetPath: VAD_ROOT, onnxWASMBasePath: ORT_ROOT,
  });
  const samples = new Float32Array(16000 * 2);
  let windows = 0;
  for await (const _turn of detector.run(samples, 16000)) windows++;
  return { checkedSeconds: 2, speechWindows: windows };
}
export function rangesFromSpeechIntervals(speech, sampleCount, sampleRate = 16000) {
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) return [];
  const totalSeconds = sampleCount / sampleRate;
  const valid = speech.filter(s => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a,b) => a.start - b.start);
  const quietPoints = [];
  for (let i = 1; i < valid.length; i++) {
    const left = valid[i-1].end / 1000, right = valid[i].start / 1000;
    if (right - left >= .15) quietPoints.push((left + right) / 2);
  }
  const ranges = [];
  let from = 0;
  while (from < sampleCount) {
    const at = from / sampleRate, maxEnd = Math.min(totalSeconds, at + 29);
    const best = quietPoints.filter(t => t >= at + 10 && t <= maxEnd)
      .sort((a,b) => Math.abs(a - (at + 22)) - Math.abs(b - (at + 22)))[0];
    let end = Math.min(sampleCount, Math.round((best ?? maxEnd) * sampleRate));
    if (sampleCount - end > 0 && sampleCount - end < sampleRate / 2) end = sampleCount;
    if (end <= from) throw new Error('Ошибка границ Silero VAD.');
    ranges.push({ startSample: from, endSample: end, startSeconds: from / sampleRate,
      endSeconds: end / sampleRate, forcedCut: !best && end < sampleCount });
    from = end;
  }
  return ranges;
}
export async function sileroPauseRanges(decoded) {
  await ensureSilero();
  const samples = to16kMono(decoded);
  const detector = await globalThis.vad.NonRealTimeVAD.new({
    model: 'v5',
    baseAssetPath: VAD_ROOT,
    onnxWASMBasePath: ORT_ROOT,
  });
  const speech = [];
  for await (const {start, end} of detector.run(samples, 16000)) {
    speech.push({ start, end });
  }
  if (!speech.length) throw new Error('Silero не обнаружил речевых интервалов.');
  return { ranges: rangesFromSpeechIntervals(speech, samples.length), speechCount: speech.length };
}

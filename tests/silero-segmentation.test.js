import test from 'node:test';
import assert from 'node:assert/strict';
import { rangesFromSpeechIntervals } from '../site/silero-segmentation.js';
test('Silero time intervals select real quiet gaps while preserving every audio sample', () => {
  const speech = [
    { start: 0, end: 19500 }, { start: 21000, end: 42800 },
    { start: 45000, end: 65900 }, { start: 67000, end: 74500 },
  ];
  const ranges = rangesFromSpeechIntervals(speech, 75 * 16000);
  assert.ok(ranges.length > 1);
  assert.equal(ranges[0].startSample, 0);
  assert.ok(ranges.some(r => r.endSeconds > 19.5 && r.endSeconds < 21));
  for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i].startSample, ranges[i-1].endSample);
  assert.equal(ranges.at(-1).endSample, 75 * 16000);
  for (const r of ranges) assert.ok(r.endSample - r.startSample <= 29 * 16000);
});
test('No Silero speech gaps means safe bounded segments and no missing audio', () => {
  const ranges = rangesFromSpeechIntervals([{start:0,end:61000}], 61 * 16000);
  assert.equal(ranges[0].endSample, 29 * 16000);
  assert.equal(ranges.at(-1).endSample, 61 * 16000);
  assert.ok(ranges.some(r => r.forcedCut));
});

test('Continuous speech prefers a quieter nearby split without losing samples', () => {
  const pcm = new Float32Array(61 * 16000);
  pcm.fill(0.35);
  pcm.fill(0, 27 * 16000, Math.round(27.4 * 16000));
  const ranges = rangesFromSpeechIntervals([{start:0,end:61000}], pcm.length, 16000, pcm);
  assert.ok(ranges[0].endSeconds > 26.7 && ranges[0].endSeconds < 27.6);
  assert.equal(ranges[0].forcedCut, true);
  assert.equal(ranges.at(-1).endSample, pcm.length);
  for (let i=1;i<ranges.length;i++) assert.equal(ranges[i].startSample,ranges[i-1].endSample);
});

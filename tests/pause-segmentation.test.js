import test from 'node:test';
import assert from 'node:assert/strict';
import { pauseAwareRanges, SEGMENTATION_VERSION } from '../site/pause-segmentation.js';
import { createPauseCheckpoint, readPauseCheckpoint } from '../site/pause-checkpoint.js';

function fakeAudio(seconds, quietAt = []) {
  const sampleRate = 16000;
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const quiet = quietAt.some(([a,b]) => t >= a && t < b);
    samples[i] = quiet ? 0 : (i % 4 < 2 ? .12 : -.12);
  }
  return { sampleRate, length: samples.length, numberOfChannels: 1,
    getChannelData: () => samples };
}
test('ranges cover whole audio without gaps or overlaps and stay below worker 30s', () => {
  const ranges = pauseAwareRanges(fakeAudio(74, [[20,21],[43,44],[65,66]]));
  assert.ok(ranges.length >= 3);
  assert.equal(ranges[0].startSample, 0);
  for (let i = 0; i < ranges.length; i++) {
    assert.ok(ranges[i].endSample > ranges[i].startSample);
    assert.ok(ranges[i].endSample - ranges[i].startSample <= 29.5 * 16000);
    if (i) assert.equal(ranges[i].startSample, ranges[i - 1].endSample);
  }
  assert.equal(ranges.at(-1).endSample, 74 * 16000);
  assert.ok(ranges.some(r => r.endSeconds >= 20 && r.endSeconds <= 21));
});
test('short final tail remains valid for ASR', () => {
  const ranges = pauseAwareRanges(fakeAudio(29.25));
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].endSample, 29.25 * 16000);
});
test('pause checkpoint round-trips exact ranges and rejects wrong file', () => {
  const ranges = pauseAwareRanges(fakeAudio(47, [[19,20]]));
  const file = { name: 'test.mp3', size: 100, lastModified: 42 };
  const segments = [{ startSeconds: ranges[0].startSeconds, text: 'Пример распознавания' }];
  const cp = createPauseCheckpoint({ file, durationSeconds: 47, modelKey: 'medium', ranges, segments });
  assert.equal(cp.segmentation, SEGMENTATION_VERSION);
  assert.deepEqual(readPauseCheckpoint(JSON.stringify(cp), file).ranges, cp.ranges);
  assert.equal(readPauseCheckpoint(JSON.stringify(cp), file).nextIndex, 1);
  assert.throws(() => readPauseCheckpoint(JSON.stringify(cp), { ...file, size: 101 }), /другому файлу/);
});

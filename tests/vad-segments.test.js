import test from 'node:test';
import assert from 'node:assert/strict';
import { planSpeechWindows } from '../site/vad-segments.js';

test('cuts on VAD speech boundaries rather than fixed 25-second grid', () => {
  assert.deepEqual(planSpeechWindows([
    {startSeconds: 1, endSeconds: 4},
    {startSeconds: 12, endSeconds: 17},
  ], 31), [
    {startSeconds: .8,endSeconds:4.2,speechStartSeconds:1,speechEndSeconds:4},
    {startSeconds:11.8,endSeconds:17.2,speechStartSeconds:12,speechEndSeconds:17},
  ]);
});
test('merges small gaps and preserves original speech extent', () => {
  const windows=planSpeechWindows([{startSeconds:1,endSeconds:3},{startSeconds:3.2,endSeconds:7}],10);
  assert.equal(windows.length,1);
  assert.equal(windows[0].speechStartSeconds,1);
  assert.equal(windows[0].speechEndSeconds,7);
});
test('long speech has bounded windows with overlap', () => {
  const windows=planSpeechWindows([{startSeconds:0,endSeconds:90}],90);
  assert.ok(windows.length>=4);
  for(const w of windows) assert.ok(w.endSeconds-w.startSeconds<=25.00001);
  for(let i=1;i<windows.length;i++) assert.ok(windows[i].startSeconds<=windows[i-1].endSeconds);
  assert.equal(windows.at(-1).speechEndSeconds,90);
});
test('rejects invalid model timestamps', () => {
  assert.throws(()=>planSpeechWindows([{startSeconds:-1,endSeconds:4}],12));
  assert.throws(()=>planSpeechWindows([{startSeconds:4,endSeconds:3}],12));
  assert.deepEqual(planSpeechWindows([],12),[]);
});

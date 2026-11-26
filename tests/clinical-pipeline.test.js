import test from 'node:test';
import assert from 'node:assert/strict';
import { createPauseCheckpoint, readPauseCheckpoint } from '../site/pause-checkpoint.js';
import { reviewCues } from '../site/quality.js';
test('checkpoint preserves new review markers and forced-cut metadata', () => {
  const file={ name:'anon.wav',size:10,lastModified:100 };
  const ranges=[{ startSample:0,endSample:16_000*29,forcedCut:true },{startSample:16_000*29,endSample:16_000*34,forcedCut:false}];
  const segments=[{startSeconds:0,text:'Болит',boundaryReview:true,clinicalReview:true}];
  const cp=createPauseCheckpoint({file,durationSeconds:34,modelKey:'medium',ranges,segments});
  const imported=readPauseCheckpoint(JSON.stringify(cp),file);
  assert.equal(imported.ranges[0].forcedCut,true);
  assert.equal(imported.segments[0].clinicalReview,true);
  assert.equal(imported.segments[0].boundaryReview,true);
});
test('review flags uncertainty without changing the source text', () => {
  const seg={startSeconds:29,text:'Нет, принимал 10 мг.',boundaryReview:true,clinicalReview:true};
  const cues=reviewCues([seg]);
  assert.ok(cues.some(x=>x.category==='стык фрагментов'));
  assert.ok(cues.some(x=>x.category==='разногласие клинических фактов'));
  assert.equal(seg.text,'Нет, принимал 10 мг.');
});

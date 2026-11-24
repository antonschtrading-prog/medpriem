import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpeakerTurns, speakerForWindow, diarizedTranscript } from '../site/diarization.js';

test('normalizes real engine speaker ids in first-occurrence order', () => {
  const result=normalizeSpeakerTurns([{start:2,end:4,speaker:5},{start:0,end:2,speaker:9}],5);
  assert.deepEqual(result,[{startSeconds:0,endSeconds:2,speaker:1},{startSeconds:2,endSeconds:4,speaker:2}]);
});
test('rejects invalid or outside audio intervals', () => {
  const result=normalizeSpeakerTurns([{start:-2,end:1,speaker:0},{start:4,end:7,speaker:1},{start:2,end:1,speaker:3},{start:0,end:0,speaker:8}],5);
  assert.equal(result.length,2);
  assert.equal(result[0].startSeconds,0);
  assert.equal(result[1].endSeconds,5);
});
test('never assigns one voice to a mixed 25-second window', () => {
  const turns=normalizeSpeakerTurns([{start:0,end:9,speaker:0},{start:9,end:25,speaker:1}],25);
  assert.equal(speakerForWindow(0,25,turns),null);
  assert.equal(speakerForWindow(9,25,turns),2);
});
test('keeps the text and marks a mixed-speaker block uncertain', () => {
  const turns=normalizeSpeakerTurns([{start:0,end:9,speaker:0},{start:9,end:25,speaker:1}],25);
  const result=diarizedTranscript([{startSeconds:0,text:'Врач спрашивает, пациент отвечает.'}],turns,25,s=>String(s));
  assert.match(result,/Говорящий не определён/);
  assert.match(result,/Врач спрашивает, пациент отвечает/);
});
test('labels only predominantly single-speaker ASR windows', () => {
  const turns=normalizeSpeakerTurns([{start:0,end:24.8,speaker:0},{start:24.8,end:25,speaker:1}],25);
  assert.equal(speakerForWindow(0,25,turns),1);
});

test('timestamped Whisper chunks split text on real acoustic turn boundary', () => {
  const turns=normalizeSpeakerTurns([{start:0,end:1.5,speaker:0},{start:1.5,end:3,speaker:1}],3);
  const segments=[{startSeconds:0,text:'Привет. Здравствуйте.',timedChunks:[
    {text:'Привет.',timestamp:[0.1,1.1]},
    {text:' Здравствуйте.',timestamp:[1.8,2.8]},
  ]}];
  const result=diarizedTranscript(segments,turns,3,s=>s.toFixed(1));
  assert.match(result,/Говорящий 1.*Привет/);
  assert.match(result,/Говорящий 2.*Здравствуйте/);
  assert.equal((result.match(/Привет/g)||[]).length,1);
  assert.equal((result.match(/Здравствуйте/g)||[]).length,1);
});
test('bad timestamped chunks cannot silently alter transcript words', () => {
  const turns=normalizeSpeakerTurns([{start:0,end:2,speaker:0}],2);
  const result=diarizedTranscript([{startSeconds:0,text:'Два важных слова',timedChunks:[{text:'Два',timestamp:[0,1]}]}],turns,2,s=>String(s));
  assert.match(result,/Два важных слова/);
});

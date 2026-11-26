import test from 'node:test';
import assert from 'node:assert/strict';
import { recognitionWindow, reconcileBoundary } from '../site/boundary-continuity.js';

test('context only after forced cut, below Whisper 30 sec limit', () => {
  const r = [
    {startSample:0,endSample:29*16000,forcedCut:true},
    {startSample:29*16000,endSample:58*16000,forcedCut:false},
    {startSample:58*16000,endSample:60*16000,forcedCut:false},
  ];
  assert.equal(recognitionWindow(r,0).overlapSeconds,0);
  assert.equal(recognitionWindow(r,1).overlapSeconds,0.65);
  assert.ok(recognitionWindow(r,1).endSample-recognitionWindow(r,1).startSample <= 30*16000);
  assert.equal(recognitionWindow(r,2).overlapSeconds,0);
});
test('exact repeated words removed, no invented text', () => {
  const r=reconcileBoundary('Принимаю каждый день лекарство по утрам', 'лекарство по утрам после еды.', true);
  assert.equal(r.text, 'после еды.');
  assert.equal(r.removedWords,3);
  assert.equal(r.requiresReview,false);
});
test('ambiguous and different words preserved for listening', () => {
  const original='в двадцать сантиметров';
  assert.deepEqual(reconcileBoundary('расстояние двадцать сантиметров', original, true),
    {text:original,removedWords:0,requiresReview:true});
  assert.equal(reconcileBoundary('да', 'нет', false).requiresReview,false);
});

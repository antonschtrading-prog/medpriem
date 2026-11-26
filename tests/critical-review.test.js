import test from 'node:test';
import assert from 'node:assert/strict';
import { criticalDisagreement, meritsClinicalRetry } from '../site/critical-review.js';
test('numbers and doses are checked conservatively', () => {
  assert.equal(meritsClinicalRetry('Принимать по 5 мг вечером.'), true);
  assert.deepEqual(criticalDisagreement('Принимать по 5 мг', 'Принимать по 50 мг'), ['numbers']);
});
test('opposite negations cannot silently replace a transcript', () => {
  assert.deepEqual(criticalDisagreement('Боли нет', 'Боль есть'), ['negation']);
  assert.equal(meritsClinicalRetry('Обычно вечером я гуляю.'), false);
});
test('unrelated grammar cannot change critical facts', () => {
  assert.deepEqual(criticalDisagreement('Принимать 10 мг после еды', 'Принимаю 10 мг после еды'), []);
});

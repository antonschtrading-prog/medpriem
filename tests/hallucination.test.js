import test from 'node:test';
import assert from 'node:assert/strict';
import { repetitionAudit, preferRetry } from '../site/hallucination.js';
import { resolveModel } from '../site/model-options.js';

test('Base 08:45 hallucination detected', () => {
  assert.equal(repetitionAudit(('Я не знаю, что это было. ').repeat(55)).suspicious, true);
});
test('Base 14:35 hallucination detected', () => {
  assert.equal(repetitionAudit(('Не обманывай ни одного пинашка. ').repeat(40)).suspicious, true);
});
test('Small 18:45 one-word loop detected', () => {
  assert.equal(repetitionAudit(('как, ').repeat(180)).suspicious, true);
});
test('normal interview not flagged', () => {
  const text = 'Уточните, пожалуйста, какие жалобы появились в течение последней недели. После еды бывает слабость, но утром я чувствую себя нормально. Принимаю назначенные лекарства ежедневно, однако хочу обсудить результат анализа и время повторного обследования.';
  assert.equal(repetitionAudit(text).suspicious, false);
});
test('short sentences do not trigger loop guard', () => {
  assert.equal(repetitionAudit('Да, да, конечно.').suspicious, false);
});
test('retry replaces corrupt fragment with clean result', () => {
  const bad = ('я не знаю что это было ').repeat(40);
  const good = 'Я почувствовал, что человеку стало плохо, позвонил ему, и ситуация прояснилась.';
  assert.equal(preferRetry(bad,good).text,good);
  assert.equal(preferRetry(bad,good).improved,true);
});
test('retry preserves suspicious original if second candidate also loops', () => {
  const bad = ('не обманывай ').repeat(60);
  const other = ('как ').repeat(130);
  assert.equal(preferRetry(bad,other).text,bad);
  assert.equal(preferRetry(bad,other).flagged,true);
});
test('model registry includes independent Russian CTC family', () => {
  assert.equal(resolveModel('xlsr_ru').family, 'ctc');
  assert.equal(resolveModel('small').family, 'whisper');
  assert.equal(resolveModel('medium').experimental, true);
});
test('unknown model rejected', () => {
  assert.throws(() => resolveModel('nonexistent'));
});

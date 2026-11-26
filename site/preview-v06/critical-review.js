// Conservative clinical fact comparison between two ASR passes.
// No automatic fact correction and no confidence claims.
const numbers = text => [...String(text).matchAll(/(?<![\p{L}\d])\d+(?:[.,]\d+)?(?![\p{L}\d])/gu)].map(x => x[0].replace('.', ','));
const units = text => [...String(text).toLocaleLowerCase('ru-RU').matchAll(/(?<![\p{L}])(?:мкг|мг|мл|ммоль|ме|единиц|таблетк[а-яё]*|процент[а-яё]*)(?![\p{L}])/gu)].map(x => x[0]);
const negation = text => [...String(text).toLocaleLowerCase('ru-RU').matchAll(/(?<![\p{L}])(?:не|нет|без|никогда|отменил[а-яё]*|прекратил[а-яё]*)(?![\p{L}])/gu)].map(x => x[0]);
const medications = text => [...String(text).toLocaleLowerCase('ru-RU').matchAll(/(?<![\p{L}])(?:инсулин[а-яё]*|метформин[а-яё]*|левотироксин[а-яё]*|тироксин[а-яё]*|эутирокс[а-яё]*|глюкофаж[а-яё]*)(?![\p{L}])/gu)].map(x => x[0]);
export function criticalFacts(text) {
  return { numbers: numbers(text), units: units(text), negation: negation(text), medications: medications(text) };
}
export function meritsClinicalRetry(text) {
  const x = criticalFacts(text);
  return x.numbers.length > 0 || x.units.length > 0 || x.negation.length > 0 || x.medications.length > 0;
}
export function criticalDisagreement(a, b) {
  const x = criticalFacts(a), y = criticalFacts(b);
  return Object.keys(x).filter(k => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
}

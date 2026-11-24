// Russian-only audit cues and benchmark metrics. No diagnosis or automatic medication correction.
// These checks DO NOT measure acoustic confidence. Every flagged fact requires listening to audio.
export function normalizeRussian(text) {
  return String(text ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    .replace(/^\s*\[\d{2}:\d{2}:\d{2}\]\s*/gm, ' ')
    .replace(/внимание: неполная расшифровка/gi, ' ')
    .replace(/(\d)[,.](\d)/g, '$1¤$2').replace(/[^а-яa-z0-9¤]+/gi, ' ').replace(/¤/g, ',').trim().replace(/\s+/g, ' ');
}
export function russianTokens(text) { const t = normalizeRussian(text); return t ? t.split(' ') : []; }
function distance(a,b) {
  if (b.length > a.length) [a,b] = [b,a];
  let prev = Array.from({length:b.length+1}, (_,i)=>i);
  for (let i=1;i<=a.length;i++) {
    const next=[i];
    for(let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+Number(a[i-1]!==b[j-1]));
    prev=next;
  }
  return prev[b.length];
}
export function benchmarkRussian(reference, recognized) {
  const expected=russianTokens(reference), actual=russianTokens(recognized);
  if (!expected.length) throw new Error('Введите эталонный русский текст для сравнения.');
  // Full-hour Levenshtein is quadratic and could freeze mobile Safari. Evaluate excerpts.
  if (expected.length > 1500 || actual.length > 1500) throw new Error('Сравните отрывок до 1500 слов: полный часовой текст может перегрузить браузер.');
  const edits=distance(expected,actual);
  const charsExpected=normalizeRussian(reference).replace(/ /g,'');
  const charsActual=normalizeRussian(recognized).replace(/ /g,'');
  const charErrors=distance([...charsExpected],[...charsActual]);
  const numbers = value => [...String(value).matchAll(/(?<![\p{L}\d])\d+(?:[.,]\d+)?(?![\p{L}\d])/gu)].map(m => m[0].replace('.', ','));
  const refNumbers=numbers(reference.replace(/^\s*\[\d{2}:\d{2}:\d{2}\]\s*/gm,''));
  const gotNumbers=numbers(recognized.replace(/^\s*\[\d{2}:\d{2}:\d{2}\]\s*/gm,''));
  return { numericReference:refNumbers, numericRecognized:gotNumbers, numericErrors:distance(refNumbers,gotNumbers), referenceWords:expected.length, recognizedWords:actual.length, wordErrors:edits,
    wer:edits/expected.length, referenceChars:[...charsExpected].length,
    characterErrors:charErrors, cer:charErrors/[...charsExpected].length };
}
const TERM_RX=/(?<![\p{L}\d])(?:ттг|т4|т3|гликированн[а-яё]*|глюкоз[а-яё]*|инсулин[а-яё]*|метформин[а-яё]*|тироксин[а-яё]*|левотироксин[а-яё]*|гипотиреоз[а-яё]*|тиреотропн[а-яё]*|глюкофаж[а-яё]*|эутирокс[а-яё]*|диабет[а-яё]*)(?![\p{L}\d])/giu;
const NUM_RX=/(?<![\p{L}\d])\d+(?:[.,]\d+)?(?![\p{L}\d])/gu;
const DOSE_RX=/(?<![\p{L}\d])(?:мкг|мг|мл|ммоль\s*\/?\s*л|мме\s*\/?\s*л|ме|единиц[а-яё]*|ед\.|таблет[а-яё]*|процент[а-яё]*|%)(?![\p{L}\d])/giu;
const UNCERTAIN_RX=/(?<![\p{L}\d])(?:неразборчиво|не\s+расслышал[а-яё]*|не\s+уверен[а-яё]*|кажется|возможно)(?![\p{L}\d])/giu;
const MAX_FINDINGS=75;
export function reviewCues(segments) {
  const output=[];
  for (let i=0; i<segments.length;i++) {
    const s=segments[i], text=String(s.text??'');
    const add=(category, excerpt)=>{ if (output.length<MAX_FINDINGS) output.push({segmentIndex:i,startSeconds:s.startSeconds,category,excerpt}); };
    if (!text.trim() || /\[речь не распознана\]/i.test(text)) { add('нет текста','Проверьте, была ли речь на этом участке'); continue; }
    for (const [category,re] of [['число',NUM_RX],['единица измерения',DOSE_RX],['медицинский термин',TERM_RX],['неуверенное выражение',UNCERTAIN_RX]]) {
      re.lastIndex=0;
      for (const match of text.matchAll(re)) {
        add(category,match[0]);
        if(output.length>=MAX_FINDINGS) return output;
      }
    }
    const words=russianTokens(text);
    if (words.length>=8 && new Set(words).size<=2) add('повторение','Проверьте повторяющийся текст, возможна ошибка распознавания');
  }
  return output;
}

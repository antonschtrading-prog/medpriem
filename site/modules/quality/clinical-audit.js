// Flags only, never automatic medical corrections.
const words=s=>String(s).toLocaleLowerCase('ru-RU').normalize('NFC').match(/[\p{L}\p{N}]+/gu)||[];
const neg=/^(?:не|нет|без|отрицает|отрицал|отрицала|нельзя|противопоказано)$/u;
const number=/^(?:ноль|один|одна|одно|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|сто|двести|тысяча|\d+)$/u;
const unit=/^(?:мг|г|кг|мл|л|мм|см|ммоль|ед|мкг|миллиграмм\p{L}*|микрограмм\p{L}*|миллилитр\p{L}*|таблет\p{L}*)$/u;
function cues(text){return words(text).flatMap((w,i,a)=>neg.test(w)||number.test(w)||unit.test(w)?[{word:w,kind:neg.test(w)?'negation':number.test(w)?'number':'unit',context:a.slice(Math.max(0,i-2),i+3).join(' ')}]:[]);}
export function clinicalAudit(primary,alternate){const a=cues(primary),b=cues(alternate);const key=x=>x.kind+':'+x.word+':'+x.context;const diff=(x,y)=>{const counts=new Map();for(const t of y)counts.set(key(t),(counts.get(key(t))||0)+1);return x.filter(t=>{const k=key(t),n=counts.get(k)||0;if(n){counts.set(k,n-1);return false;}return true;});};const missing=diff(a,b),added=diff(b,a);return {primary,alternate,missing,added,needsReview:missing.length+added.length>0,automaticCorrection:false};}

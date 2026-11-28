import {acceptFormatting} from './lexical-gate.js';
const critical=/\d|(?:^|[^\p{L}])(?:не|нет|без|нельзя|мг|мкг|мл|ед|противопоказано|отрицает|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|сто|тысяча)(?=$|[^\p{L}])/iu;
export function safeFormat(raw,proposal){
 const first=acceptFormatting(raw,proposal);if(!first.accepted)return first;
 if(critical.test(raw)){
 const canon=s=>s.trim().toLocaleLowerCase('ru-RU').normalize('NFC').replace(/\.$/u,'');
 if(canon(raw)!==canon(proposal))return {text:raw,accepted:false,reason:'critical-punctuation'};
 }
 return first;
}
export async function formatRows(rows,formatter,{signal}={}){
 const result=[];for(const row of rows){if(signal?.aborted)throw new DOMException('Aborted','AbortError');const raw=String(row.text??'');
 try{const proposal=await formatter(raw);if(signal?.aborted)throw new DOMException('Aborted','AbortError');result.push({...row,formatted:safeFormat(raw,proposal)});}
 catch(e){if(signal?.aborted||e?.name==='AbortError')throw e;result.push({...row,formatted:{text:raw,accepted:false,reason:'formatter-error'}});}
 }return result;
}

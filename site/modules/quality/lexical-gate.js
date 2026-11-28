// Conservative punctuation-only gate; never accept changed words, numbers, or lexical punctuation.
const lexical=/[\p{L}\p{M}\p{N}]+(?:[-‑–.,/:%+−][\p{L}\p{M}\p{N}]+)*/gu;
const normalize=s=>s.toLocaleLowerCase('ru-RU').normalize('NFC');
export function tokens(s){return [...String(s).matchAll(lexical)].map(m=>normalize(m[0]));}
export function acceptFormatting(raw,proposal){
 if(typeof raw!=='string'||typeof proposal!=='string')throw new TypeError('Expected text');
 const a=tokens(raw),b=tokens(proposal);
 // Preserve everything except whitespace, case and ordinary sentence punctuation.
 const strip=s=>normalize(s).replace(/[\s,.!?;:…]/gu,'');
 if(a.length!==b.length||a.some((x,i)=>x!==b[i])||strip(raw)!==strip(proposal))return {text:raw,accepted:false,reason:'lexical-change'};
 // Do not insert or remove punctuation inside a number or between adjacent numeric words.
 const numeric=s=>[...s.matchAll(/\d+(?:[.,:/−–-]\d+)*\s*%?/gu)].map(m=>m[0].trim()).join('|');
 if(numeric(raw)!==numeric(proposal))return {text:raw,accepted:false,reason:'numeric-change'};
 return {text:proposal,accepted:true};
}
export function reviewCandidates(rows,format){
 return rows.map((r,index)=>{const raw=String(r.text??'');try{return {index,raw,...acceptFormatting(raw,format(raw))};}catch(e){return {index,raw,text:raw,accepted:false,reason:'formatter-error'};}});
}

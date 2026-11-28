import {safeFormat} from './format-safe.js';
// Insert only punctuation after exact word-ending offsets, never replace words.
// Offsets are UTF-16 positions in original string; uncertain labels are ignored.
export function proposePunctuation(raw,predictions,minScore=.9){
 const inserts=new Map();
 for(const p of predictions){if(!Number.isInteger(p.end)||p.end<=0||p.end>raw.length||!Number.isFinite(p.score)||p.score<minScore||!['.',',','?'].includes(p.label))continue;
 if(!/[\p{L}\p{N}]/u.test(raw[p.end-1])||p.end<raw.length&&!/\s/u.test(raw[p.end]))continue;
 if(inserts.has(p.end)&&inserts.get(p.end)!==p.label)return {text:raw,accepted:false,reason:'conflicting-labels'};
 inserts.set(p.end,p.label);}
 let proposal=raw;for(const [end,label] of [...inserts].sort((a,b)=>b[0]-a[0]))proposal=proposal.slice(0,end)+label+proposal.slice(end);
 return safeFormat(raw,proposal);
}

// Compare inserted punctuation at exact original-character boundaries; no lexical normalizing.
export function punctuationEvents(raw,text){
 let i=0;const out=[];for(const ch of text){if(raw[i]===ch){i+=ch.length;continue;}if(!['.',',','?','!',';',':'].includes(ch))throw Error('Lexical change in punctuation reference');out.push(i+':'+ch);}
 if(i!==raw.length)throw Error('Truncated reference');return new Set(out);
}
export function scorePunctuation(rows){
 let tp=0,fp=0,fn=0,changed=0;
 for(const {raw,reference,actual} of rows){const a=punctuationEvents(raw,actual),b=punctuationEvents(raw,reference);changed+=a.size>0?1:0;for(const x of a)b.has(x)?tp++:fp++;for(const x of b)if(!a.has(x))fn++;}
 return {rows:rows.length,changed,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null};
}

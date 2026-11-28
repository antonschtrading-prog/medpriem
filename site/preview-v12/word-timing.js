// Adaptation of GigaAMGUI normalize_chunk_words: use real ASR word timestamps only.
export function normalizeWindowChunks(chunks,text,window,range,sampleRate=16000){
 if(!Array.isArray(chunks)||!chunks.length)return [];
 const canonical=x=>String(x??'').replace(/\s+/gu,'');
 const target=canonical(text);if(!target)return [];
 // Reconstruct retained suffix after seam stitching, using actual model chunks.
 let start=-1;
 for(let i=0;i<chunks.length;i++){if(canonical(chunks.slice(i).map(c=>c.text).join(''))===target){start=i;break;}}
 if(start<0)return [];
 const shift=(window.startSample-range.startSample)/sampleRate;
 const duration=(range.endSample-range.startSample)/sampleRate;
 const result=[];let previousEnd=0;
 for(const c of chunks.slice(start)){
   const a=c.timestamp?.[0],b=c.timestamp?.[1];
   if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return [];
   const lo=Math.max(0,previousEnd,a+shift),hi=Math.min(duration,b+shift);
   if(hi<=lo)return []; // no invented time, no silent omission
   result.push({text:c.text,timestamp:[lo,hi]});previousEnd=hi;
 }
 return result;
}

// CTC Viterbi forced alignment, following standard blank-expanded trellis.
// Reference: WhisperX alignment.py (BSD-2-Clause); independent implementation.
// Never substitute recognized text, fabricate time, or accept unsupported tokens.
export function tokenizeForAlignment(text,tokens,blank){
 const matches=[...String(text).matchAll(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu)];
 const vocab=new Map();tokens.forEach((v,i)=>{if(i!==blank&&typeof v==='string'&&!/^<.*>$/.test(v)&&v.length)vocab.set(v,i);});
 const max=Math.min(64,Math.max(1,...[...vocab.keys()].map(x=>x.length)));
 const groups=[];const ids=[];
 for(const m of matches){
  const word=m[0].toLowerCase();
  const variants=['▁'+word,word,'▁'+word.replace(/ё/g,'е'),word.replace(/ё/g,'е')];let found=null;
  for(const w of variants){
   const dp=Array(w.length+1).fill(null);dp[0]=[];
   for(let i=0;i<w.length;i++)if(dp[i])for(let n=1;n<=Math.min(max,w.length-i);n++){
    const id=vocab.get(w.slice(i,i+n));if(id===undefined)continue;
    const candidate=[...dp[i],id];if(!dp[i+n]||candidate.length<dp[i+n].length)dp[i+n]=candidate;
   }
   if(dp[w.length]?.length){found=dp[w.length];break;}
  }
  if(!found)return null;
  groups.push({start:ids.length,end:ids.length+found.length,index:m.index});ids.push(...found);
 }
 if(!ids.length)return null;
 // Preserve punctuation and exact original text including spaces.
 return {ids,groups:groups.map((g,i)=>({...g,text:String(text).slice(i?g.index:0,groups[i+1]?.index??String(text).length)}))};
}
export function forceAlign(encoded,ids,blank,seconds,{minPosterior=.08,minMeanPosterior=.2}={}){
 const {encodedData:data,encodedDims:dims,encodedLayout:layout,encodedLength:length}=encoded;
 const stride=layout==='BVT'?dims[2]:dims[1],vocab=layout==='BVT'?dims[1]:dims[2];
 const frames=Math.min(length,stride),states=ids.length*2+1;
 if(!Number.isFinite(seconds)||seconds<=0||!Number.isInteger(frames)||frames<ids.length||frames*states>2e6||!Number.isInteger(blank)||blank<0||blank>=vocab||ids.some(i=>!Number.isInteger(i)||i<0||i>=vocab||i===blank))return null;
 const at=(t,v)=>Number(data[layout==='BVT'?v*stride+t:t*vocab+v]);
 const labels=Array.from({length:states},(_,s)=>s%2?ids[(s-1)/2]:blank);
 const back=new Uint8Array(frames*states);let prev=new Float64Array(states).fill(-Infinity);prev[0]=0;
 const norm=new Float64Array(frames);
 for(let t=0;t<frames;t++){
  let max=-Infinity;for(let v=0;v<vocab;v++)max=Math.max(max,at(t,v));if(!Number.isFinite(max))return null;
  let sum=0;for(let v=0;v<vocab;v++)sum+=Math.exp(at(t,v)-max);norm[t]=max+Math.log(sum);
  const next=new Float64Array(states).fill(-Infinity);
  for(let s=0;s<states;s++){
   let best=prev[s],step=0;if(s&&prev[s-1]>best){best=prev[s-1];step=1;}
   if(s>1&&s%2&&labels[s]!==labels[s-2]&&prev[s-2]>best){best=prev[s-2];step=2;}
   next[s]=best+at(t,labels[s])-norm[t];back[t*states+s]=step;
  }prev=next;
 }
 let s=prev[states-1]>=prev[states-2]?states-1:states-2;if(!Number.isFinite(prev[s]))return null;
 const spans=ids.map(()=>({start:Infinity,end:-1,peak:0}));
 for(let t=frames-1;t>=0;t--){
  if(s%2){const g=spans[(s-1)/2];g.start=Math.min(g.start,t);g.end=Math.max(g.end,t+1);g.peak=Math.max(g.peak,Math.exp(at(t,labels[s])-norm[t]));}
  s-=back[t*states+s];
 }
 if(s!==0||spans.some(g=>g.end<=g.start||g.peak<minPosterior)||spans.reduce((a,g)=>a+g.peak,0)/spans.length<minMeanPosterior)return null;
 return spans.map(g=>({start:g.start*seconds/frames,end:g.end*seconds/frames,posterior:g.peak}));
}
export function alignTranscript(encoded,text,tokens,blank,seconds,options){
 const input=tokenizeForAlignment(text,tokens,blank);if(!input)return null;
 const spans=forceAlign(encoded,input.ids,blank,seconds,options);if(!spans)return null;
 return input.groups.map(g=>({text:g.text,timestamp:[spans[g.start].start,spans[g.end-1].end]}));
}

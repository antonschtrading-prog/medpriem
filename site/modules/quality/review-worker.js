import {createPunctuator} from './punctuation-runtime.js';
let running=false;
self.onmessage=async({data})=>{
 if(running||data?.type!=='format')return;running=true;let p;
 try{
  p=await createPunctuator({revision:'ee31fdfc5304f876ea3b0dd72d30eda7e940b2b1'});
  const results=[];
  for(const [i,raw] of data.rows.entries()){
   let proposal={text:raw,accepted:false,reason:'untested-window'};
   if(raw.trim()&&raw.length<=600&&raw.trim().split(/\s+/u).length<=80){
    try{proposal=(await p.propose(raw)).proposal;}catch{proposal={text:raw,accepted:false,reason:'formatter-error'};}
   }
   results.push(proposal);self.postMessage({type:'progress',done:i+1,total:data.rows.length});
  }
  self.postMessage({type:'complete',results});
 }catch(e){self.postMessage({type:'error',message:String(e.message||e)});}
 finally{try{await p?.dispose();}finally{running=false;}}
};
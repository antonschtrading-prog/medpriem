import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage();
page.on('pageerror',e=>console.error('PAGE ERROR',e.message));
try{
 await page.goto('http://127.0.0.1:8765/preview-v10/');
 const audio=Array.from(new Uint8Array(await fs.readFile('/tmp/medpriem-smoke.wav')));
 const results=await page.evaluate(async(audio)=>{
  const ctx=new AudioContext({sampleRate:16000});
  const wav=await ctx.decodeAudioData(Uint8Array.from(audio).buffer);
  const pcm=wav.getChannelData(0).slice();await ctx.close();
  async function ask(file,message,expect){
   const worker=new Worker(file,{type:'module'});
   try{return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('worker timeout: '+message.modelKey)),240000);
    worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message||'worker startup'));};
    worker.onmessage=({data})=>{if(data.type===expect){clearTimeout(timer);resolve(data);}else if(data.type==='error'||data.type==='diarization-error'||data.type==='alignment-error'){clearTimeout(timer);reject(Error(data.message));}};
    worker.postMessage({...message,samples:pcm.slice()});
   });}finally{worker.terminate();}
  }
  const outcomes=[];
  for(const key of ['gigaam','gigaam_e2e_rnnt','gigaam_e2e_ctc']){
   try{
    const r=await ask('./asr-worker.js',{type:'recognize',id:key,modelKey:key},'recognized');
    const text=String(r.text||'');
    if(!/[а-яё]{3}/i.test(text))throw Error('Empty/non-Russian transcript: '+text);
    outcomes.push({key,ok:true,text,words:r.chunks?.length||0});
   }catch(e){outcomes.push({key,ok:false,error:e.message});}
  }
  try{
   const r=await ask('./diarization-worker.js',{type:'diarize',id:1},'diarization-result');
   if(!Array.isArray(r.segments)||!r.segments.length)throw Error('No speaker turns');
   const {normalizeSpeakerTurns}=await import('./diarization.js');
   const turns=normalizeSpeakerTurns(r.segments,pcm.length/16000);
   if(!turns.length)throw Error('No valid normalized turns');
   outcomes.push({key:'diarization',ok:true,turns});
  }catch(e){outcomes.push({key:'diarization',ok:false,error:e.message});}
  try{
   const r=await ask('./alignment-worker.js',{type:'align',id:'forced',text:'добрый день'},'aligned');
   const bad=await ask('./alignment-worker.js',{type:'align',id:'negative',text:'фиолетовый трактор космонавт'},'aligned');
   outcomes.push({key:'forced-alignment',ok:r.accepted&&r.chunks.length===2&&r.chunks[0].timestamp[0]<2&&r.chunks[1].timestamp[1]<4.67&&!bad.accepted,accepted:r.accepted,chunks:r.chunks,diagnostic:r.diagnostic,negativeRejected:!bad.accepted});
  }catch(e){outcomes.push({key:'forced-alignment',ok:false,error:e.message});}
  return outcomes;
 },audio);
 console.log(JSON.stringify(results,null,2));
 if(results.some(r=>!r.ok))process.exitCode=1;
}finally{await browser.close();}

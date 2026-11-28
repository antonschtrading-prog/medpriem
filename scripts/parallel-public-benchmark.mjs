import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const key=process.env.MODEL;
assert.ok(['gigaam','gigaam_e2e_rnnt','gigaam_e2e_ctc','medium','turbo_ru'].includes(key));
const audio=await fs.readFile('/tmp/public-dialogue.wav');
const hash=createHash('sha256').update(audio).digest('hex');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));
let result={key,source:'https://www.easyrussian.fm/99',startSeconds:153,endSeconds:190,hash,status:'failed'};
try{
 await page.goto('http://127.0.0.1:8765/preview-v11/benchmark.html');
 result={...result,...await page.evaluate(async({key,bytes})=>{
  const {runComparison}=await import('./benchmark-core.js');
  const {to16kMono}=await import('./audio.js');
  const {sileroPauseRanges}=await import('./silero-segmentation.js');
  const {pauseAwareRanges}=await import('./pause-segmentation.js');
  const ctx=new AudioContext({sampleRate:16000});
  const decoded=await ctx.decodeAudioData(Uint8Array.from(bytes).buffer);await ctx.close();
  let ranges,vad='silero';
  try{ranges=(await sileroPauseRanges(decoded)).ranges;}catch{ranges=pauseAwareRanges(decoded);vad='energy';}
  const pcm=to16kMono(decoded);
  function engine(){
   const w=new Worker('./asr-worker.js?v=11-benchmark',{type:'module'});let id=0;
   return {recognize:(samples,retry)=>new Promise((resolve,reject)=>{
    const current=++id;
    const finish=(fn,v)=>{clearTimeout(timer);w.onmessage=null;w.onerror=null;fn(v);};
    const timer=setTimeout(()=>finish(reject,Error('ASR timeout')),900000);
    w.onerror=e=>finish(reject,Error(e.message||'Worker error'));
    w.onmessage=({data})=>{if(data.id!==current)return;if(data.type==='recognized')finish(resolve,data);if(data.type==='error')finish(reject,Error(data.message));};
    w.postMessage({type:'recognize',id:current,modelKey:key,samples,retry},[samples.buffer]);
   }),close:()=>w.terminate()};
  }
  const [r]=await runComparison({ranges,pcm,keys:[key],createEngine:engine});
  // Public-source text is kept only in the short-lived result artifact, never committed to the repository.
  return {...r,ranges,vad,duration:decoded.duration};
 },{key,bytes:Array.from(audio)})};
}catch(e){result.error=e.message;}
finally{await browser.close();}
result.pageErrors=errors;
await fs.writeFile('benchmark-output/'+key+'.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({key,status:result.status,wallMs:result.wallMs,loadMs:result.loadMs,inferMs:result.inferMs,segments:result.rows?.length,error:result.error,errors},null,2));
if(result.status!=='complete'||errors.length)process.exitCode=1;

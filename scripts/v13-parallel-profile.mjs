import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/preview-v12/');
 const results=await page.evaluate(async bytes=>{
 const ctx=new AudioContext({sampleRate:16000});let pcm;try{pcm=(await ctx.decodeAudioData(Uint8Array.from(bytes).buffer)).getChannelData(0).slice();}finally{await ctx.close();}
 const {runAdaptive}=await import('./adaptive-core.js'),{pauseAwareRanges}=await import('./pause-segmentation.js'),{normalizeSpeakerTurns}=await import('./diarization.js');
 const decoded={sampleRate:16000,length:pcm.length,duration:pcm.length/16000,numberOfChannels:1,getChannelData:()=>pcm};
 const ranges=pauseAwareRanges(decoded);
 async function ask(w,data,ok,err){return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worker timeout')),180000);w.onmessage=({data:r})=>{if(err(r)){clearTimeout(timer);reject(Error(r.message||r.error));}else if(ok(r)){clearTimeout(timer);resolve(r);}};w.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};w.postMessage(data,[data.samples.buffer]);});}
 const out=[];for(const parallel of [false,true,false]){
  const threads=parallel?1:2,started=performance.now();let dWorker=null,diarJob=null,diarStart=null,diarWallMs=null;
  async function diar(){dWorker=new Worker('./acceleration-lab-worker.js',{type:'module'});diarStart=performance.now();try{const r=await ask(dWorker,{threads,provider:'wasm',samples:pcm.slice()},r=>Array.isArray(r.segments),r=>!!r.error);return normalizeSpeakerTurns(r.segments,pcm.length/16000);}finally{diarWallMs=performance.now()-diarStart;dWorker.terminate();dWorker=null;}}
  const report={duration:pcm.length/16000,ranges,rows:[],timing:{},turns:[]};
  const createEngine=key=>{const w=new Worker('./asr-worker.js',{type:'module'});let id=0;return {recognize:samples=>ask(w,{type:'recognize',id:++id,modelKey:key,threads,samples},r=>r.type==='recognized',r=>r.type==='error'),close:()=>w.terminate()};};
  // Detached diarization result: only the existing adaptive writer mutates report.
  if(parallel)diarJob=diar().then(value=>({value}),error=>({error:String(error.message||error)}));
  try{await runAdaptive({report,pcm,createEngine,diarize:async()=>{if(!diarJob)return await diar();const r=await diarJob;if(r.error)throw Error(r.error);return r.value;},save:async()=>{}});}
  finally{if(dWorker)dWorker.terminate();}
  out.push({parallel,threads,wallMs:performance.now()-started,diarWallMs,status:report.status,rows:report.rows,turns:report.turns,timing:report.timing});
 }return {duration:pcm.length/16000,isolated:crossOriginIsolated,cores:navigator.hardwareConcurrency,runs:out};
 },Array.from(await fs.readFile('/tmp/public-dialogue.wav')));
 assert.equal(results.isolated,true);assert.ok(results.runs.every(r=>r.status==='complete'));
 const signature=r=>({rows:r.rows.map(x=>({text:x.text,timedChunks:x.timedChunks,review:x.review})),turns:r.turns});
 for(const r of results.runs)assert.deepEqual(signature(r),signature(results.runs[0]));
 console.log(JSON.stringify(results,null,2));await fs.writeFile('parallel-profile.json',JSON.stringify(results,null,2));
}finally{await browser.close();}

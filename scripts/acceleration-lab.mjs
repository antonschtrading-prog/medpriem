import {chromium,webkit} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const name=process.env.BROWSER||'chromium',browser=await (name==='webkit'?webkit:chromium).launch({headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/preview-v12/');
 const results=await page.evaluate(async bytes=>{
 const ctx=new AudioContext({sampleRate:16000});let pcm;try{pcm=(await ctx.decodeAudioData(Uint8Array.from(bytes).buffer)).getChannelData(0).slice();}finally{await ctx.close();}
 const {normalizeSpeakerTurns}=await import('./diarization.js');
 const capabilities={isolated:crossOriginIsolated,cores:navigator.hardwareConcurrency,shared:typeof SharedArrayBuffer!=='undefined',gpu:false};
 try{capabilities.gpu=!!(await navigator.gpu?.requestAdapter());}catch{}
 const configs=[{threads:1,provider:'wasm'},{threads:2,provider:'wasm'},{threads:4,provider:'wasm'},{threads:1,provider:'wasm',repeat:true}];
 if(capabilities.gpu)configs.push({threads:1,provider:'webgpu'});
 const results=[];
 async function ask(path,data,ok,err){const w=new Worker(path,{type:'module'});try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),240000);w.onmessage=({data:r})=>{if(err(r)){clearTimeout(timer);reject(Error(r.error||r.message));}else if(ok(r)){clearTimeout(timer);resolve(r);}};w.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};w.postMessage(data,[data.samples.buffer]);});}finally{w.terminate();}}
 async function diar(c){const t=performance.now(),r=await ask('./acceleration-lab-worker.js',{...c,samples:pcm.slice()},r=>Array.isArray(r.segments),r=>!!r.error);return {wallMs:performance.now()-t,loadMs:r.loadMs,inferMs:r.inferMs,threads:r.threads,isolated:r.isolated,turns:normalizeSpeakerTurns(r.segments,pcm.length/16000)};}
 async function asr(c){const t=performance.now(),r=await ask('./asr-worker.js',{type:'recognize',id:1,modelKey:'gigaam',threads:c.threads,samples:pcm.slice(0,25*16000)},r=>r.type==='recognized',r=>r.type==='error');return {wallMs:performance.now()-t,text:r.text,chunks:r.chunks,loadMs:r.loadMs,inferMs:r.inferMs};}
 for(const c of configs){const result={...c};try{result.diar=await diar(c);}catch(e){result.diarError=String(e.message||e);}if(c.provider==='wasm'){try{result.asr=await asr(c);}catch(e){result.asrError=String(e.message||e);}}results.push(result);}
 // Measure contention in same browser on two independent workers, not an asserted production speedup.
 const concurrent=[];for(const threads of [1,2]){const t=performance.now();const [a,d]=await Promise.allSettled([asr({threads}),diar({threads,provider:'wasm'})]);concurrent.push({threads,wallMs:performance.now()-t,asr:a.status==='fulfilled'?a.value:null,diar:d.status==='fulfilled'?d.value:null,errors:[a,d].filter(x=>x.status==='rejected').map(x=>String(x.reason))});}
 return {capabilities,results,concurrent};
 },Array.from(await fs.readFile('/tmp/public-dialogue.wav')));
 assert.equal(results.capabilities.isolated,true,'Cross-origin isolation unavailable');
 const base=results.results[0];assert.ok(base.asr?.text&&base.diar?.turns.length,JSON.stringify(results));
 for(const r of [...results.results,...results.concurrent]){r.textExact=r.asr?.text===base.asr.text;r.timesExact=JSON.stringify(r.asr?.chunks)===JSON.stringify(base.asr.chunks);r.turnsExact=JSON.stringify(r.diar?.turns)===JSON.stringify(base.diar.turns);}
 console.log(JSON.stringify(results,null,2));await fs.writeFile('acceleration-'+name+'.json',JSON.stringify(results,null,2));
}finally{await browser.close();}

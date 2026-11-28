import {chromium,webkit} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const name=process.env.BROWSER||'chromium',browser=await (name==='webkit'?webkit:chromium).launch({headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/preview-v13-lab/');
 await page.waitForFunction(()=>window.labIsolation&&window.labIsolation.reason!=='reloading',{},{timeout:30000});
 const state=await page.evaluate(()=>({isolated:crossOriginIsolated,reason:window.labIsolation.reason,shared:typeof SharedArrayBuffer!=='undefined'}));console.log('Isolation',JSON.stringify(state));
 // Workers must be created within the lab scope. Copies staged by CI, not production.
 const result=await page.evaluate(async bytes=>{
 const ctx=new AudioContext({sampleRate:16000});let pcm;try{pcm=(await ctx.decodeAudioData(Uint8Array.from(bytes).buffer)).getChannelData(0).slice();}finally{await ctx.close();}
 const {normalizeSpeakerTurns}=await import('./diarization.js');
 async function ask(path,data,ok,err){const w=new Worker(path,{type:'module'});try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),240000);w.onmessage=({data:r})=>{if(err(r)){clearTimeout(timer);reject(Error(r.error||r.message));}else if(ok(r)){clearTimeout(timer);resolve(r);}};w.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};w.postMessage(data,[data.samples.buffer]);});}finally{w.terminate();}}
 const out=[];for(const threads of crossOriginIsolated?[1,2]:[1]){
 const start=performance.now();
 const rows=[];
 for(const modelKey of ['gigaam','gigaam_e2e_rnnt']){const t=performance.now(),r=await ask('./asr-worker.js',{type:'recognize',id:1,modelKey,threads,samples:pcm.slice(0,25*16000)},r=>r.type==='recognized',r=>r.type==='error');rows.push({modelKey,text:r.text,chunks:r.chunks,wallMs:performance.now()-t});}
 const t=performance.now(),d=await ask('./acceleration-lab-worker.js',{provider:'wasm',threads,samples:pcm.slice()},r=>Array.isArray(r.segments),r=>!!r.error);
 out.push({threads,rows,diarMs:performance.now()-t,turns:normalizeSpeakerTurns(d.segments,pcm.length/16000),workerIsolated:d.isolated,wallMs:performance.now()-start});
 }return out;
 },Array.from(await fs.readFile('/tmp/public-dialogue.wav')));
 assert.ok(result[0].rows.every(r=>r.text)&&result[0].turns.length);
 if(state.isolated){assert.equal(result.length,2);assert.equal(result[1].workerIsolated,true);assert.deepEqual(result[1].rows.map(({text,chunks})=>({text,chunks})),result[0].rows.map(({text,chunks})=>({text,chunks})));assert.deepEqual(result[1].turns,result[0].turns);}
 console.log(JSON.stringify({state,result},null,2));await fs.writeFile('isolation-inference-'+name+'.json',JSON.stringify({state,result},null,2));
}finally{await browser.close();}

import {webkit} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const url='http://127.0.0.1:8765/preview-v13-lab/candidate.html';
const fixture='/tmp/public-dialogue.wav';
const budget=Number(process.env.PROFILE_BUDGET_MS||480000);
assert.ok(Number.isFinite(budget)&&budget>=240000&&budget<=3600000);
const started=Date.now(),watchdog=setTimeout(()=>{console.error('HOST_WATCHDOG',Date.now()-started);process.exit(124);},budget);
const errors=[],requests=[],workerStages=[],workers=[];
const timings={};
let browser;
async function boot(phase,storageState){
 browser=await webkit.launch({headless:true});
 const ctx=await browser.newContext(storageState?{storageState}:{});
 const page=await ctx.newPage();
 page.on('crash',()=>{console.error('PAGE_CRASH',phase);process.exit(125);});
 page.on('pageerror',e=>errors.push({phase,error:e.message}));
 page.on('console',m=>{const message=m.text();console.log(phase,message);if(message.startsWith('DIA_STAGE'))workerStages.push(message);});
 page.on('request',r=>requests.push({phase,url:r.url(),body:r.postDataBuffer()?.length??0}));
 page.on('worker',w=>{workers.push({phase,url:w.url()});console.log('WORKER',phase,w.url());});
 await page.goto(url+'?split='+phase);
 await page.waitForFunction(()=>['true','error'].includes(document.documentElement.dataset.candidateReady),{},{timeout:60000});
 assert.equal(await page.locator('html').getAttribute('data-candidate-ready'),'true');
 return {ctx,page};
}
const checkpoint=page=>page.evaluate(async()=>{const {loadCheckpoint}=await import('./benchmark-storage.js');return await loadCheckpoint();});
async function start(page,file){
 await page.locator('#audio').setInputFiles(file);
 await page.locator('#consent').check();
 await page.locator('#start').click({timeout:30000});
}
async function waitStopped(page,pattern){
 const remaining=budget-(Date.now()-started)-1000;
 assert.ok(remaining>0,'Host budget exceeded');
 let last='';
 const timer=setInterval(async()=>{try{const s=await page.locator('#status').textContent({timeout:1500});if(s!==last){last=s;console.log('STAGE',s);}}catch(e){console.log('PAGE_UNRESPONSIVE',e.message);}},5000);
 try{
  await page.waitForFunction(p=>document.querySelector('#stop').disabled&&new RegExp(p).test(document.querySelector('#status').textContent),pattern,{timeout:remaining});
 }finally{clearInterval(timer);}
}
try{
 let {ctx,page}=await boot('asr');
 let t=Date.now();
 await start(page,fixture);
 await waitStopped(page,'Готов к изолированному разделению голосов|Ошибка:|не полностью');
 const before=await checkpoint(page);timings.asrReviewMs=Date.now()-t;
 assert.ok(before?.splitReady,'Missing durable ASR phase barrier');
 assert.equal(before.status,'partial');
 assert.equal(before.rows.length,before.ranges.length);
 assert.ok(before.rows.some(r=>r.review?.status==='compared'));
 assert.ok(before.reviewSelected.every(i=>before.rows[i].review?.status==='compared'));
 assert.ok(before.rows.every(r=>typeof r.text==='string'));
 assert.ok(before.rows.some(r=>r.text.trim()));
 assert.equal(before.ranges[0].startSample,0);
 assert.ok(before.ranges.every((r,i)=>Number.isInteger(r.startSample)&&Number.isInteger(r.endSample)&&r.endSample>r.startSample&&(i===0||r.startSample===before.ranges[i-1].endSample)));
 assert.ok(Math.abs(before.ranges.at(-1).endSample/16000-before.duration)<=.05,'Audio coverage incomplete');
 assert.ok(!before.diarizationDone);
 assert.ok(!workers.some(w=>w.phase==='asr'&&w.url.includes('diarization-worker')));
 const snapshot=await ctx.storageState({indexedDB:true});
 assert.ok(snapshot.origins.some(o=>o.indexedDB?.length),'IndexedDB checkpoint absent in snapshot');
 await browser.close();browser=null;
 console.log('ASR_PROCESS_CLOSED');
 t=Date.now();
 ({ctx,page}=await boot('dia',snapshot));
 const restored=await checkpoint(page);
 assert.equal(restored.fileHash,before.fileHash);
 assert.deepEqual(restored.rows,before.rows);
 // Reject a different file before any decoding or inference.
 await start(page,{name:'wrong.wav',mimeType:'audio/wav',buffer:Buffer.from('different source')});
 await waitStopped(page,'Другой файл|Ошибка:');
 assert.match(await page.locator('#status').textContent(),/Другой файл/);
 assert.deepEqual(await checkpoint(page),restored);
 assert.ok(!workers.some(w=>w.phase==='dia'&&w.url.includes('worker.js')));
 console.log('EXACT_FILE_GUARD_PASS');
 await start(page,fixture);
 await waitStopped(page,'Расшифровка завершена|Дополнительная обработка завершена|Ошибка:');
 const after=await checkpoint(page);timings.diaRestartMs=Date.now()-t;
 assert.equal(after.status,'complete',JSON.stringify({error:after.error,diarizationError:after.diarizationError,status:after.status}));
 assert.deepEqual(after.rows,before.rows,'Primary and review rows changed across isolated diarization');
 assert.deepEqual(after.reviewSelected,before.reviewSelected);
 assert.deepEqual(after.ranges,before.ranges);
 assert.equal(after.fileHash,before.fileHash);
 assert.ok(after.diarizationDone&&after.turns.length>0);
 assert.ok(after.turns.every(x=>Number.isFinite(x.startSeconds)&&Number.isFinite(x.endSeconds)&&x.startSeconds>=0&&x.endSeconds>x.startSeconds&&x.endSeconds<=after.duration));
 assert.ok(new Set(after.turns.map(x=>x.speaker)).size>=2,'Expected two voices in public fixture');
 assert.ok(!workers.some(w=>w.phase==='dia'&&w.url.includes('asr-worker')),'ASR rerun during diarization');
 assert.ok(workerStages.some(s=>s.includes('inference:complete')),'Diarization did not actually complete');
 assert.deepEqual(errors,[]);
 assert.deepEqual(requests.filter(r=>!r.url.startsWith('http://127.0.0.1:8765')&&r.body>0),[]);
 const result={duration:after.duration,wallMs:Date.now()-started,timings,rows:after.rows.length,reviewed:after.reviewSelected.length,turns:after.turns.length,speakers:new Set(after.turns.map(x=>x.speaker)).size,checkpointRestored:true,wrongFileRejected:true,unchangedRows:true,noAsrReplay:true,externalWrites:0,workerStages,accuracy:'not measured; public fixture, no real iPhone validation'};
 console.log(JSON.stringify(result,null,2));await fs.writeFile('isolated-diarization.json',JSON.stringify(result,null,2));
}finally{clearTimeout(watchdog);await browser?.close();}

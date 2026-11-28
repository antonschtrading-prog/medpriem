import {chromium,webkit} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const name=process.env.BROWSER||'chromium',browser=await (name==='webkit'?webkit:chromium).launch({headless:true});
const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();const errors=[];const requests=[];
page.on('crash',()=>{console.error('PAGE CRASH');process.exit(125);});page.on('close',()=>console.log('PAGE CLOSED'));page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),url:r.url(),body:r.postDataBuffer()?.length??0}));
try{
 await page.goto('http://127.0.0.1:8765/preview-v13-lab/candidate.html');
 await page.waitForFunction(()=>['true','error'].includes(document.documentElement.dataset.candidateReady),{},{timeout:60000});
 const boot=await page.evaluate(()=>({ready:document.documentElement.dataset.candidateReady,boot:window.candidateBoot,status:document.querySelector('#status').textContent,isolated:crossOriginIsolated,shared:typeof SharedArrayBuffer!=='undefined'}));console.log('Candidate boot',JSON.stringify(boot));assert.equal(boot.ready,'true',JSON.stringify(boot));
 await page.locator('#audio').setInputFiles('/tmp/public-dialogue.wav');await page.locator('#consent').check();
 await page.waitForFunction(()=>!document.querySelector('#start').disabled,{},{timeout:30000}).catch(async e=>{console.log('Start blocked',await page.evaluate(()=>({status:document.querySelector('#status').textContent,files:document.querySelector('#audio').files.length,consent:document.querySelector('#consent').checked,boot:window.candidateBoot})));throw e;});
 const budget=Number(process.env.PROFILE_BUDGET_MS||240000);assert.ok(budget>=240000&&budget<=3600000);const watchdog=setTimeout(()=>{console.error('Host watchdog: full pipeline stalled');process.exit(124);},budget);page.on('console',m=>console.log('BROWSER',m.text()));const started=Date.now();await page.locator('#start').click();
 const timer=setInterval(async()=>{try{console.log('Stage',await page.locator('#status').textContent({timeout:2000}));}catch(e){console.log('Stage inaccessible',e.message);}},5000);await page.waitForFunction(()=>document.querySelector('#stop').disabled&&/Расшифровка завершена|Дополнительная обработка завершена|Ошибка:/.test(document.querySelector('#status').textContent),{},{timeout:budget-10000});
 clearInterval(timer);clearTimeout(watchdog);const wallMs=Date.now()-started;const report=await page.evaluate(async()=>{const {loadCheckpoint}=await import('./benchmark-storage.js');return await loadCheckpoint();});
 assert.equal(report.status,'complete',JSON.stringify({status:report.status,rows:report.rows.length,ranges:report.ranges.length,diarizationError:report.diarizationError,error:report.error,timing:report.timing,failedReviews:report.rows.filter(r=>r.review?.status==='failed').map(r=>r.review.error)}));assert.equal(report.rows.length,report.ranges.length);assert.ok(report.turns.length);assert.deepEqual(errors,[]);
 const externalWrites=requests.filter(r=>!r.url.startsWith('http://127.0.0.1:8765')&&r.body>0);
 assert.deepEqual(externalWrites,[],'Unexpected external request with payload');
 const voiced=report.turns.reduce((n,t)=>n+t.endSeconds-t.startSeconds,0);
 const summary={browser:name,boot,duration:report.duration,wallMs,rtf:wallMs/1000/report.duration,stages:report.timing,rows:report.rows.length,reviewed:report.rows.filter(x=>x.review?.status==='compared').length,deferred:report.reviewDeferred.length,timedRows:report.rows.filter(x=>x.timedChunks.length).length,turns:report.turns.length,speakers:[...new Set(report.turns.map(t=>t.speaker))].length,voicedSeconds:voiced,externalRequests:requests.length,externalWrites:externalWrites.length,accuracy:'not measured without verified reference',transcript:report.rows.map(r=>r.text).join(' '),speakerTurns:report.turns};
 console.log(JSON.stringify(summary,null,2));await fs.writeFile('candidate-'+name+'.json',JSON.stringify(summary,null,2));
}finally{await browser.close();}

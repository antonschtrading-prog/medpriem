import {chromium,webkit} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const name=process.env.BROWSER||'chromium',browser=await (name==='webkit'?webkit:chromium).launch({headless:true});
const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();const errors=[];const requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),url:r.url(),body:r.postDataBuffer()?.length??0}));
try{
 await page.goto('http://127.0.0.1:8765/preview-v13-lab/candidate.html');
 await page.locator('#audio').setInputFiles('/tmp/public-dialogue.wav');await page.locator('#consent').check();
 const started=Date.now();await page.locator('#start').click();
 await page.waitForFunction(()=>document.querySelector('#stop').disabled&&/Расшифровка завершена|Дополнительная обработка завершена|Ошибка:/.test(document.querySelector('#status').textContent),{},{timeout:1800000});
 const wallMs=Date.now()-started;const report=await page.evaluate(async()=>{const {loadCheckpoint}=await import('./benchmark-storage.js');return await loadCheckpoint();});
 assert.equal(report.status,'complete',JSON.stringify(report));assert.equal(report.rows.length,report.ranges.length);assert.ok(report.turns.length);assert.deepEqual(errors,[]);
 const externalWrites=requests.filter(r=>!r.url.startsWith('http://127.0.0.1:8765')&&r.body>0);
 assert.deepEqual(externalWrites,[],'Unexpected external request with payload');
 const voiced=report.turns.reduce((n,t)=>n+t.endSeconds-t.startSeconds,0);
 const summary={browser:name,duration:report.duration,wallMs,rtf:wallMs/1000/report.duration,stages:report.timing,rows:report.rows.length,reviewed:report.rows.filter(x=>x.review?.status==='compared').length,deferred:report.reviewDeferred.length,timedRows:report.rows.filter(x=>x.timedChunks.length).length,turns:report.turns.length,speakers:[...new Set(report.turns.map(t=>t.speaker))].length,voicedSeconds:voiced,externalRequests:requests.length,externalWrites:externalWrites.length,accuracy:'not measured without verified reference',transcript:report.rows.map(r=>r.text).join(' '),speakerTurns:report.turns};
 console.log(JSON.stringify(summary,null,2));await fs.writeFile('candidate-'+name+'.json',JSON.stringify(summary,null,2));
}finally{await browser.close();}

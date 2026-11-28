import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const context=await browser.newContext(),page=await context.newPage();
 const results=[];for(let i=0;i<2;i++){
  await page.goto('http://127.0.0.1:8765/preview-v13-lab/candidate.html');
  await page.waitForFunction(()=>['true','error'].includes(document.documentElement.dataset.candidateReady),{},{timeout:60000});
  assert.equal(await page.locator('html').getAttribute('data-candidate-ready'),'true');
  if(i){page.once('dialog',d=>d.accept());await page.locator('#reset').click();await page.waitForFunction(()=>document.querySelector('#reset').disabled);}
  const requests=[];const track=r=>{if(!r.url().startsWith('http://127.0.0.1:8765'))requests.push({method:r.method(),url:r.url(),body:r.postDataBuffer()?.length??0});};page.on('request',track);
  await page.locator('#audio').setInputFiles('/tmp/public-dialogue.wav');await page.locator('#consent').check();const start=Date.now();await page.locator('#start').click();
  await page.waitForFunction(()=>document.querySelector('#stop').disabled&&/Расшифровка завершена|Дополнительная обработка завершена|Ошибка:/.test(document.querySelector('#status').textContent),{},{timeout:1200000});
  const wallMs=Date.now()-start;const report=await page.evaluate(async()=>{const {loadCheckpoint}=await import('./benchmark-storage.js');return await loadCheckpoint();});page.off('request',track);
  assert.equal(report.status,'complete');assert.equal(requests.filter(r=>r.body>0).length,0);
  results.push({wallMs,stages:report.timing,rows:report.rows.map(r=>({text:r.text,timedChunks:r.timedChunks})),turns:report.turns,externalRequests:requests.length});
 }
 assert.deepEqual(results[0].rows,results[1].rows);assert.deepEqual(results[0].turns,results[1].turns);
 console.log(JSON.stringify({cold:results[0],warm:results[1],savedMs:results[0].wallMs-results[1].wallMs},null,2));await fs.writeFile('warm-profile.json',JSON.stringify(results,null,2));
}finally{await browser.close();}

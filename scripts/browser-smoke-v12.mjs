import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const url='http://127.0.0.1:8765/preview-v12/';
const read=()=>page.evaluate(async()=>{const {loadCheckpoint}=await import('./benchmark-storage.js');return await loadCheckpoint();});
try{
 await page.goto(url);await page.locator('#audio').setInputFiles('/tmp/public-dialogue.wav');await page.locator('#consent').check();await page.locator('#start').click();
 await page.waitForFunction(()=>document.querySelector('#storage').textContent.startsWith('Сохранено локально: 1 /'),{},{timeout:180000});
 const before=await read();assert.equal(before.rows.length,1);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#storage').textContent.includes('Восстановлено 1'));
 await page.locator('#audio').setInputFiles('/tmp/public-dialogue.wav');await page.locator('#consent').check();await page.locator('#start').click();
 await page.waitForFunction(()=>!document.querySelector('#stop').disabled || /завершена|Ошибка:|Другая вкладка|уже идёт/.test(document.querySelector('#status').textContent),{},{timeout:30000});
 await page.waitForFunction(()=>document.querySelector('#stop').disabled && /Расшифровка завершена|Дополнительная обработка завершена|Ошибка:|уже идёт/.test(document.querySelector('#status').textContent),{},{timeout:1200000});
 console.log('Final UI:',await page.locator('#status').textContent()); console.log('Checkpoint:',JSON.stringify(await read(),null,2).slice(0,2000));
 const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#json').click()]);
 const r=JSON.parse((await fs.readFile(await d.path(),'utf8')).replace(/^\uFEFF/,''));
 assert.equal(r.status,'complete');assert.deepEqual(r.rows[0].rawRecognition,before.rows[0].rawRecognition);
 assert.equal(r.rows.length,r.ranges.length);assert.ok(r.turns.length);assert.ok(r.rows.some(x=>x.timedChunks.length));assert.ok(r.reviewSelected.length<=Math.ceil(r.rows.length*.25));assert.deepEqual(errors,[]);
 console.log(JSON.stringify({duration:r.duration,rows:r.rows.length,reviewed:r.reviewSelected.length,turns:r.turns.length,timing:r.timing,words:r.rows.map(x=>x.text.split(/\s+/).length),vad:r.vad},null,2));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#storage').textContent.includes('Восстановлено'));assert.ok(await page.locator('#txt').isEnabled());assert.equal((await read()).status,'complete');
}finally{await browser.close();}

import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 const url='http://127.0.0.1:8765/preview-v11/benchmark.html';
 const path='/tmp/medpriem-smoke.wav';
 const read=()=>page.evaluate(async()=>{const {loadCheckpoint}=await import('./benchmark-storage.js');return await loadCheckpoint();});
 await page.goto(url);await page.locator('#audio').setInputFiles(path);await page.locator('#consent').check();await page.locator('#start').click();
 await page.waitForFunction(()=>document.querySelector('#storage').textContent.includes('1 из 5'),{},{timeout:180000});
 const before=await read();assert.equal(before.results[0].status,'complete');assert.ok(before.results[0].rows.length);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#storage').textContent.includes('Восстановлено: 1 из 5'));
 assert.equal(await page.locator('#save').isEnabled(),true);
 await page.locator('#audio').setInputFiles({name:'wrong.wav',mimeType:'audio/wav',buffer:Buffer.from('different file')});
 await page.locator('#consent').check();await page.locator('#start').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Выбран другой файл'));
 assert.deepEqual((await read()).results[0],before.results[0]);
 await page.locator('#audio').setInputFiles(path);await page.locator('#start').click();
 await page.waitForFunction(()=>document.querySelector('#storage').textContent.includes('2 из 5'),{},{timeout:180000});
 await page.locator('#stop').click();await page.waitForFunction(()=>document.querySelector('#stop').disabled);
 const after=await read();assert.deepEqual(after.results[0],before.results[0]);assert.equal(after.results[1].status,'complete');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#storage').textContent.includes('Восстановлено: 2 из 5'));
 assert.deepEqual(errors,[]);console.log('PASS: real first model, reload, wrong-file rejection, second model, original result unchanged, second reload');
}finally{await browser.close();}

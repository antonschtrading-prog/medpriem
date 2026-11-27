import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8765/preview-v11/');
 await page.getByRole('link',{name:/Сравнительное тестирование/}).click();
 await page.locator('#audio').setInputFiles('/tmp/medpriem-smoke.wav');
 assert.equal(await page.locator('#start').isDisabled(),true);
 await page.locator('#consent').check();
 await page.locator('#start').click();
 await page.waitForFunction(()=>document.querySelector('#stop').disabled&&!document.querySelector('#save').disabled,{},{timeout:35*60*1000});
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);
 const report=JSON.parse((await fs.readFile(await download.path(),'utf8')).replace(/^\uFEFF/,''));
 console.log(JSON.stringify({status:report.status,models:report.results.map(r=>({key:r.key,status:r.status,error:r.error,loadMs:r.loadMs,inferMs:r.inferMs,wallMs:r.wallMs,text:r.rows[0]?.text})),stages:report.stages,complex:report.complex&&{aligned:report.complex.aligned,rejected:report.complex.alignmentRejected,failed:report.complex.alignmentFailed,voices:report.complex.turns?.length,error:report.complex.diarizationError},errors},null,2));
 assert.deepEqual(errors,[]);
 assert.equal(report.results.length,5);
 assert.equal(report.results.filter(r=>r.key.startsWith('gigaam')&&r.status==='complete').length,3);
 for(const r of report.results.filter(r=>r.status==='complete')){assert.ok(r.loadMs>0);assert.ok(r.inferMs>0);assert.ok(r.rows.length>0);}
 assert.ok(report.complex);
 assert.equal(report.complex.alignmentFailed,0);
 assert.ok(report.complex.turns?.length);
 assert.ok(report.stages.decodeMs>=0&&report.stages.vadMs>=0);
 // Whisper failures are captured explicitly, not misrepresented as quality passes.
 if(report.results.some(r=>r.status!=='complete'))console.warn('MODEL AVAILABILITY LIMITATION: see report');
}finally{await browser.close();}

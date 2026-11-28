import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
const name=process.env.BROWSER||'chromium',revision=process.env.MODEL_REVISION;
const browser=await (name==='webkit'?webkit:chromium).launch();
const watchdog=setTimeout(()=>{console.error('Punctuation watchdog');process.exit(124);},180000);
try{
 const page=await browser.newPage(),writes=[];page.on('request',r=>{if(r.postDataBuffer()?.length)writes.push(r.url());});page.on('console',m=>console.log(m.text()));
 await page.goto('http://127.0.0.1:8765/modules/quality/punctuation-lab.html');
 const results=await page.evaluate(async revision=>{
  const {createPunctuator}=await import('./punctuation-runtime.js');const {FIXTURES}=await import('./punctuation-fixture.js');const {scorePunctuation}=await import('./punctuation-metrics.js');const start=performance.now(),p=await createPunctuator({revision});const loadMs=performance.now()-start;console.log('model ready '+loadMs);
  const rows=[];try{for(const raw of ['здравствуйте как дела сегодня','скажите пожалуйста когда началась боль','не принимайте препарат до осмотра','давление сто двадцать на восемьдесят','я думаю что сегодня будет дождь']){
   const t=performance.now(),r=await p.propose(raw);rows.push({raw,...r,ms:performance.now()-t});
  }const scored=[];for(const [raw,reference] of FIXTURES){const r=await p.propose(raw);scored.push({raw,reference,actual:r.proposal.text});}return {loadMs,rows,scored,metrics:scorePunctuation(scored)};}finally{await p.dispose();}
 },revision);
 console.log(JSON.stringify(results,null,2));assert.equal(writes.length,0);assert.ok(results.rows.every(x=>x.tags.length>0));assert.ok(results.rows.every(x=>x.tags.every(t=>Number.isInteger(t.index)&&typeof t.word==='string')),'Indexed token stream unavailable');assert.ok(results.rows.some(x=>x.proposal.accepted&&x.proposal.text!==x.raw),'No accepted punctuation proposal');
 assert.ok(results.rows.some(x=>x.raw==='я думаю что сегодня будет дождь'&&x.proposal.text.includes('думаю,')),'Expected internal comma missing');assert.ok(results.rows.some(x=>x.raw==='не принимайте препарат до осмотра'&&x.proposal.text==='не принимайте препарат до осмотра.'),'Expected safe terminal punctuation missing');
 const lex=s=>s.match(/[\p{L}\p{N}]+/gu)||[];for(const x of results.rows)assert.deepEqual(lex(x.proposal.text),lex(x.raw));
}finally{clearTimeout(watchdog);await browser.close();}

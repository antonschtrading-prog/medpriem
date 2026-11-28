import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
const name=process.env.BROWSER||'chromium',browser=await (name==='webkit'?webkit:chromium).launch({headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8765/preview-v13-lab/');
 await page.waitForFunction(()=>window.labIsolation&&window.labIsolation.reason!=='reloading',{},{timeout:30000});
 const state=await page.evaluate(()=>({result:window.labIsolation,isolated:crossOriginIsolated,shared:typeof SharedArrayBuffer!=='undefined'}));console.log(JSON.stringify(state));
 // WebKit may not support this deployment route. Report fallback as a valid outcome.
 assert.equal(state.result.isolated,state.isolated);
 if(state.isolated)assert.equal(state.shared,true);
 await page.goto('http://127.0.0.1:8765/preview-v12/');
 assert.equal(await page.evaluate(()=>crossOriginIsolated),false,'lab isolation must not leak into existing release');
}finally{await browser.close();}

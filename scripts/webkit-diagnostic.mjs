import {webkit} from 'playwright';
import fs from 'node:fs/promises';
const mode=process.env.MODE,model=process.env.MODEL,threads=mode==='isolated2'?2:1;
let last='node-start',browser;
const log=(stage,detail={})=>{last=stage;console.log(JSON.stringify({stage,mode,model,at:new Date().toISOString(),...detail}));};
const watchdog=setTimeout(()=>{console.error(JSON.stringify({outcome:'watchdog-timeout',last,mode,model}));process.exit(124);},180000);
try{
 log('browser-launch');browser=await webkit.launch();log('new-page');const page=await browser.newPage();
 page.on('console',m=>{if(m.text().startsWith('DIAG ')){const x=JSON.parse(m.text().slice(5));log(x.stage,x);}});
 page.on('pageerror',e=>console.error('PAGE ERROR '+e.message));
 page.on('requestfailed',r=>console.error('REQUEST FAILED '+new URL(r.url()).hostname+' '+r.failure()?.errorText));
 log('navigate');await page.goto('http://127.0.0.1:8765/preview-v12/webkit-diagnostic.html',{timeout:15000});
 log('read-pcm');const b=await fs.readFile('/tmp/public-dialogue.f32');const samples=Array.from(new Float32Array(b.buffer,b.byteOffset,b.byteLength/4));
 log('evaluate');const r=await page.evaluate(async({model,threads,samples,mode})=>{
  const mark=(stage,extra={})=>console.log('DIAG '+JSON.stringify({stage,...extra}));
  mark('page-enter',{isolated:crossOriginIsolated,shared:typeof SharedArrayBuffer!=='undefined'});
  if(crossOriginIsolated!==(mode!=='plain1'))throw Error('Isolation mismatch');
  mark('worker-create');const w=new Worker('./webkit-diagnostic-worker.js',{type:'module'});
  try{return await new Promise((resolve,reject)=>{
   w.onmessage=({data:r})=>{if(r.kind==='stage')mark(r.stage,r);else if(r.kind==='complete'){mark('worker-complete');resolve(r);}else{mark('worker-error',{error:r.error});reject(Error(r.error));}};
   w.onerror=e=>{mark('worker-onerror',{error:e.message});reject(Error(e.message));};
   const pcm=Float32Array.from(samples);mark('worker-post');w.postMessage({model,threads,samples:pcm},[pcm.buffer]);
  });}finally{w.terminate();}
 },{model,threads,samples,mode});
 if(model==='diarization'?!(r.segments>0):!r.text?.trim())throw Error('Empty inference');
 log('PASS',{result:r});await browser.close();clearTimeout(watchdog);
}catch(e){console.error(JSON.stringify({outcome:'error',last,mode,model,error:String(e.message||e)}));process.exit(1);}

import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
const page=await context.newPage();
try{
 await page.goto('http://127.0.0.1:8765/preview-v12/');
 const audio=await fs.readFile('/tmp/public-dialogue.wav');
 const results=await page.evaluate(async bytes=>{
  const ctx=new AudioContext({sampleRate:16000});let pcm;try{pcm=(await ctx.decodeAudioData(Uint8Array.from(bytes).buffer)).getChannelData(0).slice();}finally{await ctx.close();}
  const {normalizeSpeakerTurns}=await import('./diarization.js');
  const results=[];
  for(const batch of [1,2,4,8,1]){
   const w=new Worker('./diarization-batch-probe.js',{type:'module'});
   const start=performance.now();try{
    const out=await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>reject(Error('timeout')),600000);
     w.onmessage=({data})=>{clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data);};
     w.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};
     const copy=pcm.slice();w.postMessage({samples:copy,batch},[copy.buffer]);
    });
    results.push({batch,wallMs:performance.now()-start,loadMs:out.loadMs,inferMs:out.inferMs,turns:normalizeSpeakerTurns(out.segments,pcm.length/16000)});
   }catch(e){results.push({batch,error:String(e.message||e)});}finally{w.terminate();}
  }
  return results;
 },Array.from(audio));
 assert.ok(results[0].turns?.length,'baseline failed');assert.ok(results.at(-1).turns?.length,'repeat baseline failed');
 // Match speaker IDs by maximizing sampled overlap, not by arbitrary numeric ID.
 function compare(a,b){const ids=x=>[...new Set(x.map(t=>t.speaker))];const aa=ids(a),bb=ids(b);if(aa.length!==bb.length||aa.length>5)return {agreement:null,sameCount:false};
  const perm=x=>x.length===0?[[]]:x.flatMap((v,i)=>perm(x.filter((_,k)=>k!==i)).map(p=>[v,...p]));
  const at=(x,t)=>x.filter(r=>r.startSeconds<=t&&t<r.endSeconds).map(r=>r.speaker);
  let best=0;for(const p of perm(bb)){let equal=0,all=0;for(let t=.025;t<37;t+=.05){const x=at(a,t),y=at(b,t).map(k=>aa[p.indexOf(k)]);if(x.length||y.length){all++;if(x.length===y.length&&x.every(k=>y.includes(k)))equal++;}}best=Math.max(best,equal/Math.max(1,all));}return {agreement:best,sameCount:true};}
 const baseline=results[0];for(const r of results){if(r.turns)r.comparison=compare(baseline.turns,r.turns);}
 console.log(JSON.stringify(results,null,2));await fs.writeFile('diarization-batch-profile.json',JSON.stringify(results,null,2));
}finally{await browser.close();}

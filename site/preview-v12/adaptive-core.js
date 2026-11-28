import {recognitionWindow} from './boundary-continuity.js';
import {normalizeWindowChunks} from './word-timing.js';
import {criticalFacts,criticalDisagreement} from './critical-review.js';
import {repetitionAudit} from './hallucination.js';
import {formatTime} from './audio.js';
import {diarizedTranscript} from './diarization.js';
export const PRIMARY='gigaam', SECONDARY='gigaam_e2e_rnnt', REVIEW_FRACTION=.25;
const tokens=t=>String(t??'').match(/[\p{L}\p{N}]+/gu)||[];
const canon=t=>String(t??'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
export function runtimePolicy({isolated=false,cores=1,memory=null}={}){
 const threads=isolated&&(!Number.isFinite(memory)||memory>=4)?Math.min(4,Math.max(1,Math.floor(cores/2))):1;
 return {provider:'wasm',threads,parallelModels:1};
}
export function paddedSamples(pcm,w){const a=pcm.slice(w.startSample,w.endSample);if(a.length>=8000)return a;const b=new Float32Array(8000);b.set(a);return b;}
export function seam(previous,raw,w,range){
 const text=String(raw.text??'');
 // Only remove words whose actual acoustic end is in the left overlap AND match the prior suffix.
 const chunks=raw.chunks??[],prev=tokens(previous?.text);
 const exact=chunks.length&&chunks.map(x=>x.text).join('').replace(/\s/gu,'')===text.replace(/\s/gu,'');
 let n=0;
 if(exact&&w.overlapSeconds>0){
  for(const x of chunks){if(!Number.isFinite(x.timestamp?.[1])||x.timestamp[1]>w.overlapSeconds+.025)break;n++;}
 }
 const removed=chunks.slice(0,n).map(x=>x.text).join('');
 const words=tokens(removed);
 // Never remove numeric content (including spoken numbers) automatically.
 const safe=n>0&&words.length>0&&words.length<=prev.length&&!criticalFacts(removed).numbers.length&&!/\d/u.test(removed)&&words.every((x,i)=>canon(x)===canon(prev[prev.length-words.length+i]));
 const retained=safe?chunks.slice(n):chunks;
 const clean=safe?retained.map(x=>x.text).join('').trim():text.trim();
 const timed=normalizeWindowChunks(retained,clean,w,range);
 return {text:clean,timedChunks:timed,removedWords:safe?words.length:0,boundaryReview:w.overlapSeconds>0&&!safe,rawRecognition:text};
}
export function reviewPlan(rows,ranges,fraction=REVIEW_FRACTION){
 const all=rows.flatMap((r,i)=>{
  const facts=criticalFacts(r.text),reasons=[];let score=0;
  if(!r.text.trim()||r.suspicious){score+=100;reasons.push('пропуск или повтор');}
  if(facts.numbers.length&&(facts.units.length||facts.medications.length)){score+=90;reasons.push('доза или числовое значение');}
  else if(facts.numbers.length){score+=45;reasons.push('числа');}
  if(facts.medications.length){score+=50;reasons.push('лекарство');}
  if(facts.negation.length&&facts.medications.length){score+=35;reasons.push('отрицание при лекарстве');}
  if(r.boundaryReview){score+=20;reasons.push('стык');}
  if(!r.timedChunks?.length&&r.text.trim()){score+=10;reasons.push('нет точных меток');}
  return score?[{index:i,score,reasons,window:recognitionWindow(ranges,i)}]:[];
 });
 all.sort((a,b)=>b.score-a.score||a.index-b.index);
 const cap=Math.min(all.length,Math.max(0,Math.ceil(rows.length*fraction)));
 return {selected:all.slice(0,cap),deferred:all.slice(cap)};
}
export function minimalFormat(text){
 // Case and terminal punctuation only. No guessed commas, no word or number normalization.
 const s=String(text??'').trim();if(!s)return s;
 return s.replace(/^\p{L}/u,c=>c.toLocaleUpperCase('ru-RU'))+(/[.!?…]$/u.test(s)||/\d$/u.test(s)?'':'.');
}
export function displayTranscript(report){
 const rows=report.rows??[],turns=report.turns??[];
 const raw=turns.length?diarizedTranscript(rows,turns,report.duration,formatTime):rows.map(r=>'['+formatTime(r.startSeconds)+'] '+(r.text||'[речь не распознана]')).join('\n\n');
 return raw.split('\n\n').map(line=>line.replace(/^(\[[^\]]+\]\s+(?:Говорящий[^:]*:\s*)?)(.*)$/u,(_,prefix,body)=>prefix+minimalFormat(body))).join('\n\n');
}
export async function runAdaptive({report,pcm,createEngine,diarize,save,notify=()=>{},signal,clock=()=>performance.now()}){
 const check=()=>{if(signal?.aborted)throw new DOMException('Остановлено','AbortError');};
 const measure=async(stage,fn)=>{const t=clock();try{return await fn();}finally{report.timing[stage]=(report.timing[stage]??0)+clock()-t;}};
 report.rows??=[];report.timing??={};report.warnings??=[];report.status='running';
 let engine;
 try{
  await measure('asr',async()=>{
   if(report.rows.length>=report.ranges.length)return;
   engine=createEngine(PRIMARY);
   try{for(let i=report.rows.length;i<report.ranges.length;i++){
    check();notify('Распознавание',i,report.ranges.length);const range=report.ranges[i],w=recognitionWindow(report.ranges,i),raw=await engine.recognize(paddedSamples(pcm,w));
    check();const row=seam(report.rows.at(-1),raw,w,range);
    report.rows.push({...row,startSeconds:range.startSeconds,endSeconds:range.endSeconds,suspicious:repetitionAudit(row.text,range.endSeconds-range.startSeconds).suspicious,window:w,backend:raw.backend??'wasm'});
    await save(report);
   }}finally{engine.close();engine=null;}
  });
  const plan=reviewPlan(report.rows,report.ranges);report.reviewDeferred=plan.deferred;report.reviewSelected=plan.selected.map(j=>j.index);
  await save(report);
  await measure('review',async()=>{
   const jobs=plan.selected.filter(j=>report.rows[j.index].review?.status!=='compared');
   if(!jobs.length)return;
   engine=createEngine(SECONDARY);
   try{for(let n=0;n<jobs.length;n++){
    check();const j=jobs[n],r=report.rows[j.index];notify('Проверка спорных мест',n,jobs.length);
    try{const a=await engine.recognize(paddedSamples(pcm,j.window));check();r.review={status:'compared',alternate:a.text,critical:criticalDisagreement(r.rawRecognition,a.text),reasons:j.reasons};}
    catch(e){if(signal?.aborted)throw e;r.review={status:'failed',error:String(e.message||e),reasons:j.reasons};await save(report);break;}
    await save(report);
   }}finally{engine.close();engine=null;}
  });
  check();
  if(!report.diarizationDone){
   await measure('diarization',async()=>{
    notify('Разделение голосов',0,1);
    try{report.turns=await diarize(pcm);check();if(!report.turns.length)throw Error('Голосовые интервалы не найдены');report.diarizationDone=true;delete report.diarizationError;}
    catch(e){if(signal?.aborted)throw e;report.diarizationError=String(e.message||e);}
   });
   await save(report);
  }
  report.status=report.diarizationDone&&plan.selected.every(j=>report.rows[j.index].review?.status==='compared')?'complete':'partial';
 }finally{engine?.close();}
 return report;
}

import {recognitionWindow,reconcileBoundary} from './boundary-continuity.js';
import {normalizeWindowChunks} from './word-timing.js';
import {repetitionAudit,preferRetry} from './hallucination.js';
import {meritsClinicalRetry,criticalDisagreement} from './critical-review.js';
import {resolveModel} from './model-options.js';
import {selectReviewJobs,compareReview,attachThird} from './dual-review.js';
import {buildTranscript} from './audio.js';
import {benchmarkRussian} from './quality.js';
export const KEYS=['gigaam','gigaam_e2e_rnnt','gigaam_e2e_ctc','medium','turbo_ru'];
const check=signal=>{if(signal?.aborted)throw new DOMException('Остановлено','AbortError');};
export async function runComparison({ranges,pcm,createEngine,signal,notify=()=>{},publish=()=>{},keys=KEYS,clock=()=>performance.now()}){
 const results=[];
 for(const key of keys){
  check(signal);const started=clock(),rows=[];let engine,loadMs=0,inferMs=0,calls=0,error=null;
  try{
   engine=createEngine(key);
   const recognize=async(w,retry=false)=>{
    check(signal);const r=await engine.recognize(pcm.slice(w.startSample,w.endSample),retry);
    loadMs+=r.loadMs??0;inferMs+=r.inferMs??0;calls++;return r;
   };
   for(let i=0;i<ranges.length;i++){
    check(signal);notify(key,i,ranges.length);
    const range=ranges[i],w=recognitionWindow(ranges,i),first=await recognize(w);
    let text=first.text,chunks=first.chunks,clinicalReview=false;
    const seconds=(w.endSample-w.startSample)/16000,audit=repetitionAudit(text,seconds);
    if(resolveModel(key).family==='whisper'&&(audit.suspicious||meritsClinicalRetry(text))){
     try{const second=await recognize(w,true);clinicalReview=criticalDisagreement(text,second.text).length>0;
      if(audit.suspicious){const choice=preferRetry(text,second.text,seconds);text=choice.text;if(choice.improved)chunks=second.chunks;}
     }catch(e){if(e.name==='AbortError')throw e;clinicalReview=true;}
    }
    const suspicious=repetitionAudit(text,seconds).suspicious;
    const boundary=reconcileBoundary(rows.at(-1)?.text,text,w.overlapSeconds>0);
    rows.push({startSeconds:range.startSeconds,endSeconds:range.endSeconds,text:boundary.text,rawRecognition:first.text,timedChunks:normalizeWindowChunks(chunks,boundary.text,w,range),boundaryReview:boundary.requiresReview,clinicalReview,suspicious,window:w});
   }
  }catch(e){error=String(e.message||e);if(e.name==='AbortError')error='Остановлено';}
  finally{engine?.close();}
  const result={key,status:error?(signal?.aborted?'cancelled':'failed'):'complete',error,rows,loadMs,inferMs,wallMs:clock()-started,calls,transcript:buildTranscript(rows,!!error)};
  results.push(result);publish([...results]);if(signal?.aborted)break;
 }
 return results;
}
export function reuseReview(results,primaryKey,ranges){
 const primary=results.find(r=>r.key===primaryKey&&r.status==='complete');
 if(!primary)throw Error('Основная модель не завершила распознавание');
 const rows=structuredClone(primary.rows),jobs=selectReviewJobs(rows,ranges,primaryKey);
 // Include suspicious repetition detected by the new runner; compare only identical windows.
 const indices=new Set(jobs.map(j=>j.index));
 rows.forEach((s,i)=>{if(s.suspicious)indices.add(i);});
 let compared=0,third=0,missing=0;
 for(const i of indices){
  const row=rows[i],w=row.window;
  const alternatives=results.filter(r=>r.key!==primaryKey&&r.status==='complete'&&r.rows[i]?.window.startSample===w.startSample&&r.rows[i]?.window.endSample===w.endSample);
  // Prefer independent families, then a different third model. Never silently choose truth by consensus.
  alternatives.sort((a,b)=>Number(resolveModel(b.key).family!==resolveModel(primaryKey).family)-Number(resolveModel(a.key).family!==resolveModel(primaryKey).family));
  if(!alternatives.length){missing++;continue;}
  const a=alternatives[0],job={index:i,modelKey:a.key,startSample:w.startSample,endSample:w.endSample,reasons:jobs.find(j=>j.index===i)?.reasons??['повтор']};
  row.dualReview=compareReview(row.rawRecognition,a.rows[i].rawRecognition,job);compared++;
  if(row.dualReview.differs&&alternatives[1]){row.dualReview=attachThird(row.dualReview,alternatives[1].rows[i].rawRecognition,alternatives[1].key);third++;}
 }
 return {primaryKey,rows,selected:indices.size,compared,third,missing,transcript:buildTranscript(rows),reviewMode:'cached-identical-windows; no automatic substitutions'};
}
export function scoreReference(reference,rows,endSeconds){
 if(!reference.trim())return null;
 const chosen=rows.filter(s=>s.endSeconds<=endSeconds+.001);
 if(!chosen.length||Math.abs(chosen.at(-1).endSeconds-endSeconds)>.01)throw Error('Эталон должен заканчиваться на указанной границе фрагмента');
 return benchmarkRussian(reference,chosen.map(s=>s.text).join(' '));
}

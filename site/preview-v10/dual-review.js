import {wordDifferences,consensus} from './fusion.js';
import { russianTokens } from './quality.js';
import { criticalDisagreement, meritsClinicalRetry } from './critical-review.js';
import { recognitionWindow } from './boundary-continuity.js';
export function selectReviewJobs(segments, ranges, primary, legacy=false) {
  const modelKey=primary.startsWith('gigaam')?'turbo_ru':'gigaam';
  return segments.flatMap((s,i)=>{
    const r=ranges[i]; if(!r || s.dualReview?.status==='compared') return [];
    const text=String(s.rawRecognition ?? s.text ?? '');
    const reasons=[];
    if(!text.trim() || /речь не распознана|ТРЕБУЕТ ПРОСЛУШИВАНИЯ/i.test(text)) reasons.push('пропуск или повтор');
    if(s.boundaryReview) reasons.push('стык');
    if(s.clinicalReview || meritsClinicalRetry(text)) reasons.push('критические слова');
    if(r.endSeconds-r.startSeconds>=8 && russianTokens(text).length<3) reasons.push('мало слов');
    if(!reasons.length) return [];
    const w=legacy?r:recognitionWindow(ranges,i);
    return [{index:i,modelKey,startSample:w.startSample,endSample:w.endSample,reasons}];
  });
}
export function compareReview(primary, alternate, job) {
  const a=russianTokens(primary), b=russianTokens(alternate);
  const critical=criticalDisagreement(primary,alternate);
  return {status:'compared',modelKey:job.modelKey,startSeconds:job.startSample/16000,endSeconds:job.endSample/16000,
    primary:String(primary).slice(0,10000),alternate:String(alternate).slice(0,10000),critical,
    differs:a.join(' ')!==b.join(' '),wordDifferences:wordDifferences(primary,alternate),reasons:job.reasons};
}
export function sanitizeReview(r) {
  if(!r || !['compared','failed'].includes(r.status) || !['medium','turbo_ru','gigaam','gigaam_e2e_rnnt','gigaam_e2e_ctc'].includes(r.modelKey) ||
    !Number.isFinite(r.startSeconds)||!Number.isFinite(r.endSeconds)||r.startSeconds<0||r.endSeconds<=r.startSeconds||r.endSeconds-r.startSeconds>30.1) return undefined;
  return {status:r.status,modelKey:r.modelKey,startSeconds:r.startSeconds,endSeconds:r.endSeconds,
    primary:String(r.primary??'').slice(0,10000),alternate:String(r.alternate??'').slice(0,10000),
    critical:Array.isArray(r.critical)?r.critical.filter(x=>['numbers','units','negation','medications'].includes(x)):[],
    differs:r.differs===true,wordDifferences:Array.isArray(r.wordDifferences)?r.wordDifferences.slice(0,600).map(x=>({primary:x.primary==null?null:String(x.primary).slice(0,100),alternate:x.alternate==null?null:String(x.alternate).slice(0,100)})):[],thirdModel:typeof r.thirdModel==='string'?r.thirdModel.slice(0,30):undefined,thirdText:typeof r.thirdText==='string'?r.thirdText.slice(0,10000):undefined,suggestions:Array.isArray(r.suggestions)?r.suggestions.slice(0,600).map(x=>({index:Number(x.index),primary:String(x.primary).slice(0,100),suggestion:String(x.suggestion).slice(0,100),votes:2})):[],contextText:typeof r.contextText==='string'?r.contextText.slice(0,10000):undefined,reasons:Array.isArray(r.reasons)?r.reasons.slice(0,5).map(x=>String(x).slice(0,100)):[]};
}

// GigaAmTranscriber fix.py: reread with neighboring acoustic context; accept only anchored text.
export function contextualWindow(job,totalSamples){
 const pad=Math.min(16000,Math.max(0,Math.floor((29.95*16000-(job.endSample-job.startSample))/2)));
 return {startSample:Math.max(0,job.startSample-pad),endSample:Math.min(totalSamples,job.endSample+pad)};
}
export function attachThird(review,text,key){return {...review,thirdModel:key,thirdText:String(text).slice(0,10000),suggestions:consensus(review.primary,review.alternate,text)};}

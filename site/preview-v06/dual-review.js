import { russianTokens } from './quality.js';
import { criticalDisagreement, meritsClinicalRetry } from './critical-review.js';
import { recognitionWindow } from './boundary-continuity.js';
export function selectReviewJobs(segments, ranges, primary, legacy=false) {
  const modelKey=primary==='gigaam'?'medium':primary==='medium'?'turbo_ru':primary==='turbo_ru'?'medium':primary==='xlsr_ru'?'small':'gigaam';
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
    differs:a.join(' ')!==b.join(' '),reasons:job.reasons};
}
export function sanitizeReview(r) {
  if(!r || !['compared','failed'].includes(r.status) || !['small','xlsr_ru','medium','turbo_ru','gigaam'].includes(r.modelKey) ||
    !Number.isFinite(r.startSeconds)||!Number.isFinite(r.endSeconds)||r.startSeconds<0||r.endSeconds<=r.startSeconds||r.endSeconds-r.startSeconds>30.1) return undefined;
  return {status:r.status,modelKey:r.modelKey,startSeconds:r.startSeconds,endSeconds:r.endSeconds,
    primary:String(r.primary??'').slice(0,10000),alternate:String(r.alternate??'').slice(0,10000),
    critical:Array.isArray(r.critical)?r.critical.filter(x=>['numbers','units','negation','medications'].includes(x)):[],
    differs:r.differs===true,reasons:Array.isArray(r.reasons)?r.reasons.slice(0,5).map(x=>String(x).slice(0,100)):[]};
}

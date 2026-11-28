import fs from 'node:fs/promises';
import './stage-v13-candidate.mjs';

const dir='site/preview-v13-lab/';
const patch=async (name,edits)=>{
 let code=await fs.readFile(dir+name,'utf8');
 for(const [from,to] of edits){
  if(code.split(from).length!==2)throw Error('Missing or ambiguous anchor: '+name+' '+from);
  code=code.replace(from,()=>to);
 }
 await fs.writeFile(dir+name,code);
};
// Diagnostic mode only. No audio bytes are written to storage; exact-file recovery
// uses the pre-existing hash and local transcript checkpoint.
await patch('adaptive-core.js',[
 ['const check=()=>{if(signal?.aborted)throw new DOMException','const phase=new URLSearchParams(location.search).get("split");\n const check=()=>{if(signal?.aborted)throw new DOMException'],
 ["report.rows??=[];report.timing??={};report.warnings??=[];report.status='running';", "report.rows??=[];report.timing??={};report.warnings??=[];\n if(phase==='dia'&&(!report.splitReady||report.rows.length!==report.ranges?.length||!report.reviewSelected?.every(i=>report.rows[i]?.review?.status==='compared')))throw Error('Incomplete ASR checkpoint: isolated diarization blocked');\n report.status='running';"],
 ['const plan=reviewPlan(report.rows,report.ranges);','const plan=reviewPlan(report.rows,report.ranges); if((phase==="asr"||phase==="dia")&&!plan.selected.length){if(!report.rows.length)throw Error("No ASR rows");plan.selected.push({index:0,score:1,reasons:["forced isolation diagnostic"],window:recognitionWindow(report.ranges,0)});}'],
 ["  check();\n  if(!report.diarizationDone){", "  check();\n  if(phase==='asr'){\n   if(report.rows.length!==report.ranges.length||!plan.selected.every(j=>report.rows[j.index].review?.status==='compared'))throw Error('ASR/review incomplete');\n   report.splitReady=true;report.status='partial';await save(report);return report;\n  }\n  if(!report.diarizationDone){"],
 ["report.diarizationDone=true;delete report.diarizationError;", "report.diarizationDone=true;delete report.diarizationError;"]
].slice(0,4));
await patch('adaptive-app.js',[
 ["status(report.status==='complete'?'Расшифровка завершена. Проверьте спорные места.':'Текст сохранён. Дополнительная обработка завершена не полностью.');", "status(report.status==='complete'?'Расшифровка завершена. Проверьте спорные места.':report.splitReady&&new URLSearchParams(location.search).get('split')==='asr'?'Текст сохранён. Готов к изолированному разделению голосов.':'Текст сохранён. Дополнительная обработка завершена не полностью.');"],
 ["if(r.type===ok)done(resolve,r);if(r.type===error)done(reject,Error(r.message));","if(r.type==='diarization-progress')console.info('DIA_STAGE',r.message);if(r.type===ok)done(resolve,r);if(r.type===error)done(reject,Error(r.message));"]
]);
await patch('diarization-worker.js',[
 ["  const [ort,{DiarizationPipeline}]=await Promise.all", "  const progress=message=>self.postMessage({type:'diarization-progress',id,message});\n  progress('imports:start');\n  const [ort,{DiarizationPipeline}]=await Promise.all"],
 ["  const [segmentationModel,embeddingModel,plda]=await Promise.all", "  progress('artifacts:start');\n  const [segmentationModel,embeddingModel,plda]=await Promise.all"],
 ["  const engine=await DiarizationPipeline.create", "  progress('session:create:start');\n  const engine=await DiarizationPipeline.create"],
 ["  const {result}=await engine.run(data.samples,16000);", "  progress('inference:start');\n  const {result}=await engine.run(data.samples,16000);\n  progress('inference:complete');"]
]);

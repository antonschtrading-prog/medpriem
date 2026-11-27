import {KEYS,runComparison,reuseReview,scoreReference} from './benchmark-core.js';
import {to16kMono,validateAudioBuffer,formatTime} from './audio.js';
import {sileroPauseRanges} from './silero-segmentation.js';
import {pauseAwareRanges} from './pause-segmentation.js';
import {normalizeWindowChunks} from './word-timing.js';
import {normalizeSpeakerTurns,diarizedTranscript} from './diarization.js';
import {resolveModel} from './model-options.js';
import {downloadText,cleanFilename} from './exports.js';
const $=id=>document.getElementById(id);
let report=null,abort=null,active=null;
const status=t=>{$('status').textContent=t;};
function actions(){const busy=!!abort;$('start').disabled=busy||!$('audio').files.length||!$('consent').checked;$('stop').disabled=!busy;$('audio').disabled=busy;$('primary').disabled=busy;$('consent').disabled=busy;$('save').disabled=!report;$('score').disabled=busy||!report?.results.some(r=>r.status==='complete');}
for(const id of ['audio','consent'])$(id).addEventListener('change',actions);
function request(worker,data,signal,ok,error,timeout=600000){
 return new Promise((resolve,reject)=>{
  const finish=(fn,value)=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);worker.onmessage=null;worker.onerror=null;fn(value);};
  const cancel=()=>finish(reject,new DOMException('Остановлено','AbortError'));
  const timer=setTimeout(()=>finish(reject,Error('Таймаут '+data.type)),timeout);
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted){cancel();return;}
  worker.onerror=e=>finish(reject,Error(e.message||'Ошибка worker'));
  worker.onmessage=({data:r})=>{if(r.type==='model-progress'){status('Загрузка весов: '+Math.round(r.progress)+'%');return;}if(r.id!==data.id)return;if(r.type===ok)finish(resolve,r);if(r.type===error)finish(reject,Error(r.message));};
  worker.postMessage(data,data.samples?[data.samples.buffer]:[]);
 });
}
function newEngine(key,signal){
 const worker=new Worker('./asr-worker.js?v=11-benchmark',{type:'module'});active=worker;let id=0;
 return {recognize:(samples,retry)=>request(worker,{type:'recognize',id:++id,modelKey:key,samples,retry},signal,'recognized','error'),close:()=>{worker.terminate();if(active===worker)active=null;}};
}
function render(){
 const host=$('results');host.replaceChildren();
 for(const r of report.results){
  const p=document.createElement('p');p.textContent=resolveModel(r.key).label+' · '+r.status+' · всего '+(r.wallMs/1000).toFixed(1)+' с · загрузка/инициализация '+(r.loadMs/1000).toFixed(1)+' с · inference '+(r.inferMs/1000).toFixed(1)+' с · RTF '+(r.wallMs/1000/report.duration).toFixed(3)+(r.error?' · '+r.error:'');
  const b=document.createElement('button');b.textContent='TXT';b.onclick=()=>downloadText('Модель: '+r.key+'; статус: '+r.status+'\n'+r.transcript,cleanFilename(report.file)+'_'+r.key+'.txt');host.append(p,b);
 }
 if(report.complex){const c=report.complex,p=document.createElement('p');p.textContent='Комплексный режим: проверено '+c.compared+' / '+c.selected+'; ROVER '+c.third+'; выравнивание '+(c.aligned??0)+'; голоса '+(c.turns?new Set(c.turns.map(t=>t.speaker)).size:0);host.append(p);if(c.diarized){const b=document.createElement('button');b.textContent='TXT с говорящими';b.onclick=()=>downloadText(c.diarized,cleanFilename(report.file)+'_complex.txt');host.append(b);}}
 actions();
}
$('stop').onclick=()=>abort?.abort();
$('save').onclick=()=>{if(report)downloadText(JSON.stringify(report,null,2),cleanFilename(report.file)+'_benchmark.json');};
$('score').onclick=()=>{const output={};for(const r of report.results.filter(x=>x.status==='complete')){try{output[r.key]=scoreReference($('reference').value,r.rows,Number($('end').value));}catch(e){output[r.key]={error:e.message};}}report.scores=output;$('scores').textContent=JSON.stringify(output,null,2);};
$('start').onclick=async()=>{
 if(abort||!$('consent').checked||!$('audio').files.length)return;
 const file=$('audio').files[0],primary=$('primary').value,started=performance.now();abort=new AbortController();const signal=abort.signal;
 report={version:'1.1',file:file.name,results:[],status:'running',primary,stages:{}};$('scores').textContent='';$('end').replaceChildren();render();actions();
 try{
  status('Декодирование записи');let t=performance.now(),decoded;
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  try{decoded=await ctx.decodeAudioData(await file.arrayBuffer());}finally{await ctx.close();}
  report.duration=validateAudioBuffer(decoded);report.stages.decodeMs=performance.now()-t;
  if(signal.aborted)throw new DOMException('Остановлено','AbortError');
  t=performance.now();status('Silero VAD: единая сегментация');
  let ranges;try{ranges=(await sileroPauseRanges(decoded)).ranges;report.vad='silero';}catch(e){ranges=pauseAwareRanges(decoded);report.vad='energy';report.vadError=e.message;}
  report.stages.vadMs=performance.now()-t;t=performance.now();
  const pcm=to16kMono(decoded);decoded=null;report.stages.resampleMs=performance.now()-t;
  report.ranges=ranges;ranges.forEach(r=>{const o=document.createElement('option');o.value=r.endSeconds;o.textContent=formatTime(r.endSeconds);$('end').append(o);});$('end').selectedIndex=ranges.length-1;
  report.results=await runComparison({ranges,pcm,signal,createEngine:key=>newEngine(key,signal),notify:(key,i,n)=>{status(resolveModel(key).label+' · '+(i+1)+' / '+n);$('progress').max=KEYS.length*n;$('progress').value=KEYS.indexOf(key)*n+i;},publish:r=>{report.results=r;render();}});
  if(signal.aborted)throw new DOMException('Остановлено','AbortError');
  t=performance.now();const c=report.complex=reuseReview(report.results,primary,ranges);report.stages.reuseReviewMs=performance.now()-t;
  t=performance.now();c.aligned=0;c.alignmentRejected=0;c.alignmentFailed=0;
  let worker=new Worker('./alignment-worker.js?v=11',{type:'module'});active=worker;
  try{for(let i=0;i<c.rows.length;i++){const row=c.rows[i],r=ranges[i];if(!row.text.trim())continue;status('CTC '+(i+1)+' / '+c.rows.length);
   try{const a=await request(worker,{type:'align',id:i,text:row.text,samples:pcm.slice(r.startSample,r.endSample)},signal,'aligned','alignment-error',180000);
    const chunks=normalizeWindowChunks(a.chunks,row.text,r,r);
    if(a.accepted&&chunks.length){row.timedChunks=chunks;row.alignment='ctc';c.aligned++;}else{row.alignment='rejected';c.alignmentRejected++;}
   }catch(e){if(signal.aborted)throw e;row.alignment='failed';c.alignmentFailed++;c.alignmentError=e.message;break;}
  }}finally{worker.terminate();active=null;}
  report.stages.alignmentMs=performance.now()-t;t=performance.now();status('Определение говорящих');
  worker=new Worker('./diarization-worker.js',{type:'module'});active=worker;
  try{const d=await request(worker,{type:'diarize',id:1,samples:pcm.slice()},signal,'diarization-result','diarization-error',1200000);c.turns=normalizeSpeakerTurns(d.segments,report.duration);c.diarized=diarizedTranscript(c.rows,c.turns,report.duration,formatTime);}catch(e){if(signal.aborted)throw e;c.diarizationError=e.message;}finally{worker.terminate();active=null;}
  report.stages.diarizationMs=performance.now()-t;
  report.status=report.results.every(r=>r.status==='complete')&&!c.alignmentFailed&&!c.diarizationError&&c.turns?.length?'complete':'partial';status('Испытание завершено: '+report.status);$('progress').value=$('progress').max;
 }catch(e){report.status=signal.aborted?'cancelled':'partial';report.error=e.message;status('Испытание '+(signal.aborted?'остановлено':e.message)+'. Сохраните доступный отчёт.');}
 finally{active?.terminate();active=null;report.wallMs=performance.now()-started;abort=null;render();}
};
actions();

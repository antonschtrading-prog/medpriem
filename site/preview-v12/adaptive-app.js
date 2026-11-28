import {runAdaptive,runtimePolicy,displayTranscript} from './adaptive-core.js';
import {to16kMono,validateAudioBuffer,formatTime} from './audio.js';
import {sileroPauseRanges} from './silero-segmentation.js';
import {pauseAwareRanges} from './pause-segmentation.js';
import {normalizeSpeakerTurns} from './diarization.js';
import {loadCheckpoint,saveCheckpoint,clearCheckpoint,fingerprint} from './benchmark-storage.js';
import {downloadText,cleanFilename} from './exports.js';
const $=id=>document.getElementById(id);
let report=null,abort=null,ready=false,url=null;
const status=t=>{$('status').textContent=t;};
const policy=runtimePolicy({isolated:crossOriginIsolated,cores:navigator.hardwareConcurrency,memory:navigator.deviceMemory});
function actions(){const busy=!!abort;$('start').disabled=!ready||busy||!$('audio').files.length||!$('consent').checked||report?.status==='complete';$('start').textContent=report?'Продолжить':'Начать расшифровку';$('stop').disabled=!busy;$('reset').disabled=!ready||busy||!report;$('audio').disabled=busy;$('consent').disabled=busy;$('txt').disabled=!report?.rows?.length;$('json').disabled=!report;}
function render(){
 $('result').value=report?displayTranscript(report):'';
 $('metrics').textContent=report?Object.entries(report.timing??{}).map(([k,v])=>k+': '+(v/1000).toFixed(1)+' с').join(' · ')+' · WASM '+policy.threads+' поток(а)':'';
 const host=$('review');host.replaceChildren();
 if(report){
  for(const r of report.rows??[]){if(!r.review&&!r.boundaryReview&&!r.suspicious)continue;const line=document.createElement('p'),b=document.createElement('button');b.textContent='▶ '+formatTime(r.startSeconds);b.onclick=()=>{if(url){$('player').currentTime=r.startSeconds;$('player').play().catch(()=>{});}};line.append(b,document.createTextNode(' '+(r.review?.status??'стык')+' · '+(r.review?.critical??[]).join(', ')+' · '+(r.review?.alternate??r.text)));host.append(line);}
  if(report.reviewDeferred?.length){const p=document.createElement('p');p.textContent='Отложено для ручной проверки: '+report.reviewDeferred.map(j=>formatTime(report.rows[j.index].startSeconds)).join(', ');host.append(p);}
  if(report.diarizationError){const p=document.createElement('p');p.textContent='Голоса: '+report.diarizationError;host.append(p);}
 }
 actions();
}
async function persist(){await saveCheckpoint(report);$('storage').textContent='Сохранено локально: '+report.rows.length+' / '+(report.ranges?.length??0)+' фрагментов';render();}
function request(worker,data,signal,ok,error,timeout){
 return new Promise((resolve,reject)=>{
  const done=(fn,v)=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);worker.onmessage=null;worker.onerror=null;fn(v);};
  const cancel=()=>done(reject,new DOMException('Остановлено','AbortError'));
  const timer=setTimeout(()=>done(reject,Error('Таймаут '+data.type)),timeout);
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted){cancel();return;}
  worker.onerror=e=>done(reject,Error(e.message||'Ошибка worker'));
  worker.onmessage=({data:r})=>{if(r.id!==data.id)return;if(r.type===ok)done(resolve,r);if(r.type===error)done(reject,Error(r.message));};
  worker.postMessage(data,data.samples?[data.samples.buffer]:[]);
 });
}
async function launch(){
 if(abort||!$('consent').checked||!$('audio').files.length)return;
 abort=new AbortController();const signal=abort.signal;let matched=false;actions();
 try{
  report=await loadCheckpoint()??null;const f=$('audio').files[0],bytes=await f.arrayBuffer(),hash=await fingerprint(bytes);
  if(report&&report.fileHash!==hash){status('Другой файл. Удалите сохранённое испытание явно или выберите исходную запись.');return;}
  if(report?.status==='complete'){status('Расшифровка уже завершена.');return;}
  matched=true;
  report??={schema:1,version:'1.2',file:f.name,fileHash:hash,rows:[],timing:{},turns:[],status:'running'};
  await persist();status('Подготовка звука');let decoded;const t=performance.now(),ctx=new AudioContext({sampleRate:16000});
  try{decoded=await ctx.decodeAudioData(bytes);}finally{await ctx.close();}
  report.duration=validateAudioBuffer(decoded);
  const pcm=to16kMono(decoded);
  if(!report.ranges){try{report.ranges=(await sileroPauseRanges(decoded,pcm)).ranges;report.vad='silero';}catch{report.ranges=pauseAwareRanges(decoded);report.vad='energy';}}
  decoded=null;report.timing.preparation=(report.timing.preparation??0)+performance.now()-t;
  if(!report.ranges.length||report.ranges.at(-1).endSample!==pcm.length)throw Error('Границы звука не совпадают');
  await persist();
  function createEngine(key){const worker=new Worker('./asr-worker.js?v=12',{type:'module'});let id=0;return {recognize:samples=>request(worker,{type:'recognize',id:++id,modelKey:key,samples,threads:policy.threads},signal,'recognized','error',600000),close:()=>worker.terminate()};}
  const diarize=async samples=>{const w=new Worker('./diarization-worker.js?v=12',{type:'module'});try{const d=await request(w,{type:'diarize',id:1,samples:samples.slice(),threads:policy.threads},signal,'diarization-result','diarization-error',1200000);return normalizeSpeakerTurns(d.segments,report.duration);}finally{w.terminate();}};
  await runAdaptive({report,pcm,createEngine,diarize,save:persist,signal,notify:(name,i,n)=>{status(name+' · '+(i+1)+' / '+n);$('progress').max=n;$('progress').value=i;}});
  $('progress').value=$('progress').max;status(report.status==='complete'?'Расшифровка завершена. Проверьте спорные места.':'Текст сохранён. Дополнительная обработка завершена не полностью.');
 }catch(e){if(matched&&report){report.status=signal.aborted?'cancelled':'partial';report.error=String(e.message||e);}status(signal.aborted?'Остановлено. Можно продолжить.':'Ошибка: '+e.message);}
 finally{if(matched&&report){try{await persist();}catch(e){$('storage').textContent='Ошибка сохранения: '+e.message+' — скачайте JSON.';}}abort=null;render();}
}
$('audio').onchange=()=>{if(url)URL.revokeObjectURL(url);url=$('audio').files.length?URL.createObjectURL($('audio').files[0]):null;$('player').hidden=!url;if(url)$('player').src=url;actions();};
$('consent').onchange=actions;
$('start').onclick=async()=>{if(abort)return;try{if(navigator.locks){await navigator.locks.request('medpriem-adaptive-v12',{ifAvailable:true},async lock=>{if(lock)await launch();else status('Обработка уже идёт в другой вкладке.');});}else await launch();}catch(e){status(e.message);}};
$('stop').onclick=()=>abort?.abort();
$('reset').onclick=async()=>{if(abort||!confirm('Удалить сохранённую расшифровку?'))return;try{const clear=async()=>{await clearCheckpoint();report=null;$('storage').textContent='Удалено';status('Выберите запись.');render();};if(navigator.locks)await navigator.locks.request('medpriem-adaptive-v12',{ifAvailable:true},async lock=>{if(lock)await clear();else status('Другая вкладка обрабатывает запись.');});else await clear();}catch(e){status(e.message);}};
$('txt').onclick=()=>downloadText((report.status==='complete'?'':'НЕПОЛНАЯ ОБРАБОТКА\n\n')+displayTranscript(report),cleanFilename(report.file)+'_dialogue.txt');
$('json').onclick=()=>downloadText(JSON.stringify(report,null,2),cleanFilename(report.file)+'_v12.json');
(async()=>{try{report=await loadCheckpoint()??null;ready=true;if(report){status('Сохранённая расшифровка восстановлена. Для продолжения выберите тот же файл.');$('storage').textContent='Восстановлено '+report.rows.length+' фрагментов';}else status('Выберите аудиозапись.');try{await navigator.storage?.persist?.();}catch{}}catch(e){status('Локальное хранилище недоступно: '+e.message);}render();})();

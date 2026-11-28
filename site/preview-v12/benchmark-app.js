import {loadCheckpoint,saveCheckpoint,clearCheckpoint,fingerprint,matchesFile} from './benchmark-storage.js';
import {KEYS,runComparison,reuseReview,scoreReference} from './benchmark-core.js';
import {to16kMono,validateAudioBuffer,formatTime} from './audio.js';
import {sileroPauseRanges} from './silero-segmentation.js';
import {pauseAwareRanges} from './pause-segmentation.js';
import {normalizeWindowChunks} from './word-timing.js';
import {normalizeSpeakerTurns,diarizedTranscript} from './diarization.js';
import {resolveModel} from './model-options.js';
import {downloadText,cleanFilename} from './exports.js';
const $=id=>document.getElementById(id);
let report=null,abort=null,active=null,ready=false;
const checkpoint=async()=>{if(report){await saveCheckpoint(report);$('storage').textContent='Локально сохранено: '+report.results.filter(r=>r.status==='complete').length+' из 5 моделей, '+new Date().toLocaleTimeString('ru-RU');}};
function fillRanges(){ $('end').replaceChildren();for(const r of report?.ranges??[]){const o=document.createElement('option');o.value=r.endSeconds;o.textContent=formatTime(r.endSeconds);$('end').append(o);} $('end').selectedIndex=$('end').options.length-1; }
const status=t=>{$('status').textContent=t;};
function actions(){const busy=!!abort;$('start').disabled=!ready||busy||!$('audio').files.length||!$('consent').checked||report?.status==='complete';$('start').textContent=report?'Продолжить сохранённое испытание':'Запустить все модели';$('discard').disabled=!ready||busy||!report;$('stop').disabled=!busy;$('audio').disabled=busy;$('primary').disabled=busy;$('consent').disabled=busy;$('save').disabled=!report;$('score').disabled=busy||!report?.results.some(r=>r.status==='complete');}
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
 const host=$('results');host.replaceChildren();if(!report){actions();return;}
 for(const r of report.results){
  const p=document.createElement('p');p.textContent=resolveModel(r.key).label+' · '+r.status+' · '+r.rows.length+' / '+(report.ranges?.length??0)+' фрагм. · всего '+(r.wallMs/1000).toFixed(1)+' с · загрузка/инициализация '+(r.loadMs/1000).toFixed(1)+' с · inference '+(r.inferMs/1000).toFixed(1)+' с · RTF '+(r.wallMs/1000/report.duration).toFixed(3)+(r.error?' · '+r.error:'');
  const b=document.createElement('button');b.textContent='TXT';b.onclick=()=>downloadText('Модель: '+r.key+'; статус: '+r.status+'\n'+r.transcript,cleanFilename(report.file)+'_'+r.key+'.txt');host.append(p,b);
 }
 if(report.complex){const c=report.complex,p=document.createElement('p');p.textContent='Комплексный режим: проверено '+c.compared+' / '+c.selected+'; ROVER '+c.third+'; выравнивание '+(c.aligned??0)+'; голоса '+(c.turns?new Set(c.turns.map(t=>t.speaker)).size:0);host.append(p);if(c.diarized){const b=document.createElement('button');b.textContent='TXT с говорящими';b.onclick=()=>downloadText(c.diarized,cleanFilename(report.file)+'_complex.txt');host.append(b);}}
 actions();
}
$('stop').onclick=()=>abort?.abort();
$('save').onclick=()=>{if(report)downloadText(JSON.stringify(report,null,2),cleanFilename(report.file)+'_benchmark.json');};
$('score').onclick=async()=>{const output={};for(const r of report.results.filter(x=>x.status==='complete')){try{output[r.key]=scoreReference($('reference').value,r.rows,Number($('end').value));}catch(e){output[r.key]={error:e.message};}}report.scores=output;$('scores').textContent=JSON.stringify(output,null,2);try{await checkpoint();}catch(e){$('storage').textContent='Ошибка сохранения: '+e.message;}};
async function startRun(){
 if(abort||!$('consent').checked||!$('audio').files.length)return;
 const file=$('audio').files[0],primary=$('primary').value,started=performance.now();let matched=false;abort=new AbortController();const signal=abort.signal;
 actions();
 try{
  report=await loadCheckpoint()??null;status('Проверка выбранного файла');const bytes=await file.arrayBuffer(),hash=await fingerprint(bytes);
  if(report&&!matchesFile(report,hash)){status('Выбран другой файл. Для новой записи удалите сохранённое испытание явно.');return;}
  matched=true;if(report?.status==='complete'){status('Испытание уже завершено. Скачайте отчёт.');return;}
  if(!report){report={schema:1,version:'1.1.1',file:file.name,fileHash:hash,results:[],status:'running',primary,stages:{}};await checkpoint();}
  report.status='running';report.primary=primary;delete report.error;render();
  status('Декодирование записи');let t=performance.now(),decoded;
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  try{decoded=await ctx.decodeAudioData(bytes);}finally{await ctx.close();}
  const duration=validateAudioBuffer(decoded);if(report.duration&&Math.abs(report.duration-duration)>.05)throw Error('Длительность сохранённого файла отличается');report.duration=duration;report.stages.decodeMs=(report.stages.decodeMs??0)+performance.now()-t;
  if(signal.aborted)throw new DOMException('Остановлено','AbortError');
  t=performance.now();status('Silero VAD: единая сегментация');
  let ranges=report.ranges;if(!ranges?.length){try{ranges=(await sileroPauseRanges(decoded)).ranges;report.vad='silero';}catch(e){ranges=pauseAwareRanges(decoded);report.vad='energy';report.vadError=e.message;}}
  report.stages.vadMs=(report.stages.vadMs??0)+performance.now()-t;t=performance.now();
  const pcm=to16kMono(decoded);decoded=null;report.stages.resampleMs=(report.stages.resampleMs??0)+performance.now()-t;
  if(!ranges.length||ranges.at(-1).endSample!==pcm.length)throw Error('Границы сохранённого звука не совпадают с декодированием');
  report.ranges=ranges;fillRanges();await checkpoint();
  report.results=await runComparison({ranges,pcm,signal,createEngine:key=>newEngine(key,signal),notify:(key,i,n)=>{status(resolveModel(key).label+' · '+(i+1)+' / '+n);$('progress').max=KEYS.length*n;$('progress').value=KEYS.indexOf(key)*n+i;},previous:report.results,publish:async r=>{report.results=r;await checkpoint();render();}});
  if(signal.aborted)throw new DOMException('Остановлено','AbortError');
  t=performance.now();const oldComplex=report.complex;const c=report.complex=reuseReview(report.results,primary,ranges);if(oldComplex?.primaryKey===primary){for(let i=0;i<c.rows.length;i++){const old=oldComplex.rows[i];if(old?.text===c.rows[i].text&&['ctc','rejected'].includes(old.alignment)){c.rows[i].alignment=old.alignment;c.rows[i].timedChunks=old.timedChunks;}}}report.stages.reuseReviewMs=performance.now()-t;await checkpoint();
  t=performance.now();c.aligned=c.rows.filter(r=>r.alignment==='ctc').length;c.alignmentRejected=c.rows.filter(r=>r.alignment==='rejected').length;c.alignmentFailed=0;
  let worker=new Worker('./alignment-worker.js?v=11',{type:'module'});active=worker;
  try{for(let i=0;i<c.rows.length;i++){const row=c.rows[i],r=ranges[i];if(!row.text.trim()||['ctc','rejected'].includes(row.alignment))continue;status('CTC '+(i+1)+' / '+c.rows.length);
   try{const a=await request(worker,{type:'align',id:i,text:row.text,samples:pcm.slice(r.startSample,r.endSample)},signal,'aligned','alignment-error',180000);
    const chunks=normalizeWindowChunks(a.chunks,row.text,r,r);
    if(a.accepted&&chunks.length){row.timedChunks=chunks;row.alignment='ctc';c.aligned++;}else{row.alignment='rejected';c.alignmentRejected++;}
   }catch(e){if(signal.aborted)throw e;row.alignment='failed';c.alignmentFailed++;c.alignmentError=e.message;break;}
   await checkpoint();
  }}finally{worker.terminate();active=null;}
  report.stages.alignmentMs=(report.stages.alignmentMs??0)+performance.now()-t;t=performance.now();status('Определение говорящих');
  worker=new Worker('./diarization-worker.js',{type:'module'});active=worker;
  try{const d=await request(worker,{type:'diarize',id:1,samples:pcm.slice()},signal,'diarization-result','diarization-error',1200000);c.turns=normalizeSpeakerTurns(d.segments,report.duration);c.diarized=diarizedTranscript(c.rows,c.turns,report.duration,formatTime);}catch(e){if(signal.aborted)throw e;c.diarizationError=e.message;}finally{worker.terminate();active=null;}
  report.stages.diarizationMs=performance.now()-t;await checkpoint();
  report.status=report.results.every(r=>r.status==='complete')&&!c.alignmentFailed&&!c.diarizationError&&c.turns?.length?'complete':'partial';status('Испытание завершено: '+report.status);$('progress').value=$('progress').max;
 }catch(e){if(matched&&report){report.status=signal.aborted?'cancelled':'partial';report.error=e.message;}status('Испытание '+(signal.aborted?'остановлено':e.message)+'. Сохраните доступный отчёт.');}
 finally{active?.terminate();active=null;if(matched&&report){report.wallMs=(report.wallMs??0)+performance.now()-started;try{await checkpoint();}catch(e){$('storage').textContent='Не удалось сохранить: '+e.message+'. Скачайте JSON до закрытия страницы.';}}abort=null;render();}
}
$('start').onclick=async()=>{if(abort)return;try{if(navigator.locks){await navigator.locks.request('medpriem-benchmark-v11',{ifAvailable:true},async lock=>{if(!lock){status('Испытание уже выполняется в другой вкладке.');return;}await startRun();});}else await startRun();}catch(e){status(e.message);}};
$('discard').onclick=async()=>{if(abort||!confirm('Удалить сохранённый результат? Сначала скачайте JSON, если он нужен.'))return;try{if(navigator.locks){const cleared=await navigator.locks.request('medpriem-benchmark-v11',{ifAvailable:true},async lock=>{if(!lock)return false;await clearCheckpoint();return true;});if(!cleared){status('Нельзя удалить: другая вкладка выполняет испытание.');return;}}else await clearCheckpoint();report=null;$('storage').textContent='Локальное испытание удалено';$('scores').textContent='';fillRanges();render();}catch(e){status(e.message);}};
(async()=>{try{report=await loadCheckpoint()??null;if(report){$('primary').value=report.primary;fillRanges();$('storage').textContent='Восстановлено: '+report.results.filter(r=>r.status==='complete').length+' из 5 моделей. Выберите тот же аудиофайл для продолжения.';status(report.status==='complete'?'Испытание завершено. Отчёт доступен.':'Продолжение доступно после выбора того же файла.');}ready=true;try{await navigator.storage?.persist?.();}catch{}}catch(e){$('storage').textContent='Локальное хранилище недоступно: '+e.message;status('Запуск заблокирован, чтобы не потерять результаты.');}render();})();
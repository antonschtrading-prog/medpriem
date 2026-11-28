import {loadCheckpoint} from '../../preview-v12/benchmark-storage.js';
import {diarizedTranscript} from '../../preview-v12/diarization.js';
import {formatTime} from '../../preview-v12/audio.js';
import {safeFormat} from './format-safe.js';
import {medicalReview} from './medical-review.js';
const $=id=>document.getElementById(id);
let report=null,worker=null,proposed=null;
const status=t=>{$('status').textContent=t;};
function actions(){const busy=!!worker;$('load').disabled=busy;$('file').disabled=busy;$('format').disabled=busy||!report;$('cancel').disabled=!busy;$('download').disabled=!proposed;}
function load(data){
 if(!data||!Array.isArray(data.rows)||!data.rows.length||data.rows.length>10000||data.rows.some(r=>typeof r.text!=='string'||!Number.isFinite(r.startSeconds)||!Number.isFinite(r.endSeconds)||r.startSeconds<0||r.endSeconds<=r.startSeconds))throw Error('Некорректная расшифровка 1.2');
 if(data.status==='running')throw Error('Сначала завершите или остановите распознавание.');
 report=data;proposed=null;$('raw').value=report.turns?.length?diarizedTranscript(report.rows,report.turns,report.duration,formatTime):report.rows.map(r=>'['+formatTime(r.startSeconds)+'] '+(r.text||'[речь не распознана]')).join('\n\n');$('formatted').value='';
 const root=$('flags');root.replaceChildren();let checked=0,flagged=0;
 for(const r of report.rows){if(r.review?.status!=='compared'||typeof r.review.alternate!=='string')continue;checked++;const a=medicalReview(r.rawRecognition??r.text,r.review.alternate);if(!a.needsReview)continue;flagged++;const el=document.createElement('p');el.textContent=r.startSeconds.toFixed(1)+' с · '+r.text+' | Вторая модель: '+r.review.alternate+' | '+[...a.missing.map(x=>'нет: '+x.word),...a.added.map(x=>'добавлено: '+x.word),...a.termMissing.map(x=>'термин отсутствует: '+x),...a.termAdded.map(x=>'термин добавлен: '+x)].join('; ');root.append(el);}
 if(!flagged)root.textContent=checked?'В проверенных фрагментах выбранных расхождений не найдено.':'Нет результатов второй модели для сравнения.';
 status('Загружено '+report.rows.length+' фрагментов; проверено двумя моделями '+checked+'.'+(report.status!=='complete'?' Обработка неполная.':''));actions();
}
function failure(e){report=null;proposed=null;$('raw').value='';$('formatted').value='';$('flags').replaceChildren();status(String(e.message||e));actions();}
$('load').onclick=async()=>{try{const read=async()=>load(await loadCheckpoint());if(navigator.locks){await navigator.locks.request('medpriem-adaptive-v12',{ifAvailable:true},async lock=>{if(!lock)throw Error('Распознавание выполняется в другой вкладке.');await read();});}else await read();}catch(e){failure(e);}};
$('file').onchange=async()=>{try{const f=$('file').files[0];if(!f)return;if(f.size>20*1024*1024)throw Error('Слишком большой JSON');load(JSON.parse(await f.text()));}catch(e){failure(e);}};
function stop(){worker?.terminate();worker=null;actions();}
$('cancel').onclick=()=>{stop();status('Остановлено. Исходная расшифровка не изменена.');};
$('format').onclick=()=>{if(!report||worker)return;proposed=null;$('formatted').value='';status('Загрузка модели пунктуации…');try{
 // Format the display lines, not source rows, so timing and speaker grouping remain unchanged.
 const lines=$('raw').value.split('\n\n').map(line=>{const m=line.match(/^(\[[^\]]+\]\s+(?:Говорящий[^:]*:\s*)?)(.*)$/u);return m?{prefix:m[1],raw:m[2]}:{prefix:'',raw:line};});
 worker=new Worker('./review-worker.js',{type:'module'});actions();
 worker.onerror=e=>{stop();status('Ошибка пунктуации: '+e.message);};
 worker.onmessage=({data})=>{
  if(data.type==='progress'){status('Пунктуация: '+data.done+' / '+data.total);return;}
  if(data.type==='error'){stop();status('Ошибка пунктуации: '+data.message);return;}
  if(data.type!=='complete')return;
  if(!Array.isArray(data.results)||data.results.length!==lines.length){stop();status('Некорректный результат модели.');return;}
  let changed=0;proposed=lines.map((l,i)=>{const a=data.results[i],p=a?.accepted&&typeof a.text==='string'?safeFormat(l.raw,a.text):{text:l.raw,accepted:false};if(p.accepted&&p.text!==l.raw)changed++;return l.prefix+p.text;}).join('\n\n');
  $('formatted').value=proposed;stop();status('Готово. Изменено фрагментов: '+changed+'. Проверьте результат.');
 };worker.postMessage({type:'format',rows:lines.map(l=>l.raw)});
 }catch(e){stop();status('Ошибка пунктуации: '+e.message);}};
$('download').onclick=()=>{if(!proposed)return;const u=URL.createObjectURL(new Blob(['ПРЕДЛОЖЕННАЯ ПУНКТУАЦИЯ — ПРОВЕРЬТЕ ТЕКСТ.\n'+(report.status==='complete'?'':'НЕПОЛНАЯ ОБРАБОТКА.\n')+'\n'+proposed],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='medpriem-punctuation.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
window.addEventListener('pagehide',stop);actions();

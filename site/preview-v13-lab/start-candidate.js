import {enableIsolation} from './isolation.js';
const status=document.querySelector('#status');
const audio=document.querySelector('#audio'),consent=document.querySelector('#consent');
audio.disabled=true;consent.disabled=true;
status.textContent='Подготовка вычислительного режима…';
try{
 const result=await enableIsolation();
 if(result.reason!=='reloading'){
  await import('./adaptive-app.js');
  window.candidateBoot=result;
  // Wait for IndexedDB initialization, not merely module evaluation.
  await window.candidateReady;
  audio.disabled=false;consent.disabled=false;
  document.documentElement.dataset.candidateReady='true';
 }
}catch(e){status.textContent='Ошибка запуска: '+String(e.message||e);document.documentElement.dataset.candidateReady='error';}

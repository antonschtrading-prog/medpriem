// Explicit experimental scope; never controls the published 1.2 directory.
export async function enableIsolation(){
 if(crossOriginIsolated)return {isolated:true,reason:'already-isolated'};
 if(!isSecureContext||!navigator.serviceWorker)return {isolated:false,reason:'unsupported'};
 // One reload per tab, even on failed installation or unsupported browser.
 const key='medpriem-lab-isolation-attempt';
 try{
  if(sessionStorage.getItem(key))return {isolated:false,reason:'reload-did-not-isolate'};
  const r=await navigator.serviceWorker.register('./isolation-sw.js',{scope:'./'});
  await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('service-worker-ready-timeout')),8000))]);
  if(!navigator.serviceWorker.controller){
   await new Promise(resolve=>{const done=()=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',done);resolve();};const timer=setTimeout(done,8000);navigator.serviceWorker.addEventListener('controllerchange',done);if(navigator.serviceWorker.controller)done();});
  }
  if(!navigator.serviceWorker.controller)return {isolated:false,reason:'no-controller'};
  sessionStorage.setItem(key,'1');location.reload();return {isolated:false,reason:'reloading'};
 }catch(e){return {isolated:false,reason:String(e.message||e)};}
}
const result=await enableIsolation();
document.querySelector('#status').textContent=JSON.stringify(result);
window.labIsolation=result;

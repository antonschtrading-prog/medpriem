// Only de-identified test transcripts and timings, no audio bytes. Same origin IndexedDB.
const DB='medpriem-adaptive-v12',STORE='checkpoint',ID='active';
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Хранилище заблокировано другой вкладкой'));});}
async function transaction(mode,action){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),r=action(tx.objectStore(STORE));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Сохранение прервано'));});}finally{db.close();}}
export const loadCheckpoint=()=>transaction('readonly',s=>s.get(ID));
export const saveCheckpoint=report=>transaction('readwrite',s=>s.put(report,ID));
export const clearCheckpoint=()=>transaction('readwrite',s=>s.delete(ID));
export async function fingerprint(buffer){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',buffer));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
export function matchesFile(report,hash){return report?.schema===1&&report.fileHash===hash;}

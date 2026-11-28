// Conservative default: no simultaneous heavyweight engines without opt-in experimental evidence.
export function planRuntime({isolated=false,shared=false,cores=1,memory=null,failedIsolation=false,webkit=false}={}){
 const usable=isolated&&shared&&!failedIsolation&&!webkit;
 const threads=usable&&Number.isFinite(cores)&&cores>=4&&(memory==null||Number.isFinite(memory)&&memory>=4)?2:1;
 return Object.freeze({threads,provider:'wasm',parallelModels:1,isolated:usable});
}
// Retry only failed engine operation; caller owns checkpoint and worker cleanup.
export async function withThreadFallback(run,plan,signal){
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 try{return {value:await run(plan),plan};}catch(error){
  if(signal?.aborted||error?.name==='AbortError'||plan.threads===1||!/wasm|sharedarraybuffer|pthread|thread|memory|worker|timeout|таймаут/i.test(String(error?.message||error)))throw error;
  const fallback={...plan,threads:1,parallelModels:1};
  return {value:await run(fallback),plan:fallback,fallbackReason:String(error.message||error)};
 }
}

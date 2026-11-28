// Do not enable parallel heavyweight models on unknown-memory devices.
export function parallelExperiment({isolated=false,cores=0,memoryGB=null,explicit=false}={}){
 return explicit&&isolated&&Number.isFinite(cores)&&cores>=4&&Number.isFinite(memoryGB)&&memoryGB>=8?{enabled:true,asrThreads:1,diarThreads:1}:{enabled:false};
}
export function cacheableModelRequest(request){
 const u=new URL(request.url);
 // Restrict to immutable, pinned public model artifacts; never cache text/audio POSTs or arbitrary URLs.
 return request.method==='GET'&&u.protocol==='https:'&&u.hostname==='huggingface.co'&&!u.search&&!u.hash&&/^\/(?:istupakov\/gigaam-v3-onnx\/resolve\/322c3b29492673eb7d0b434bfa9dfb8653e34d02|briox\/diarization-js-community-1\/resolve\/7f02c43a14eff6d4dea0a4f8099f1ca48eb163b8)\/[a-zA-Z0-9._/-]+\.(?:onnx|json|txt)$/u.test(u.pathname);
}
export function summarizeRuns(cold,warm){
 if(!Number.isFinite(cold)||!Number.isFinite(warm)||cold<=0||warm<0)throw Error('Invalid timings');
 return {coldMs:cold,warmMs:warm,savedMs:cold-warm,ratio:warm/cold};
}

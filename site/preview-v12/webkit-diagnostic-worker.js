// Diagnostic only. Stream stage boundaries before awaits.
const mark=(stage,detail={})=>self.postMessage({kind:'stage',stage,...detail});
const originalFetch=self.fetch.bind(self);
self.fetch=async(...args)=>{const u=new URL(typeof args[0]==='string'?args[0]:args[0].url??String(args[0]),self.location.href);const file=u.pathname.split('/').pop();mark('fetch-start',{host:u.hostname,file});try{const r=await originalFetch(...args);mark('fetch-headers',{file,status:r.status});return r;}catch(e){mark('fetch-error',{file,error:String(e.message||e)});throw e;}};
self.onmessage=async({data})=>{try{
 const {model,threads,samples}=data;mark('worker-enter',{isolated:self.crossOriginIsolated,threads});
 if(model==='diarization'){
  mark('import-ort');const ort=await import('https://esm.sh/onnxruntime-web@1.24.3');mark('import-diarization');const {DiarizationPipeline}=await import('https://esm.sh/diarization-js@0.1.0?deps=onnxruntime-web@1.24.3');
  ort.env.wasm.numThreads=threads;ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/';
  const root='https://huggingface.co/briox/diarization-js-community-1/resolve/7f02c43a14eff6d4dea0a4f8099f1ca48eb163b8/';
  const files=await Promise.all(['segmentation-3.0.onnx','embedding-resnet34.onnx','plda-params-vbx.json'].map(async file=>{mark('artifact-start',{file});const r=await fetch(root+file);if(!r.ok)throw Error(file+': '+r.status);const b=await r.arrayBuffer();mark('artifact-complete',{file,bytes:b.byteLength});return b;}));
  mark('diarization-session-create');const engine=await DiarizationPipeline.create({ort,segmentationModel:files[0],embeddingModel:files[1],pldaParamsJson:JSON.parse(new TextDecoder().decode(files[2])),executionProviders:['wasm'],segmentationBatchSize:1,embeddingBatchSize:1});
  mark('diarization-inference');const {result}=await engine.run(samples,16000);self.postMessage({kind:'complete',segments:result.segments.length});
 }else{
  mark('import-gigaam-wrapper');const {loadGigaam}=await import('./gigaam.js');
  const importer=async()=>{mark('import-onnx-asr-web');const api=await import('https://esm.sh/onnx-asr-web@0.1.3/browser?deps=onnxruntime-web@1.24.3');mark('onnx-asr-web-imported');return api;};
  mark('asr-load');const pipe=await loadGigaam(importer,model,threads);mark('asr-inference');const r=await pipe(samples);self.postMessage({kind:'complete',text:r.text,words:r.chunks.length});
 }
}catch(e){self.postMessage({kind:'error',error:String(e.message||e)});}};

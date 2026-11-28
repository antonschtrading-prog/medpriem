// Experimental profiling worker only; production worker unchanged.
const ROOT='https://huggingface.co/briox/diarization-js-community-1/resolve/7f02c43a14eff6d4dea0a4f8099f1ca48eb163b8/';
async function artifact(file){const r=await fetch(ROOT+file);if(!r.ok)throw Error(file+': '+r.status);return r.arrayBuffer();}
self.onmessage=async({data})=>{try{
 const start=performance.now();
 const [ort,{DiarizationPipeline}]=await Promise.all([import(data.provider==='webgpu'?'https://esm.sh/onnxruntime-web@1.24.3/webgpu':'https://esm.sh/onnxruntime-web@1.24.3'),import('https://esm.sh/diarization-js@0.1.0?deps=onnxruntime-web@1.24.3')]);
 ort.env.wasm.numThreads=data.threads;ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/';
 const [segmentationModel,embeddingModel,plda]=await Promise.all(['segmentation-3.0.onnx','embedding-resnet34.onnx','plda-params-vbx.json'].map(artifact));
 const engine=await DiarizationPipeline.create({ort,segmentationModel,embeddingModel,pldaParamsJson:JSON.parse(new TextDecoder().decode(plda)),executionProviders:[data.provider],segmentationBatchSize:1,embeddingBatchSize:1});
 const loadMs=performance.now()-start,t=performance.now();const {result}=await engine.run(data.samples,16000);
 self.postMessage({loadMs,inferMs:performance.now()-t,segments:result.segments,isolated:self.crossOriginIsolated,threads:ort.env.wasm.numThreads});
}catch(e){self.postMessage({error:String(e.message||e)});}};

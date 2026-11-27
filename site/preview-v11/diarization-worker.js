// Uses diarization-js MIT; weights: pyannote MIT, WeSpeaker CC-BY-4.0.
const ROOT='https://huggingface.co/briox/diarization-js-community-1/resolve/7f02c43a14eff6d4dea0a4f8099f1ca48eb163b8/';
let busy=false;
async function artifact(file){const r=await fetch(ROOT+file);if(!r.ok)throw Error(file+': '+r.status);return r.arrayBuffer();}
self.onmessage=async({data})=>{
 if(data?.type!=='diarize'||busy)return;busy=true;const id=data.id;
 try{
  self.postMessage({type:'diarization-progress',id,message:'Загрузка Diarization-JS…'});
  const [ort,{DiarizationPipeline}]=await Promise.all([import('https://esm.sh/onnxruntime-web@1.24.3'),import('https://esm.sh/diarization-js@0.1.0?deps=onnxruntime-web@1.24.3')]);
  ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/';
  const [segmentationModel,embeddingModel,plda]=await Promise.all(['segmentation-3.0.onnx','embedding-resnet34.onnx','plda-params-vbx.json'].map(artifact));
  const engine=await DiarizationPipeline.create({ort,segmentationModel,embeddingModel,pldaParamsJson:JSON.parse(new TextDecoder().decode(plda)),executionProviders:['wasm'],segmentationBatchSize:1,embeddingBatchSize:1});
  const {result}=await engine.run(data.samples,16000);
  self.postMessage({type:'diarization-result',id,segments:result.segments});
 }catch(e){self.postMessage({type:'diarization-error',id,message:String(e?.message||e)});}finally{busy=false;}
};
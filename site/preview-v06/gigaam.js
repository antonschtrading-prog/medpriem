export const GIGAAM_REPO='istupakov/gigaam-v3-onnx';
export const GIGAAM_REVISION='322c3b29492673eb7d0b434bfa9dfb8653e34d02';
export const GIGAAM_FILES=['config.json','v3_vocab.txt','v3_rnnt_encoder.int8.onnx','v3_rnnt_decoder.int8.onnx','v3_rnnt_joint.int8.onnx'];
export async function loadGigaam(importer=()=>import('https://esm.sh/onnx-asr-web@0.1.3/browser?deps=onnxruntime-web@1.24.3')){
  const api=await importer();
  api.configureOrtWeb({numThreads:1,wasmPaths:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/'});
  const engine=await api.loadHuggingfaceModel(GIGAAM_REPO,{revision:GIGAAM_REVISION,quantization:'int8',sessionOptions:{executionProviders:['wasm']}});
  return async samples=>{
    const result=await engine.transcribeSamples(samples,16000);
    return {text:typeof result.text==='string'?result.text:'',chunks:[]};
  };
}
export async function checkGigaam(fetcher=fetch){
  const res=await fetcher('https://huggingface.co/api/models/'+GIGAAM_REPO+'/tree/'+GIGAAM_REVISION,{method:'GET',cache:'no-store'});
  if(!res.ok)throw Error('GigaAM: HTTP '+res.status);
  const rows=await res.json();
  const names=new Set(rows.map(r=>r.path));
  return {id:GIGAAM_REPO,type:'gigaam',family:'gigaam',ready:GIGAAM_FILES.every(n=>names.has(n)),missing:GIGAAM_FILES.filter(n=>!names.has(n))};
}

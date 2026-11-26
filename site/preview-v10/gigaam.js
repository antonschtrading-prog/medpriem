export const GIGAAM_REPO='istupakov/gigaam-v3-onnx';
export const GIGAAM_REVISION='322c3b29492673eb7d0b434bfa9dfb8653e34d02';
export const GIGAAM_FILES=['config.json','v3_vocab.txt','v3_rnnt_encoder.int8.onnx','v3_rnnt_decoder.int8.onnx','v3_rnnt_joint.int8.onnx'];
export async function loadGigaam(importer=()=>import('https://esm.sh/onnx-asr-web@0.1.3/browser?deps=onnxruntime-web@1.24.3'),modelKey='gigaam'){
  const api=await importer();
  api.configureOrtWeb({numThreads:1,wasmPaths:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/'});
  if(modelKey!=='gigaam') {
    const prefix=modelKey==='gigaam_e2e_ctc'?'v3_e2e_ctc':'v3_e2e_rnnt';
    const root='https://huggingface.co/'+GIGAAM_REPO+'/resolve/'+GIGAAM_REVISION+'/';
    const core=await import('https://esm.sh/onnx-asr-web@0.1.3?deps=onnxruntime-web@1.24.3');
    const [config,vocabularyText]=await Promise.all([fetch(root+'config.json').then(r=>{if(!r.ok)throw Error('config '+r.status);return r.json();}),fetch(root+prefix+'_vocab.txt').then(r=>{if(!r.ok)throw Error('vocab '+r.status);return r.text();})]);
    const ctc=modelKey==='gigaam_e2e_ctc';
    const engine=await core.createAsrModel({modelType:'gigaam',decoderKind:ctc?'ctc':'gigaam-rnnt',config,encoderModel:root+prefix+(ctc?'.int8.onnx':'_encoder.int8.onnx'),...(ctc?{}:{decoderModel:root+prefix+'_decoder.int8.onnx',decoderJointModel:root+prefix+'_joint.int8.onnx'}),vocabularyText,sessionOptions:{executionProviders:['wasm']}});
    return async samples=>{const r=await engine.transcribeSamples(samples,16000);return {text:r.text||'',chunks:[]};};
  }
  const engine=await api.loadHuggingfaceModel(GIGAAM_REPO,{revision:GIGAAM_REVISION,quantization:'int8',sessionOptions:{executionProviders:['wasm']}});
  return async samples=>{
    const result=await engine.transcribeSamples(samples,16000);
    return {text:typeof result.text==='string'?result.text:'',chunks:[]};
  };
}
export async function checkGigaam(fetcher=fetch,modelKey='gigaam'){
  const required=modelKey==='gigaam_e2e_ctc'?['config.json','v3_e2e_ctc_vocab.txt','v3_e2e_ctc.int8.onnx']:modelKey==='gigaam_e2e_rnnt'?['config.json','v3_e2e_rnnt_vocab.txt','v3_e2e_rnnt_encoder.int8.onnx','v3_e2e_rnnt_decoder.int8.onnx','v3_e2e_rnnt_joint.int8.onnx']:GIGAAM_FILES;
  const res=await fetcher('https://huggingface.co/api/models/'+GIGAAM_REPO+'/tree/'+GIGAAM_REVISION,{method:'GET',cache:'no-store'});
  if(!res.ok)throw Error('GigaAM: HTTP '+res.status);
  const rows=await res.json();
  const names=new Set(rows.map(r=>r.path));
  return {id:GIGAAM_REPO,type:'gigaam',family:'gigaam',ready:required.every(n=>names.has(n)),missing:required.filter(n=>!names.has(n))};
}

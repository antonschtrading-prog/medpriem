import {alignTranscript} from './forced-alignment.js';
import {GIGAAM_REPO,GIGAAM_REVISION} from './gigaam.js';
let engine;
async function load(){
 if(engine)return engine;
 const api=await import('https://esm.sh/onnx-asr-web@0.1.3?deps=onnxruntime-web@1.24.3');
 api.configureOrtWeb({numThreads:1,wasmPaths:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/'});
 const root='https://huggingface.co/'+GIGAAM_REPO+'/resolve/'+GIGAAM_REVISION+'/';
 const fetchChecked=async(file)=>{const r=await fetch(root+file);if(!r.ok)throw Error(file+': '+r.status);return r;};
 const [config,vocabularyText]=await Promise.all([fetchChecked('config.json').then(r=>r.json()),fetchChecked('v3_vocab.txt').then(r=>r.text())]);
 engine=await api.createAsrModel({modelType:'gigaam',decoderKind:'ctc',config,encoderModel:root+'v3_ctc.int8.onnx',vocabularyText,sessionOptions:{executionProviders:['wasm']}});
 return engine;
}
self.onmessage=async({data})=>{
 if(data?.type!=='align')return;
 try{
  const {samples,text,id}=data;if(!(samples instanceof Float32Array)||samples.length<8000||samples.length>480000)throw Error('Invalid alignment audio');
  const model=await load();
  const inputs=model.encoder.prepareInputsFromWaveform(samples);
  const encoded=await model.encoder.run(inputs.signal,inputs.length);
  const chunks=alignTranscript(encoded,text,model.tokens,model.decoder.blankTokenId,samples.length/16000);
  const greedy=await model.decoder.decode(encoded.encodedData,encoded.encodedDims,encoded.encodedLayout,encoded.encodedLength);
  const greedyText=greedy.tokenIds.map(i=>model.tokens[i]).filter(t=>t&&!/^<.*>$/.test(t)).join('').replace(/▁/g,' ').trim();
  self.postMessage({type:'aligned',id,chunks:chunks??[],accepted:!!chunks,diagnostic:{greedyText,blank:model.decoder.blankTokenId,frames:encoded.encodedLength,vocab:model.tokens.length}});
 }catch(e){self.postMessage({type:'alignment-error',id:data.id,message:String(e?.message||e)});}
};

import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import './stage-v13-candidate.mjs';

const root=process.cwd(),dst='site/preview-v13-lab',vendor=path.join(dst,'vendor');
await fs.mkdir(vendor,{recursive:true});
const wasmAlias={name:'cpu-only-onnx',setup(b){
 b.onResolve({filter:/^onnxruntime-web$/},()=>b.resolve('onnxruntime-web/wasm',{resolveDir:root,kind:'import-statement'}));
 b.onResolve({filter:/^onnxruntime-web\/(webgpu|all|webgl|experimental|jspi)$/},args=>({errors:[{text:'Unexpected GPU runtime import: '+args.path}]}));
}};
const entries={
 asr:"export {configureOrtWeb,loadHuggingfaceModel} from 'onnx-asr-web/browser'; export {createAsrModel} from 'onnx-asr-web';",
 diarization:"export * as ort from 'onnxruntime-web/wasm'; export {DiarizationPipeline} from 'diarization-js';"
};
for(const [name,contents] of Object.entries(entries)){
 const out=await build({stdin:{contents,resolveDir:root,sourcefile:name+'-wasm-entry.js'},bundle:true,format:'esm',platform:'browser',conditions:['onnxruntime-web-use-extern-wasm','browser'],target:'es2022',minify:true,metafile:true,outfile:path.join(vendor,name+'.mjs'),plugins:[wasmAlias]});
 const inputs=Object.keys(out.metafile.inputs);
 assert.ok(inputs.some(x=>/onnxruntime-web\/dist\/ort\.wasm[^/]*\.mjs$/i.test(x)),JSON.stringify(inputs.filter(x=>x.includes('onnxruntime-web'))));
 assert.ok(!inputs.some(x=>/onnxruntime-web\/dist\/.*(?:jsep|webgpu|webgl|ort\.(?:bundle\.)?min\.mjs)/i.test(x)),'Unexpected universal/GPU ORT bundle');
 console.log('CPU_ONLY_BUNDLE',name,inputs.filter(x=>x.includes('onnxruntime-web')));
}
for(const name of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']){
 await fs.copyFile(path.join(root,'node_modules/onnxruntime-web/dist',name),path.join(vendor,name));
}
const patch=async(name,edits)=>{
 const file=path.join(dst,name);let code=await fs.readFile(file,'utf8');
 for(const [a,b] of edits){assert.ok(code.includes(a),'Missing anchor '+name+': '+a);code=code.replaceAll(a,()=>b);}
 await fs.writeFile(file,code);
};
const wasmPath="new URL('./vendor/',import.meta.url).href";
await patch('gigaam.js',[
 ["import('https://esm.sh/onnx-asr-web@0.1.3/browser?deps=onnxruntime-web@1.24.3')","import('./vendor/asr.mjs')"],
 ["import('https://esm.sh/onnx-asr-web@0.1.3?deps=onnxruntime-web@1.24.3')","import('./vendor/asr.mjs')"],
 ["wasmPaths:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/'","wasmPaths:"+wasmPath],
 ["numThreads:threads","numThreads:1"],
 ["sessionOptions:{executionProviders:['wasm']}","sessionOptions:{executionProviders:['wasm'],enableCpuMemArena:false,enableMemPattern:false}"]
]);
await patch('diarization-worker.js',[
 ["const [ort,{DiarizationPipeline}]=await Promise.all([import('https://esm.sh/onnxruntime-web@1.24.3'),import('https://esm.sh/diarization-js@0.1.0?deps=onnxruntime-web@1.24.3')]);","const {ort,DiarizationPipeline}=await import('./vendor/diarization.mjs');"],
 ["ort.env.wasm.numThreads=Math.max(1,Math.min(4,Number(data.threads)||1));ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/';","ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths="+wasmPath+";"],
 ["const {result}=await engine.run(data.samples,16000);","self.postMessage({type:'diarization-progress',id,message:'WASM-only inference'});\n  const {result}=await engine.run(data.samples,16000);"]
]);
// A mandatory review is enabled only in the CI fixture; normal selection stays unchanged.
if(process.env.FORCE_REVIEW==='1'){
 await patch('adaptive-core.js',[
  ['const plan=reviewPlan(report.rows,report.ranges);','const plan=reviewPlan(report.rows,report.ranges);if(!plan.selected.length){if(!report.rows.length)throw Error("No ASR rows");plan.selected.push({index:0,score:1,reasons:["CI forced review"],window:recognitionWindow(report.ranges,0)});}const originalText=JSON.stringify(report.rows.map(r=>r.text));'],
  ["  check();\n  if(!report.diarizationDone){","  if(JSON.stringify(report.rows.map(r=>r.text))!==originalText)throw Error('Primary transcript changed');\n  check();\n  if(!report.diarizationDone){"]
 ]);
}
console.log('WASM-only candidate staged; original models and weights unchanged');

import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGigaam,checkGigaam,GIGAAM_FILES} from '../site/preview-v06/gigaam.js';
import {resolveModel} from '../site/preview-v06/model-options.js';
test('GigaAM uses local PCM adapter without invented timings',async()=>{
let options,rate;const run=await loadGigaam(async()=>({configureOrtWeb(){},async loadHuggingfaceModel(id,o){options=o;return {async transcribeSamples(samples,r){rate=r;return {text:'проверка'};}}}}));
assert.deepEqual(await run(new Float32Array(16000)),{text:'проверка',chunks:[]});assert.equal(rate,16000);assert.equal(options.quantization,'int8');assert.equal(resolveModel('gigaam').family,'gigaam');});
test('manifest detects missing weights',async()=>{const r=await checkGigaam(async()=>({ok:true,json:async()=>GIGAAM_FILES.slice(1).map(path=>({path}))}));assert.equal(r.ready,false);assert.deepEqual(r.missing,['config.json']);});
test('manifest accepts complete list',async()=>assert.equal((await checkGigaam(async()=>({ok:true,json:async()=>GIGAAM_FILES.map(path=>({path}))}))).ready,true));

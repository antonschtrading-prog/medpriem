import test from 'node:test';import assert from 'node:assert/strict';import {forceAlign,alignTranscript,tokenizeForAlignment} from '../site/preview-v10/forced-alignment.js';
const enc=sequence=>({encodedData:Float32Array.from(sequence.flatMap(v=>[0,1,2].map(i=>i===v?8:-8))),encodedDims:[1,sequence.length,3],encodedLayout:'BTV',encodedLength:sequence.length});
test('CTC path repeated labels require blank',()=>{let x=forceAlign(enc([0,1,0,1,0]),[1,1],0,5);assert.deepEqual(x.map(a=>[a.start,a.end]),[[1,2],[3,4]]);});
test('CTC rejects unsupported acoustic label',()=>assert.equal(forceAlign(enc([0,1,1,0]),[2],0,4),null));
test('exact original punctuation preserved',()=>{const x=alignTranscript(enc([0,1,0,2,0]),'Да, нет!',['<blank>','да','нет'],0,5);assert.equal(x.map(w=>w.text).join(''),'Да, нет!');assert.deepEqual(x.map(w=>w.timestamp),[[1,2],[3,4]]);});
test('unknown token fails safely',()=>assert.equal(tokenizeForAlignment('кот',['<blank>','а'],0),null));

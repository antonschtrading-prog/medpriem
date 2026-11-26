import test from 'node:test';import assert from 'node:assert/strict';import {wordNetwork,consensus} from '../site/preview-v10/fusion.js';
test('majority insertion',()=>assert.deepEqual(consensus('это тест','это новый тест','это новый тест'),[{index:1,primary:null,suggestion:'новый',votes:2}]));
test('majority deletion',()=>assert.deepEqual(consensus('это лишний тест','это тест','это тест'),[{index:1,primary:'лишний',suggestion:null,votes:2}]));
test('three-way tie stays unresolved',()=>assert.deepEqual(consensus('пять','шесть','семь'),[]));
test('network supports multiword insertion',()=>{let n=wordNetwork(['да','ну конечно да','ну конечно да']);assert.deepEqual(n.map(c=>c.winner),['ну','конечно','да']);});

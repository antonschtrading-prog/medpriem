import test from 'node:test';
import assert from 'node:assert/strict';
import { checkModelManifest } from '../site/preflight.js';

const fakeFetch = (paths) => async url => {
  if (String(url).endsWith('/config.json')) return { ok:true, json: async () => ({model_type:'whisper'}) };
  return { ok:true, json:async () => paths.map(path => ({path:'onnx/'+path})) };
};
test('preflight confirms that model exposes quantized encoder and decoder', async () => {
  const result=await checkModelManifest('medium', fakeFetch([
    'encoder_model_int8.onnx','decoder_model_merged_int8.onnx'
  ]));
  assert.equal(result.q8Ready,true);
  assert.equal(result.type,'whisper');
});
test('preflight fails closed when model has no quantized decoder', async () => {
  const result=await checkModelManifest('turbo', fakeFetch([
    'encoder_model_quantized.onnx','decoder_model.onnx'
  ]));
  assert.equal(result.q8Ready,false);
});
test('preflight rejects missing model config without downloading large weights', async () => {
  const fetcher=async () => ({ok:false,status:404});
  await assert.rejects(checkModelManifest('turbo_ru',fetcher), /HTTP 404/);
});

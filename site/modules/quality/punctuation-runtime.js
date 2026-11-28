import {proposePunctuation} from './punctuation-proposal.js';
export const MODEL='Horizon-Labs/punctuation-restoration-small';
// Exact last-token offsets only; reject missing offsets rather than guessing subword positions.
export function predictionsAtWordEnds(raw,tags){
 const ends=new Set([...raw.matchAll(/[\p{L}\p{N}]+/gu)].map(m=>m.index+m[0].length));
 return tags.filter(t=>Number.isInteger(t.end)&&Number.isInteger(t.start)&&t.start>=0&&t.end>t.start&&ends.has(t.end)&&['.',',','?'].includes(t.entity)).map(t=>({end:t.end,label:t.entity,score:t.score}));
}
export async function createPunctuator({revision,importer=()=>import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1')}={}){
 if(!/^[a-f0-9]{40}$/.test(revision??''))throw Error('Pinned model revision required');
 const {pipeline,env}=await importer();env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;
 const tagger=await pipeline('token-classification',MODEL,{revision,dtype:'q8',device:'wasm'});
 return {async propose(raw){if(typeof raw!=='string'||raw.length>600||raw.trim().split(/\s+/u).length>80)throw Error('Text window exceeds tested limit');const tags=await tagger(raw,{ignore_labels:[]});if(!Array.isArray(tags))throw Error('Invalid token output');return {tags,proposal:proposePunctuation(raw,predictionsAtWordEnds(raw,tags))};},dispose:()=>tagger.dispose()};
}

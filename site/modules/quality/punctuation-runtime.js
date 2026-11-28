import {proposePunctuation} from './punctuation-proposal.js';
export const MODEL='Horizon-Labs/punctuation-restoration-small';
// Exact last-token offsets only; reject missing offsets rather than guessing subword positions.
export function predictionsAtWordEnds(raw,tags){
 if(!Array.isArray(tags)||!tags.length)return [];
 // Transformers.js 3.8.1 returns indexed decoded subwords, not character offsets.
 // Reconstruct against the original text strictly, accepting only whitespace differences.
 // Any mismatch, omitted token, nonconsecutive index or normalization => abstain on entire window.
 const ends=new Set([...raw.matchAll(/[\p{L}\p{N}]+/gu)].map(m=>m.index+m[0].length));
 let pos=0,previous=0;const out=[];
 for(const t of tags){
  if(!Number.isInteger(t.index)||t.index!==previous+1||typeof t.word!=='string')return [];
  previous=t.index;
  const token=t.word;
  if(!token.trim()||/[\uFFFD]/u.test(token))return [];
  let i=0;
  if(/^\s/u.test(token)){while(i<token.length&&/\s/u.test(token[i]))i++;while(pos<raw.length&&/\s/u.test(raw[pos]))pos++;}
  else if(pos===0){while(pos<raw.length&&/\s/u.test(raw[pos]))pos++;}
  // Match each decoded character without case folding, Unicode normalization, or search ahead.
  for(;i<token.length;i++){
   if(/\s/u.test(token[i])){if(!/\s/u.test(raw[pos]??''))return [];while(pos<raw.length&&/\s/u.test(raw[pos]))pos++;while(i+1<token.length&&/\s/u.test(token[i+1]))i++;continue;}
   if(raw[pos]!==token[i])return [];pos++;
  }
  if(ends.has(pos)&&['.',',','?'].includes(t.entity))out.push({end:pos,label:t.entity,score:t.score});
 }
 return raw.slice(pos).trim()===''?out:[];
}
export async function createPunctuator({revision,importer=()=>import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1')}={}){
 if(!/^[a-f0-9]{40}$/.test(revision??''))throw Error('Pinned model revision required');
 const {pipeline,env}=await importer();env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;
 const tagger=await pipeline('token-classification',MODEL,{revision,dtype:'q8',device:'wasm'});
 return {async propose(raw){if(typeof raw!=='string'||raw.length>600||raw.trim().split(/\s+/u).length>80)throw Error('Text window exceeds tested limit');const tags=await tagger(raw,{ignore_labels:[]});if(!Array.isArray(tags))throw Error('Invalid token output');return {tags,proposal:proposePunctuation(raw,predictionsAtWordEnds(raw,tags))};},dispose:()=>tagger.dispose()};
}

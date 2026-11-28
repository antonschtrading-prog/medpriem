import fs from 'node:fs/promises';
import {KEYS,reuseReview} from '../site/preview-v11/benchmark-core.js';
const results=[];
for(const key of KEYS){try{results.push(JSON.parse(await fs.readFile('benchmark-output/'+key+'.json','utf8')));}catch{results.push({key,status:'missing'});}}
const done=results.filter(r=>r.status==='complete');
const consistent=done.length>0&&done.every(r=>r.hash===done[0].hash&&JSON.stringify(r.ranges)===JSON.stringify(done[0].ranges));
let complex=null;
if(consistent&&done.some(r=>r.key==='gigaam_e2e_rnnt')){complex=reuseReview(done,'gigaam_e2e_rnnt',done[0].ranges);}
const metrics=results.map(r=>({key:r.key,status:r.status,wallMs:r.wallMs,loadMs:r.loadMs,inferMs:r.inferMs,rtf:r.duration?r.wallMs/1000/r.duration:null,segments:r.rows?.length,error:r.error}));
const summary={source:'https://www.easyrussian.fm/99',startSeconds:153,endSeconds:190,consistent,metrics,complex,results,accuracy:'No verified word-level reference in this run; speed and disagreement are not accuracy.'};
await fs.writeFile('benchmark-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({consistent,metrics,review:complex&&{selected:complex.selected,compared:complex.compared,third:complex.third}},null,2));
if(!consistent||done.length!==5)process.exitCode=1;

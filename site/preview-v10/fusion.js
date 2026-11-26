// ROVER-style dynamic-programming alignment; independent JS implementation.
// NIST reference: https://github.com/usnistgov/SCTK/blob/master/src/sclite/rover.c
import {russianTokens} from './quality.js';
export function alignWords(a,b){
 const n=a.length,m=b.length;if(n>600||m>600)throw Error('Слишком длинный фрагмент для сверки');
 const d=Array.from({length:n+1},()=>new Uint16Array(m+1));
 for(let i=0;i<=n;i++)d[i][0]=i;for(let j=0;j<=m;j++)d[0][j]=j;
 for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]!==b[j-1]));
 const rows=[];let i=n,j=m;
 while(i||j){if(i&&j&&d[i][j]===d[i-1][j-1]+(a[i-1]!==b[j-1])){rows.push([a[--i],b[--j]]);}else if(i&&d[i][j]===d[i-1][j]+1){rows.push([a[--i],null]);}else{rows.push([null,b[--j]]);}}
 return rows.reverse();
}
export function wordDifferences(primary,alternate){return alignWords(russianTokens(primary),russianTokens(alternate)).filter(([a,b])=>a!==b).map(([a,b])=>({primary:a,alternate:b}));}
// ROVER-style progressive multiple alignment: align each hypothesis to the
// existing word-transition network. Every column has one vote per hypothesis,
// including null (deletion). Ties preserve primary. Never edits the transcript.
export function wordNetwork(hypotheses){
 if(!Array.isArray(hypotheses)||hypotheses.length<2||hypotheses.length>5)throw Error('Нужно от двух до пяти гипотез');
 const sequences=hypotheses.map(russianTokens);
 let columns=sequences[0].map(word=>[word]);
 for(let k=1;k<sequences.length;k++){
  const representatives=columns.map(c=>c.find(x=>x!==null));
  const rows=alignWords(representatives,sequences[k]);let i=0;
  columns=rows.map(([a,b])=>a===null?[...Array(k).fill(null),b]:[...columns[i++],b]);
 }
 return columns.map((values,index)=>{
  const counts=new Map();for(const v of values)counts.set(v,(counts.get(v)||0)+1);
  const sorted=[...counts].sort((a,b)=>b[1]-a[1]||Number(b[0]===values[0])-Number(a[0]===values[0]));
  const [winner,votes]=sorted[0];
  return {index,values,winner,votes,majority:votes>hypotheses.length/2,alternatives:sorted.map(([word,count])=>({word,count}))};
 });
}
export function consensus(primary,second,third){
 const network=wordNetwork([primary,second,third]);let index=0;
 return network.flatMap(c=>{
  const original=c.values[0],at=index;if(original!==null)index++;
  if(!c.majority||c.winner===original)return [];
  return [{index:at,primary:original,suggestion:c.winner,votes:c.votes}];
 });
}

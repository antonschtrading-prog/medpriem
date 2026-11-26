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
export function consensus(primary,second,third){
 const a=russianTokens(primary),b=russianTokens(second),c=russianTokens(third);
 // Anchor two alignments to primary; insertions remain visible as alternatives, never silently applied.
 const map=rows=>rows.filter(([x])=>x!==null).map(([,y])=>y);
 const bMap=map(alignWords(a,b)),cMap=map(alignWords(a,c));
 return a.flatMap((word,i)=>{const x=bMap[i],y=cMap[i];return x&&x===y&&x!==word?[{index:i,primary:word,suggestion:x,votes:2}]:[];});
}

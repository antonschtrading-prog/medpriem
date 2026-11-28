export const SECTIONS=Object.freeze(['complaints','history','examination','prescriptions','recommendations']);
export function createDraft(rows){
 if(!Array.isArray(rows))throw TypeError('Expected transcript rows');
 const sources=rows.map((r,i)=>{
  if(typeof r.text!=='string'||!Number.isFinite(r.startSeconds)||!Number.isFinite(r.endSeconds)||r.startSeconds<0||r.endSeconds<=r.startSeconds)throw Error('Invalid source row '+i);
  return {id:'r'+i,text:r.text,startSeconds:r.startSeconds,endSeconds:r.endSeconds,speaker:r.speaker??null};
 });
 return {schema:1,status:'draft',sources,sections:Object.fromEntries(SECTIONS.map(s=>[s,[]]))};
}
export function addEvidence(draft,section,sourceId,quote){
 if(!SECTIONS.includes(section))throw Error('Invalid section');
 const source=draft.sources.find(s=>s.id===sourceId);
 if(!source||typeof quote!=='string'||!quote.trim()||!source.text.includes(quote))throw Error('Quote not supported by source');
 return {...draft,status:'draft',sections:{...draft.sections,[section]:[...draft.sections[section],{sourceId,quote}]}};
}
export function exportDraft(draft){
 const labels={complaints:'Жалобы',history:'Анамнез',examination:'Осмотр',prescriptions:'Назначения',recommendations:'Рекомендации'};
 return ['ЧЕРНОВИК — НЕ ПРОВЕРЕН. НЕ МЕДИЦИНСКОЕ ЗАКЛЮЧЕНИЕ.',...SECTIONS.map(s=>labels[s]+':\n'+(draft.sections[s].map(e=>{const r=draft.sources.find(x=>x.id===e.sourceId);if(!r||!r.text.includes(e.quote))throw Error('Invalid evidence');return '• '+e.quote+' [источник '+r.id+', '+r.startSeconds.toFixed(1)+'–'+r.endSeconds.toFixed(1)+' с]';}).join('\n')||'Не заполнено'))].join('\n\n');
}

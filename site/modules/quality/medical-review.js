import {clinicalAudit} from './clinical-audit.js';
// Preserve original wording. Flag possible medical term disagreements, not diagnosis.
const term=/^(?:антибиотик|анальгетик|антикоагулянт|аллерги|аритми|тахикарди|брадикарди|гипертони|гипотони|гипергликеми|гипогликеми|гипертензи|гипотензи|инсулин|метформин|аспирин|амоксициллин|парацетамол|ибупрофен|варфарин|преднизолон|пенициллин|отек|отёк|одышк|тошнот|рвот|кровотеч)/u;
const terms=s=>(String(s).toLocaleLowerCase('ru-RU').match(/\p{L}+/gu)||[]).filter(w=>term.test(w));
export function medicalReview(primary,alternate){const base=clinicalAudit(primary,alternate),a=terms(primary),b=terms(alternate);const missing=a.filter(w=>!b.includes(w)),added=b.filter(w=>!a.includes(w));return {...base,termMissing:missing,termAdded:added,needsReview:base.needsReview||missing.length+added.length>0,automaticCorrection:false};}

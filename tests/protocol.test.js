import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDraft,addEvidence,exportDraft,SECTIONS} from '../site/modules/protocol/protocol.js';
const rows=[{text:'не принимать препарат до осмотра',startSeconds:1,endSeconds:5}];
test('empty sections and no invented data',()=>{const d=createDraft(rows);assert.ok(SECTIONS.every(s=>d.sections[s].length===0));assert.match(exportDraft(d),/Не заполнено/);});
test('exact source quote, immutable draft',()=>{const d=createDraft(rows),e=addEvidence(d,'recommendations','r0',rows[0].text);assert.equal(d.sections.recommendations.length,0);assert.match(exportDraft(e),/не принимать препарат/);});
test('reject invented prescription and invalid source',()=>{const d=createDraft(rows);assert.throws(()=>addEvidence(d,'prescriptions','r0','принимать 5 мг'));assert.throws(()=>addEvidence(d,'prescriptions','r99','не принимать'));});
test('reject damaged input or exported evidence',()=>{assert.throws(()=>createDraft([{text:'x',startSeconds:5,endSeconds:1}]));const d=createDraft(rows);d.sections.prescriptions.push({sourceId:'r0',quote:'5 мг'});assert.throws(()=>exportDraft(d));});

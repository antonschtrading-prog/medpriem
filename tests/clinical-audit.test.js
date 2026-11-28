import {test} from 'node:test';import assert from 'node:assert/strict';import {clinicalAudit} from '../site/modules/quality/clinical-audit.js';
test('negation disagreement flagged without rewriting',()=>{const a=clinicalAudit('не принимать пять мг','принимать пять мг');assert.ok(a.needsReview);assert.equal(a.primary,'не принимать пять мг');assert.equal(a.automaticCorrection,false);});
test('unit and numeric context changes flagged',()=>{assert.ok(clinicalAudit('два мг','два г').needsReview);assert.ok(clinicalAudit('5 мг','50 мг').needsReview);});
test('case and ordinary punctuation do not trigger',()=>assert.equal(clinicalAudit('Нет жалоб.','нет жалоб').needsReview,false));
test('repeated cues counted',()=>assert.ok(clinicalAudit('нет боли нет боли','нет боли').needsReview));

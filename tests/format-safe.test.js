import {test} from 'node:test';import assert from 'node:assert/strict';import {safeFormat,formatRows} from '../site/modules/quality/format-safe.js';
test('negation cannot be separated by inserted punctuation',()=>assert.equal(safeFormat('не принимать лекарство','Не, принимать лекарство.').accepted,false));
test('case and final period safe for critical row',()=>assert.equal(safeFormat('доза 5 мг','Доза 5 мг.').accepted,true));
test('number range protected',()=>assert.equal(safeFormat('60 80','60, 80').accepted,false));
test('spoken number protected',()=>assert.equal(safeFormat('два три','Два, три.').accepted,false));
test('async format preserves original row and errors',async()=>{const r={text:'добрый день',startSeconds:0};const x=await formatRows([r],async()=>{throw Error('offline')});assert.equal(x[0].formatted.text,r.text);assert.equal(x[0].text,r.text);assert.equal(x[0].formatted.accepted,false);});

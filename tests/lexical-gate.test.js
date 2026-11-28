import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptFormatting,reviewCandidates} from '../site/modules/quality/lexical-gate.js';
test('accept punctuation and case without changing words',()=>assert.equal(acceptFormatting('жалоб нет давление нормальное','Жалоб нет. Давление нормальное.').accepted,true));
for(const [a,b] of [['не принимать препарат','Принимать препарат.'],['доза 0,5 мг','Доза 5 мг.'],['60–80','68'],['два миллиграмма','Два грамма.'],['120/80','120:80'],['по-русски','по русски'],['ёлка','елка'],['препарат','препарат®'],['доза 5%','доза 5']])test('reject '+b,()=>assert.deepEqual(acceptFormatting(a,b).text,a));
test('formatter failure preserves raw',()=>assert.equal(reviewCandidates([{text:'не принимать'}],()=>{throw Error('offline')})[0].text,'не принимать'));

import {test} from 'node:test';import assert from 'node:assert/strict';import {suggestSections} from '../site/modules/protocol/suggest.js';
test('suggest whole utterance',()=>assert.deepEqual(suggestSections([{id:'r1',text:'рекомендую не принимать препарат'}]),[{sourceId:'r1',section:'recommendations',quote:'рекомендую не принимать препарат',requiresConfirmation:true}]));
test('abstain when ambiguous',()=>assert.deepEqual(suggestSections([{id:'a',text:'осмотр рекомендую'},{id:'b',text:'добрый день'}]),[]));

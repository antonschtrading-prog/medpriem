import {test} from 'node:test';import assert from 'node:assert/strict';import {proposePunctuation} from '../site/modules/quality/punctuation-proposal.js';
test('exact word ends, high score only',()=>assert.equal(proposePunctuation('здравствуйте как дела',[{end:12,label:',',score:.99},{end:21,label:'?',score:.99}]).text,'здравствуйте, как дела?'));
test('ignore internal and low confidence',()=>assert.equal(proposePunctuation('добрый день',[{end:2,label:'.',score:1},{end:11,label:'.',score:.2}]).text,'добрый день'));
test('critical context blocks comma',()=>assert.equal(proposePunctuation('не принимать',[{end:2,label:',',score:1}]).text,'не принимать'));

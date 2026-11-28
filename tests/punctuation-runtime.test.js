import {test} from 'node:test';
import assert from 'node:assert/strict';
import {predictionsAtWordEnds} from '../site/modules/quality/punctuation-runtime.js';
import {proposePunctuation} from '../site/modules/quality/punctuation-proposal.js';
const tags=(parts)=>parts.map(([word,entity='0'],i)=>({word,entity,index:i+1,score:.99}));
test('actual decoded subwords align only at whole-word end',()=>{const raw='не принимайте препарат до осмотра';const p=predictionsAtWordEnds(raw,tags([[' не'],[' принима',','],['йте'],[' препарат'],[' до'],[' осмо'],['тра','.']]));assert.deepEqual(p,[{end:raw.length,label:'.',score:.99}]);assert.equal(proposePunctuation(raw,p).text,raw+'.');});
test('insert comma after verified word without changing text',()=>{const raw='я думаю что будет дождь';const p=predictionsAtWordEnds(raw,tags([[' я'],[' думаю',','],[' что'],[' будет'],[' дож'],['дь','.']]));assert.equal(proposePunctuation(raw,p).text,'я думаю, что будет дождь.');});
test('abstain on mismatched, truncated or skipped token streams',()=>{for(const t of [tags([[' я'],[' думал',',']]),tags([[' я'],[' думаю',',']]),[{word:' я',index:2,entity:',',score:.99}]])assert.deepEqual(predictionsAtWordEnds('я думаю что',t),[]);});
test('never alter critical internal punctuation',()=>{const raw='не принимайте препарат';assert.equal(proposePunctuation(raw,predictionsAtWordEnds(raw,tags([[' не',','],[' принимайте'],[' препарат','.']]))).text,raw);});

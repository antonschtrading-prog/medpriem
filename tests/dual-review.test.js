import test from 'node:test';
import assert from 'node:assert/strict';
import {selectReviewJobs,compareReview,sanitizeReview} from '../site/preview-v06/dual-review.js';
const range={startSeconds:0,endSeconds:10,startSample:0,endSample:160000,forcedCut:false};
test('selects critical facts and independent engine',()=>{let [j]=selectReviewJobs([{text:'не принимать 5 мг'}],[range],'medium',true);assert.equal(j.modelKey,'turbo_ru');assert.equal(j.endSample,160000);});
test('selects absent text and short output',()=>assert.equal(selectReviewJobs([{text:''}],[range],'xlsr_ru',true)[0].modelKey,'small'));
test('detects changed dosage and negation without replacing',()=>{let r=compareReview('не пить 5 мг','пить 50 мг',{modelKey:'xlsr_ru',startSample:0,endSample:160000,reasons:[]});assert.deepEqual(r.critical,['numbers','negation']);assert.equal(r.primary,'не пить 5 мг');assert.equal(r.differs,true);assert.deepEqual(sanitizeReview(r),r);});
test('matching words is not a correction',()=>assert.equal(compareReview('Да, хорошо','да хорошо',{modelKey:'small',startSample:0,endSample:160000,reasons:[]}).differs,false));
test('rejects invalid checkpoint review',()=>assert.equal(sanitizeReview({status:'compared',modelKey:'small',startSeconds:4,endSeconds:2}),undefined));

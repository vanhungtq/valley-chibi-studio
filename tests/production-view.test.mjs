import test from 'node:test';
import assert from 'node:assert/strict';
import {productionReview,productionDetail,qualityFeedback} from '../public/production-view.js';
import {reviewedOutput} from './production-fixtures.mjs';
import {sampleOutput} from '../worker/api.js';

test('structured concept and review cards escape imported content and show the selected concept',()=>{
 const output=reviewedOutput(sampleOutput(1),1);output.quality={verdict:'passed'};
 output.production.data.concepts[0].title='<img src=x onerror=alert(1)>';
 output.production.review.checks[0].evidence='<script>bad()</script>';
 const html=productionDetail(output,1)+productionReview(output);
 assert.match(html,/Đã chọn/);assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);assert.ok(!html.includes('<script>'));assert.match(html,/Codex đã tự rà soát/);
});
test('old backups and malformed imported contracts degrade without breaking the review dialog',()=>{
 assert.equal(productionDetail(sampleOutput(0),0),'');
 assert.equal(productionReview({quality:{verdict:'legacy'}}).includes('Bản bàn giao cũ'),true);
 assert.match(productionDetail({production:{schemaVersion:'1.0',data:{}}},1),/chưa đủ trường/);
 assert.equal(productionReview({quality:{verdict:'passed'},production:{review:{}}}),'');
});
test('quality feedback includes a concrete field and repair action without rendering HTML',()=>{
 const html=qualityFeedback({verdict:'needs_revision',issues:[{field:'shotDesigns[0]',message:'Thiếu mục đích shot',proposedFix:'Thêm <purpose> gắn hành động'}]});
 assert.match(html,/shotDesigns\[0\]/);assert.match(html,/&lt;purpose&gt;/);assert.match(html,/Cần chỉnh trước khi bàn giao/);
});

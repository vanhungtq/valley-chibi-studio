import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState} from '../public/data.js';
import {productionBook,shotCsv,projectJson} from '../public/exports.js';

test('production book and backups distinguish a 30-minute goal from the current eight-minute shot allocation',async()=>{
 const state=seedState(),episode=state.episodes[0];episode.targetMinutes=30;episode.autoApprove=true;
 episode.outputs[0]={title:'Định hướng',content:'Nội dung đã lưu',sources:[],mode:'codex',approval:{mode:'automatic',at:new Date().toISOString()}};
 episode.approved=[0];episode.stage=1;
 const book=await productionBook(state,episode);
 assert.match(book,/30 PHÚT MỤC TIÊU/);assert.match(book,/08:00 ĐÃ PHÂN BỔ/);
 assert.match(book,/Thời lượng mục tiêu của tập: 30 phút/);assert.match(book,/Đã tự động duyệt/);
 const csv=shotCsv(episode);assert.match(csv,/Thời lượng mục tiêu tập \(phút\)/);assert.ok(csv.split('\r\n').slice(1).every(row=>row.endsWith(',"30"')));
 const restored=JSON.parse(projectJson(state)).state.episodes[0];assert.equal(restored.targetMinutes,30);assert.equal(restored.autoApprove,true);assert.equal(restored.outputs[0].approval.mode,'automatic');
});

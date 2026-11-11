import test from 'node:test';
import assert from 'node:assert/strict';
import {cropRects,storyboardBatches,storyboardPrompt,boardMarkup,boardAsset} from '../public/storyboard.js';
import {seedState} from '../public/data.js';

test('2x2 crops cover an odd-sized image without gaps or overlaps',()=>{
 const rects=cropRects(1601,901);assert.deepEqual(rects,[[0,0,800,450],[800,0,801,450],[0,450,800,451],[800,450,801,451]]);assert.equal(rects.reduce((n,[x,y,w,h])=>n+w*h,0),1601*901);
});
test('storyboard prompts preserve shot order and a final partial group',()=>{
 const s=seedState(),ep=s.episodes[0];ep.scenes=ep.scenes.slice(0,2);ep.scenes[1].shots=ep.scenes[1].shots.slice(0,1);const groups=storyboardBatches(ep);assert.equal(groups.length,2);assert.equal(groups[1].length,1);assert.match(storyboardPrompt(s.project,ep,groups[1]),/ô còn lại để màu xám/);assert.match(storyboardPrompt(s.project,ep,groups[0]),/\["S01","S02","S03","S04"\]/);
});
test('AI board mapping takes precedence over location photos and exports the correct atlas panel',()=>{
 const s=seedState(),ep=s.episodes[0],shot=ep.scenes[0].shots[0];s.assets.push({id:'photo',name:'Hiện trường',mime:'image/jpeg',url:'/photo.jpg'},{id:'atlas',name:'AI <test>',mime:'image/png',url:'/atlas.png'});shot.assetIds=['photo'];ep.storyboards={S01:{assetId:'atlas',panel:3,generated:true}};
 const board=boardAsset(s,ep,shot);assert.equal(board.asset.id,'atlas');const markup=boardMarkup(board,'data:image/png;base64,a');assert.match(markup,/viewBox="1600 900 1600 900"/);assert.match(markup,/AI &lt;test&gt;/);delete ep.storyboards.S01;assert.equal(boardAsset(s,ep,shot).generated,false);
});

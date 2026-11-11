import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handleApi} from '../worker/api.js';
import {seedState} from '../public/data.js';

test('DOM integration: navigation, notes, sample review, revisions, and new episode',async()=>{
 const {window}=parseHTML('<!doctype html><html><body><div id="app"></div><div id="modal-root"></div><div id="toasts"></div></body></html>');
 const selectPrototype=Object.getPrototypeOf(window.document.createElement('select')),selectValue=Object.getOwnPropertyDescriptor(selectPrototype,'value');if(!selectValue.set)Object.defineProperty(selectPrototype,'value',{...selectValue,set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===value);}});
 const saved={};for(const k of ['window','document','location','FormData','fetch','setInterval','setTimeout'])saved[k]=globalThis[k];
 const nativeTimeout=globalThis.setTimeout;
 const sqlite=new DatabaseSync(':memory:');sqlite.exec((await readFile(new URL('../drizzle/0000_studio.sql',import.meta.url),'utf8'))+'\n'+await readFile(new URL('../drizzle/0001_codex_tasks.sql',import.meta.url),'utf8'));
 const env={DB:{prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};}};}},BUCKET:{async put(){},get:async()=>null,async delete(){}}};
 const NativeFormData=saved.FormData;
 class DOMFormData extends NativeFormData{constructor(form){super();if(form)for(const node of form.querySelectorAll('[name]')){if(node.disabled)continue;const name=node.name||node.getAttribute('name');if(node.localName==='select'){const opts=[...node.querySelectorAll('option')];let selected=opts.filter(o=>o.hasAttribute('selected'));if(!selected.length&&!node.hasAttribute('multiple'))selected=opts.slice(0,1);for(const o of selected)this.append(name,o.getAttribute('value')??o.textContent);}else this.set(name,node.value??'');}}}
 Object.assign(globalThis,{window,document:window.document,location:{hash:'#library',origin:'https://studio.test'},FormData:DOMFormData,setInterval:()=>0,setTimeout:(fn,ms)=>{const timer=nativeTimeout(fn,ms);timer.unref();return timer;}});
 const displayPreferences=new Map();window.localStorage={getItem:key=>displayPreferences.get(key)||null,setItem:(key,value)=>displayPreferences.set(key,value)};
 window.scrollTo=()=>{};
 globalThis.fetch=async(path,options={})=>{const headers=new Headers(options.headers);headers.set('oai-authenticated-user-id','ui-tester');return handleApi(new Request(new URL(path,'https://studio.test'),{...options,headers}),env);};
 const wait=()=>new Promise(resolve=>nativeTimeout(resolve,45));
 const click=async(selector)=>{const el=document.querySelector(selector);assert.ok(el,'Missing UI: '+selector);el.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));await wait();};
 const submit=async(selector)=>{const el=document.querySelector(selector);assert.ok(el);el.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait();};
 const stored=()=>JSON.parse(sqlite.prepare('SELECT state FROM studio_state WHERE owner = ?').get('ui-tester').state);
 try{
  await import('../public/app.js?dom-test');await wait();
  assert.match(document.querySelector('h1').textContent,/Thư viện/);await click('[data-action="toggle-theme"]');assert.equal(document.documentElement.dataset.theme,'dark');assert.equal(displayPreferences.get('valley-theme'),'dark');
  await click('[data-page="knowledge"]');assert.equal(document.documentElement.dataset.theme,'dark');assert.equal(document.querySelector('[data-action="toggle-theme"]').getAttribute('aria-pressed'),'true');await click('[data-action="add-reference"]');
  document.querySelector('[name="title"]').value='Kỹ thuật quay từ ảnh';document.querySelector('[name="note"]').value='Học ánh sáng bên';
  const picture=new File(['test image'],'angle.jpg',{type:'image/jpeg'});Object.defineProperty(document.querySelector('[name="ref-files"]'),'files',{value:[picture],configurable:true});
  await click('[data-action="add-reference-shot"]');assert.equal(document.querySelector('[name="title"]').value,'Kỹ thuật quay từ ảnh');
  const firstId=document.querySelector('[data-reference-shot]').dataset.referenceShot;document.querySelector(`[name="${firstId}-note"]`).value='Góc thấp, máy đứng yên';document.querySelector(`[name="${firstId}-timecode"]`).value='00:12–00:18';Object.defineProperty(document.querySelector(`[name="${firstId}-file"]`),'files',{value:[picture],configurable:true});
  await click('[data-action="add-reference-shot"]');assert.equal(document.querySelectorAll('[data-reference-shot]').length,2);assert.equal(document.querySelector(`[name="${firstId}-note"]`).value,'Góc thấp, máy đứng yên');
  await click(`[data-action="move-reference-shot"][data-id="${firstId}"][data-direction="1"]`);assert.equal(document.querySelectorAll('[data-reference-shot]')[1].dataset.referenceShot,firstId);
  const secondId=document.querySelector('[data-reference-shot]').dataset.referenceShot;await click(`[data-action="remove-reference-shot"][data-id="${secondId}"]`);await submit('#reference-form');
  assert.equal(stored().references.length,1);assert.equal(stored().references[0].shots[0].note,'Góc thấp, máy đứng yên');assert.ok(stored().references[0].shots[0].imageId);assert.equal(stored().references[0].imageIds.length,1);assert.equal(stored().assets.length,2);assert.equal(document.querySelector('.modal'),null);
  await click('[data-action="reference-detail"]');assert.equal(document.querySelectorAll('[data-reference-shot]').length,1);await click('[data-action="close-modal"]');
  await click('[data-page="team"]');assert.equal(document.querySelectorAll('.agent-full').length,6);
  await click('[data-action="agent-detail"][data-id="writer"]');assert.match(document.querySelector('.modal').textContent,/Biên kịch/);
  await click('[data-action="close-modal"]');
  await click('[data-page="studio"]');
  await click('[data-tab="script"]');assert.equal(document.querySelectorAll('.shot-item').length,4);
  await click('[data-scene="SC04"]');assert.match(document.querySelector('.scene-heading').textContent,/Một mái hiên/);
  await click('[data-tab="storyboard"]');assert.equal(document.querySelectorAll('.board-image').length,24);await click('[data-action="storyboard-prompts"]');assert.equal(document.querySelectorAll('[data-action="copy-storyboard-prompt"]').length,6);await click('[data-action="import-storyboard"]');assert.equal(document.querySelector('[name="panel-0"]').value,'S01');assert.equal(document.querySelector('[name="panel-3"]').value,'S04');await click('[data-action="close-modal"]');
  await click('[data-board-scene="SC02"]');assert.equal(document.querySelectorAll('.board-image').length,4);
  await click('[data-tab="studio"]');
  const note=document.querySelector('#note-text');note.value='Ưu tiên âm thanh thực tế.';note.dispatchEvent(new window.Event('input',{bubbles:true}));await submit('#note-form');
  assert.equal(stored().episodes[0].notes[0].text,'Ưu tiên âm thanh thực tế.');
  await click('[data-action="run-sample"]');assert.match(document.querySelector('.review-box').textContent,/đã bàn giao/);
  await click('[data-action="review-current"]');assert.match(document.querySelector('.modal').textContent,/Nội dung mẫu/);
  await click('[data-action="approve-stage"]');assert.equal(stored().episodes[0].stage,1);assert.equal(stored().episodes[0].versions[0].snapshot.approved.length,1);
  await click('[data-action="stage-detail"][data-stage="0"]');await click('[data-action="revise-stage"]');document.querySelector('#revision-text').value='Thêm khảo sát hướng nắng.';await submit('#revision-form');assert.equal(stored().episodes[0].stage,0);assert.deepEqual(stored().episodes[0].approved,[]);assert.equal(stored().episodes[0].outputs[0],undefined);
  await click('[data-page="episodes"]');await click('[data-action="new-episode"]');document.querySelector('#ep-title').value='Mùa mận';document.querySelector('#ep-english').value='Plum Season';document.querySelector('#ep-brief').value='Hai chị em thu hoạch mận và làm mứt.';await submit('#brief-form');
  assert.equal(stored().episodes.length,2);assert.equal(stored().episodes[1].sample,false);assert.equal(stored().episodes[1].scenes.length,0);assert.match(document.querySelector('.episode-title').textContent,/Mùa mận/);
  await click('[data-action="run-codex"]');assert.equal(sqlite.prepare('SELECT status FROM codex_tasks ORDER BY created_at DESC LIMIT 1').get().status,'queued');assert.match(document.querySelector('.codex-task-box').textContent,/chờ Codex nhận/i);assert.match(document.querySelector('.agent-state').textContent,/Chờ Codex nhận/);assert.equal(document.querySelectorAll('.agent-label.running').length,0);
 }finally{for(const [key,value] of Object.entries(saved))globalThis[key]=value;sqlite.close();}
});

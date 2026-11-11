import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handleApi,sampleOutput} from '../worker/api.js';
import {seedState,SCENES} from '../public/data.js';
import {shotCsv,projectJson} from '../public/exports.js';
import {esc,storyboardSvg} from '../public/ui.js';

const sql=(await readFile(new URL('../drizzle/0000_studio.sql',import.meta.url),'utf8'))+'\n'+await readFile(new URL('../drizzle/0001_codex_tasks.sql',import.meta.url),'utf8');
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(sql);
 const DB={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){const out=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(out.changes)}};}};}};}};
 const store=new Map();const BUCKET={async put(key,stream,options={}){const array=await new Response(stream).arrayBuffer();store.set(key,{array,options});},async get(key){const v=store.get(key);return v?{body:v.array,httpMetadata:v.options.httpMetadata,customMetadata:v.options.customMetadata,arrayBuffer:async()=>v.array,text:async()=>new TextDecoder().decode(v.array)}:null;},async delete(key){store.delete(key);}};
 const env={DB,BUCKET};
 async function call(path,method='GET',data,owner='alice'){
  const headers={};if(owner)headers['oai-authenticated-user-id']=owner;if(data&&!(data instanceof FormData))headers['content-type']='application/json';
  const request=new Request('https://studio.test'+path,{method,headers,body:data?data instanceof FormData?data:JSON.stringify(data):undefined});
  const response=await handleApi(request,env);const text=await response.text();let body;try{body=JSON.parse(text);}catch{body=text;}return {status:response.status,body};
 }
 return {env,call,sqlite,store};
}
async function save(call,state,revision){const r=await call('/api/state','PUT',{state,revision});assert.equal(r.status,200,JSON.stringify(r.body));return r.body.revision;}

test('sample contains six scenes, unique shot IDs, and exactly eight minutes',()=>{const shots=SCENES.flatMap(s=>s.shots);assert.equal(SCENES.length,6);assert.equal(shots.length,24);assert.equal(new Set(shots.map(s=>s.id)).size,24);assert.equal(shots.reduce((n,s)=>n+s.seconds,0),480);});
test('private API rejects missing identity and does not expose state',async()=>{const {call}=fixture();assert.equal((await call('/api/state','GET',undefined,null)).status,401);const cfg=await call('/api/config','GET',undefined,null);assert.equal(cfg.body.signedIn,false);assert.equal(cfg.body.executionMode,'codex');assert.equal(cfg.body.externalModelCalls,false);});
test('state is isolated by user, persists across reads, and detects competing writes',async()=>{const {call}=fixture();const s=seedState();s.project.name='Alice project';const rev=await save(call,s,0);assert.equal(rev,1);assert.equal((await call('/api/state')).body.state.project.name,'Alice project');assert.notEqual((await call('/api/state','GET',undefined,'bob')).body.state.project.name,'Alice project');assert.equal((await call('/api/state','PUT',{state:s,revision:0})).status,409);await save(call,s,rev);assert.equal((await call('/api/state','PUT',{state:s,revision:rev})).status,409);});
test('legacy model route is rejected and cannot silently fall back to sample',async()=>{const {call}=fixture();await save(call,seedState(),0);const r=await call('/api/run','POST',{episodeId:'ep-01',mode:'ai'});assert.equal(r.status,400);assert.equal(Object.keys((await call('/api/state')).body.state.episodes[0].outputs).length,0);});
test('all five sample handoffs stop for review, preserve output, and complete only after approval',async()=>{const {call}=fixture();await save(call,seedState(),0);
 for(let stage=0;stage<5;stage++){
  const result=await call('/api/run','POST',{episodeId:'ep-01',mode:'sample'});assert.equal(result.status,200,JSON.stringify(result.body));
  const e=result.body.state.episodes[0];assert.equal(e.stage,stage);assert.equal(e.outputs[stage].mode,'sample');assert.equal(e.outputs[stage].agent,['ceo','creative','writer','camera','designer'][stage]);
  const again=await call('/api/run','POST',{episodeId:'ep-01',mode:'sample'});assert.equal(again.status,409);
  e.approved.push(stage);e.stage++;await save(call,result.body.state,result.body.revision);
 }
 const state=(await call('/api/state')).body.state;assert.equal(state.episodes[0].stage,5);assert.equal(state.episodes[0].approved.length,5);assert.equal((await call('/api/run','POST',{episodeId:'ep-01',mode:'sample'})).status,409);
});
test('handoff cannot run when preceding stage was not approved',async()=>{const {call}=fixture();const state=seedState();state.episodes[0].stage=2;await save(call,state,0);const r=await call('/api/run','POST',{episodeId:'ep-01',mode:'sample'});assert.equal(r.status,409);assert.match(r.body.error,/duyệt/);});
test('custom episodes cannot use sample content',async()=>{const {call}=fixture();const state=seedState();state.episodes[0].sample=false;await save(call,state,0);assert.equal((await call('/api/run','POST',{episodeId:'ep-01',mode:'sample'})).status,400);});
test('active run lock prevents duplicated work and expires safely',async()=>{const {call,sqlite}=fixture();await save(call,seedState(),0);sqlite.prepare('INSERT INTO run_locks VALUES (?,?,?,?)').run('alice','ep-01','another',Date.now()+10000);assert.equal((await call('/api/run','POST',{episodeId:'ep-01',mode:'sample'})).status,409);sqlite.prepare('UPDATE run_locks SET expires_at = 0').run();assert.equal((await call('/api/run','POST',{episodeId:'ep-01',mode:'sample'})).status,200);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM run_locks').get().n,0);});
test('upload, read and delete use the authenticated user namespace',async()=>{const {call}=fixture();const form=new FormData();form.set('file',new File(['a useful note'],'guide.md',{type:'text/markdown'}));const result=await call('/api/files','POST',form);assert.equal(result.status,201);assert.match(result.body.key,/^users\/alice\//);assert.equal((await call(result.body.url)).status,200);assert.equal((await call(result.body.url,'GET',undefined,'bob')).status,404);assert.equal((await call(result.body.url,'DELETE')).status,200);assert.equal((await call(result.body.url)).status,404);});
test('unsupported file types are rejected before storing',async()=>{const {call,store}=fixture();const form=new FormData();form.set('file',new File(['<svg/>'],'untrusted.svg',{type:'image/svg+xml'}));assert.equal((await call('/api/files','POST',form)).status,415);assert.equal(store.size,0);});
test('state cannot reference another account file key',async()=>{const {call}=fixture();const state=seedState(),id=crypto.randomUUID();state.assets.push({id,key:'users/bob/'+id,name:'private.jpg',mime:'image/jpeg',size:12,url:'/api/files/'+id,category:'context',description:'',tags:'',episodeId:null});assert.equal((await call('/api/state','PUT',{state,revision:0})).status,400);});
test('invalid shots and malformed references fail without changing saved state',async()=>{const {call}=fixture();const s=seedState();s.episodes[0].scenes[0].shots[0].seconds=-1;assert.equal((await call('/api/state','PUT',{state:s,revision:0})).status,400);const next=seedState();next.references.push({id:'test',title:'bad',note:'bad',url:'javascript:alert(1)',kind:'reference',tags:''});assert.equal((await call('/api/state','PUT',{state:next,revision:0})).status,400);assert.equal((await call('/api/state')).body.revision,0);});
test('exports escape HTML, contain all shots, and guard spreadsheet formula cells',()=>{assert.equal(esc('<script>"&'), '&lt;script&gt;&quot;&amp;');const state=seedState(),e=state.episodes[0];e.scenes[0].shots[0].action='=IMPORTXML("evil")';const csv=shotCsv(e);assert.ok(csv.includes('"\'=IMPORTXML'));assert.equal(csv.split('\r\n').length,25);assert.equal(JSON.parse(projectJson(state)).format,'valley-studio-backup');const svg=storyboardSvg(e.scenes[0],e.scenes[0].shots[0]);assert.match(svg,/Sơ đồ bố cục minh họa/);assert.ok(!svg.includes('IMPORTXML'));});

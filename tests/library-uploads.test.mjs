import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {readState,saveState,handleApi} from '../worker/api.js';
import {prepareLibraryUpload,prepareLegacyLibraryUpload,receiveLibraryUpload,LIBRARY_UPLOAD_PROTOCOL} from '../worker/library-uploads.js';
import {handleMcp} from '../worker/mcp.js';
import {seedState} from '../public/data.js';

const ORIGIN='https://studio.test',OWNER='github:123';
const migrations=await Promise.all(['0000_studio','0001_codex_tasks','0002_production_review','0003_library_uploads','0004_reference_profiles'].map(n=>readFile(new URL('../drizzle/'+n+'.sql',import.meta.url),'utf8')));
const sha=async data=>Buffer.from(await crypto.subtle.digest('SHA-256',data)).toString('hex');
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(migrations.join('\n'));
 const DB={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const store=new Map(),BUCKET={async put(k,v,o){store.set(k,{data:await new Response(v).arrayBuffer(),options:o});},async get(k){const v=store.get(k);return v?{body:v.data,size:v.data.byteLength,httpMetadata:v.options.httpMetadata,customMetadata:v.options.customMetadata,arrayBuffer:async()=>v.data.slice(0)}:null;},async delete(k){store.delete(k);}};
 const env={DB,BUCKET,PUBLIC_ORIGIN:ORIGIN,FILE_MAX_BYTES:20*1024*1024,MCP_OAUTH:true,MCP_IDENTITY:{id:OWNER,login:'alice'}};
 const initial=seedState();initial.episodes[0].stage=5;initial.episodes[0].approved=[0,1,2,3,4];initial.episodes[0].targetMinutes=30;initial.episodes[0].outputs[4]={title:'Approved book',content:'Keep this result'};
 await saveState(env,OWNER,initial,0);
 const allowed=user=>user.id===OWNER&&user.login==='alice';
 const transfer=(ticket,data,options={},isAllowed=allowed)=>receiveLibraryUpload(new Request(ticket.uploadUrl,{method:'PUT',headers:{authorization:'Bearer '+ticket.uploadToken,'content-type':ticket.asset.mime,...options},body:data}),env,isAllowed);
 const meta=async(data,more={})=>({filename:'crew.zip',mime:'application/zip',size:data.byteLength,sha256:await sha(data),episode_id:'ep-01',category:'knowledge',description:'Crew package',tags:'production',...more});
 const tool=async(name,args={})=>(await(await handleMcp(new Request(ORIGIN+'/mcp',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':OWNER},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),env)).json()).result;
 return {sqlite,env,store,transfer,meta,allowed,tool};
}

test('owner imports a file larger than the task limit, verifies bytes, and preserves approved production',async()=>{
 const f=await fixture(),before=await readState(f.env,OWNER),data=new Uint8Array(3*1024*1024+11).fill(71),metadata=await f.meta(data);
 const ticket=await prepareLibraryUpload(f.env,OWNER,metadata);
 assert.equal((await readState(f.env,OWNER)).revision,before.revision);
 assert.notEqual(f.sqlite.prepare('SELECT token_hash FROM library_uploads').get().token_hash,ticket.uploadToken);
 const uploaded=await f.transfer(ticket,data);assert.equal(uploaded.status,201,await uploaded.clone().text());const receipt=await uploaded.json();
 const after=await readState(f.env,OWNER);assert.deepEqual(after.state.episodes,before.state.episodes);assert.equal(after.state.assets.length,before.state.assets.length+1);assert.equal(after.revision,before.revision+1);
 assert.equal(receipt.asset.sha256,await sha(data));assert.ok(after.state.assets.some(a=>a.id===receipt.asset.id));
 const read=await receiveLibraryUpload(new Request(ticket.uploadUrl,{headers:{authorization:'Bearer '+ticket.uploadToken}}),f.env,f.allowed);assert.equal(read.status,200);assert.equal(await sha(await read.arrayBuffer()),await sha(data));
 assert.equal((await receiveLibraryUpload(new Request(ticket.uploadUrl,{headers:{'oai-authenticated-user-id':OWNER}}),f.env,f.allowed)).status,401);
 const duplicate=await prepareLibraryUpload(f.env,OWNER,metadata);assert.equal(duplicate.uploadRequired,false);assert.equal(duplicate.asset.id,receipt.asset.id);assert.equal((await readState(f.env,OWNER)).revision,after.revision);
 const replay=await f.transfer(ticket,new Uint8Array([1]));assert.equal(replay.status,200);assert.equal((await replay.json()).alreadyUploaded,true);assert.equal(await sha(f.store.get(receipt.asset.key).data),await sha(data));
 const statePut=await handleApi(new Request(ORIGIN+'/api/state',{method:'PUT',headers:{'oai-authenticated-user-id':OWNER,'content-type':'application/json'},body:JSON.stringify(after)}),f.env);assert.equal(statePut.status,200,'ZIP metadata must remain valid when the UI saves state');
});

test('tickets reject wrong token, expiry, revoked identity and foreign origins before publishing data',async()=>{
 const f=await fixture(),data=new Uint8Array([1,2,3]),ticket=await prepareLibraryUpload(f.env,OWNER,await f.meta(data));
 assert.equal((await f.transfer({...ticket,uploadToken:'f'.repeat(64)},data)).status,401);
 assert.equal((await f.transfer(ticket,data,{},()=>false)).status,403);
 assert.equal((await f.transfer(ticket,data,{origin:'https://foreign.test'})).status,403);
 f.sqlite.prepare('UPDATE library_uploads SET expires_at=0').run();assert.equal((await f.transfer(ticket,data)).status,401);
 assert.equal(f.store.size,0);assert.equal((await readState(f.env,OWNER)).state.assets.length,0);
});

test('size, MIME and checksum failures cannot add a resource, and a correct retry succeeds',async()=>{
 const f=await fixture(),data=new Uint8Array([10,20,30]),ticket=await prepareLibraryUpload(f.env,OWNER,await f.meta(data));
 assert.equal((await f.transfer(ticket,data,{'content-type':'text/plain'})).status,415);
 assert.equal((await f.transfer(ticket,data,{'content-length':'999'})).status,400);
 assert.equal((await f.transfer(ticket,new Uint8Array([10,20]))).status,400);
 assert.equal((await f.transfer(ticket,new Uint8Array([10,20,30,40]))).status,413);
 assert.equal((await f.transfer(ticket,new Uint8Array([10,20,31]))).status,400);
 assert.equal(f.store.size,0);assert.equal((await readState(f.env,OWNER)).state.assets.length,0);
 assert.equal((await f.transfer(ticket,data)).status,201);
});

test('library registration retries a competing state edit without dropping owner changes',async()=>{
 const f=await fixture(),data=new Uint8Array([12,34]),ticket=await prepareLibraryUpload(f.env,OWNER,await f.meta(data));let raced=false;
 const batch=f.env.DB.batch.bind(f.env.DB);f.env.DB.batch=async statements=>{if(!raced){raced=true;const current=await readState(f.env,OWNER);current.state.project.bible+=' User edit during transfer';await saveState(f.env,OWNER,current.state,current.revision);}return batch(statements);};
 const response=await f.transfer(ticket,data);assert.equal(response.status,201,await response.clone().text());const state=await readState(f.env,OWNER);
 assert.match(state.state.project.bible,/User edit during transfer/);assert.equal(state.state.assets.length,1);assert.equal(state.revision,3);
});

test('large project registration preserves production and rejects metadata overflow without leaving a file',async()=>{
 const f=await fixture(),initial=await readState(f.env,OWNER);initial.state.project.bible+='x'.repeat(1400000);await saveState(f.env,OWNER,initial.state,initial.revision);
 const data=new Uint8Array([5,6,7]),ticket=await prepareLibraryUpload(f.env,OWNER,await f.meta(data));assert.equal((await f.transfer(ticket,data)).status,201);
 const current=await readState(f.env,OWNER);assert.deepEqual(current.state.episodes,initial.state.episodes);assert.equal(current.state.project.bible,initial.state.project.bible);assert.equal(current.state.assets.length,1);
 current.state.project.bible+='x'.repeat(2*1024*1024-Buffer.byteLength(JSON.stringify(current.state))-32);await saveState(f.env,OWNER,current.state,current.revision);
 const next=await prepareLibraryUpload(f.env,OWNER,await f.meta(data,{filename:'overflow.zip'}));assert.equal((await f.transfer(next,data)).status,413);
 assert.equal(f.store.size,1);assert.equal((await readState(f.env,OWNER)).state.assets.length,1);assert.equal(f.sqlite.prepare('SELECT status FROM library_uploads WHERE id=?').get(next.asset.id).status,'pending');
});

test('the first file initializes a missing project atomically before registration',async()=>{
 const f=await fixture();f.sqlite.prepare('DELETE FROM studio_state WHERE owner=?').run(OWNER);const data=new Uint8Array([2,3]),ticket=await prepareLibraryUpload(f.env,OWNER,await f.meta(data));
 assert.equal((await f.transfer(ticket,data)).status,201);const state=await readState(f.env,OWNER);assert.equal(state.revision,1);assert.equal(state.state.assets.length,1);assert.equal(state.state.assets[0].id,ticket.asset.id);
});

test('a failed D1 transaction rolls back the resource and its object before retry',async()=>{
 const f=await fixture(),data=new Uint8Array([7,8]),ticket=await prepareLibraryUpload(f.env,OWNER,await f.meta(data)),batch=f.env.DB.batch;
 f.env.DB.batch=async()=>{throw new Error('storage failure');};assert.equal((await f.transfer(ticket,data)).status,500);assert.equal(f.store.size,0);assert.equal((await readState(f.env,OWNER)).state.assets.length,0);
 f.env.DB.batch=batch;assert.equal((await f.transfer(ticket,data)).status,201);
});

test('scoped requests cannot outlive allowlist revocation or resurrect a removed resource',async()=>{
 const f=await fixture(),data=new Uint8Array([3,4,5]),ticket=await prepareLibraryUpload(f.env,OWNER,await f.meta(data));assert.equal((await f.transfer(ticket,data)).status,201);
 const request=()=>new Request(ticket.uploadUrl,{headers:{authorization:'Bearer '+ticket.uploadToken}});
 assert.equal((await receiveLibraryUpload(request(),f.env,()=>false)).status,403);
 const current=await readState(f.env,OWNER);current.state.assets=[];await saveState(f.env,OWNER,current.state,current.revision);
 assert.equal((await receiveLibraryUpload(request(),f.env,f.allowed)).status,404);assert.equal((await f.transfer(ticket,data)).status,409);
});

test('MCP supports an explicit legacy library namespace without treating it as a task claim',async()=>{
 const f=await fixture(),data=new Uint8Array([8,9]),meta=await f.meta(data),{filename,episode_id,...fields}=meta;
 const args={task_id:'library:ep-01',claim_token:'',filename,mime:'application/json',encoding:'utf8',content:JSON.stringify({protocol:LIBRARY_UPLOAD_PROTOCOL,...fields})};
 const response=await f.tool('studio_save_artifact',args);assert.equal(response.isError,undefined);const ticket=JSON.parse(response.content[0].text);assert.equal(ticket.uploadRequired,true);
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM codex_tasks').get().n,0);assert.equal((await readState(f.env,OWNER)).revision,1);
 assert.equal((await f.tool('studio_save_artifact',{...args,claim_token:'an-old-claim'})).isError,true);
 assert.equal((await f.tool('studio_save_artifact',{...args,task_id:crypto.randomUUID(),claim_token:'not-a-claim'})).isError,true);
 assert.equal((await f.tool('studio_save_artifact',{...args,content:JSON.stringify({protocol:'wrong'})})).isError,true);
 assert.equal((await f.transfer(ticket,data)).status,201);
});

test('prepare rejects unscoped callers, invalid file metadata, unknown episodes and too-large files',async()=>{
 const f=await fixture(),data=new Uint8Array([1]),metadata=await f.meta(data);
 await assert.rejects(prepareLibraryUpload({...f.env,MCP_IDENTITY:undefined},OWNER,metadata),e=>e.status===403);
 for(const patch of [{filename:'../x.zip'},{sha256:'not-sha'},{episode_id:'unknown'},{mime:'image/svg+xml'},{size:20*1024*1024+1},{category:'unknown'},{tags:42}])await assert.rejects(prepareLibraryUpload(f.env,OWNER,{...metadata,...patch}));
 await assert.rejects(prepareLegacyLibraryUpload(f.env,OWNER,{task_id:'library:project',claim_token:'',mime:'application/json',encoding:'utf8',filename:'x.zip',content:JSON.stringify({protocol:LIBRARY_UPLOAD_PROTOCOL,...metadata,episode_id:'ep-01'})}));
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM library_uploads').get().n,0);
});

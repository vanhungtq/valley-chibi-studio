import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {seedState} from '../public/data.js';
import {readState,saveState,handleApi} from '../worker/api.js';
import {handleMcp} from '../worker/mcp.js';
import {publishEpisodeDossier,parseDossierCsv,DOSSIER_PROTOCOL} from '../worker/episode-dossiers.js';
import {dossierCards,dossierDetail,dossierRoute,findDossier} from '../public/episode-dossiers.js';
import {resumeEpisodeDossier,EPISODE_WORK_PROTOCOL} from '../worker/episode-work.js';
import {queueTask,getTask,claimTask,reconcileReviews} from '../worker/bridge.js';
import {chooseResources} from '../worker/api.js';
import {shotPhotoEditor,actualPhotoStrip,reopenForPhotos} from '../public/shot-photos.js';

const dossierOwner='github:123';
const dossierSql=await Promise.all(['0000_studio','0001_codex_tasks','0002_production_review','0003_library_uploads'].map(n=>readFile(new URL('../drizzle/'+n+'.sql',import.meta.url),'utf8')));
const dossierCsv='\uFEFFshotId,sceneId,sceneTitle,page,panel,start,end,seconds,timecode,lensMm,size,angle,move,action,continuity,sound,lighting,aperture,recording,techniqueRefs\r\nS01,SC01,Opening,1,1,0,30,30,00:00–00:30,18,WS,Low,Static,"First, action\nwith ""quotes""",Keep axis,Birds,Soft,F4,4K25p,V03\r\nS02,SC01,Opening,1,2,30,60,30,00:30–01:00,50,CU,Eye,Static,Second action,Keep axis,Footsteps,Soft,F4,4K25p,V04\r\n';
async function dossierFixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(dossierSql.join('\n'));
 const DB={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};}};}};
 const store=new Map(),BUCKET={async get(key){const value=store.get(key);return value===undefined?null:{text:async()=>value};}};
 const env={DB,BUCKET,MCP_OAUTH:true,MCP_IDENTITY:{id:dossierOwner,login:'alice'}},state=seedState();
 DB.batch=async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const statement of statements)r.push(await statement.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}};
 Object.assign(state.episodes[0],{targetMinutes:1,stage:5,approved:[0,1,2,3,4],outputs:{4:{title:'Approved original',content:'Keep all workflow results'}}});
 const files={};for(const [role,mime] of [['pdf','application/pdf'],['archive','application/zip'],['shotlist','text/csv'],['knowledge','text/markdown'],['board','image/webp'],['bible','image/webp']]){
  const id=crypto.randomUUID(),asset={id,key:'users/'+encodeURIComponent(dossierOwner)+'/'+id,url:'/api/files/'+id,name:role,mime,size:100,category:role==='board'||role==='bible'?'storyboard':'knowledge',description:'',tags:'',episodeId:'ep-01'};
  state.assets.push(asset);files[role]=id;store.set(asset.key,role==='shotlist'?dossierCsv:'bytes');
 }
 await saveState(env,dossierOwner,state,0);
 const args={episode_id:'ep-01',dossier_id:'v2-0',title:'Tập 1 v2.0',version:'2.0',summary:'A revised crew dossier',expected_revision:1,file_ids:Object.fromEntries(['pdf','archive','shotlist','knowledge'].map(k=>[k,files[k]])),gallery:[{asset_id:files.board,shot_ids:['S01','S02']}],visual_bible_id:files.bible};
 const tool=async(name,arguments_)=>{const r=await handleMcp(new Request('https://studio.test/mcp',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':dossierOwner},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:arguments_}})}),env);return (await r.json()).result;};
 return {sqlite,env,state,files,store,args,tool};
}
test('owner groups real CSV and files as an idempotent episode edition while preserving approved production',async()=>{
 const f=await dossierFixture(),before=await readState(f.env,dossierOwner),result=await publishEpisodeDossier(f.env,dossierOwner,f.args);
 assert.equal(result.dossier.title,'Tập 1 v2.0');assert.equal(result.dossier.shots.length,2);assert.equal(result.dossier.shots[0].action,'First, action\nwith "quotes"');assert.equal(result.revision,2);
 const after=await readState(f.env,dossierOwner),episode=structuredClone(after.state.episodes[0]);delete episode.dossiers;assert.deepEqual(episode,before.state.episodes[0]);assert.deepEqual(after.state.assets,before.state.assets);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM codex_tasks').get().n,0);
 assert.equal((await publishEpisodeDossier(f.env,dossierOwner,f.args)).alreadyPublished,true);assert.equal((await readState(f.env,dossierOwner)).revision,2);
 await assert.rejects(publishEpisodeDossier(f.env,dossierOwner,{...f.args,title:'Different content'}),e=>e.status===409);
 await assert.rejects(publishEpisodeDossier(f.env,dossierOwner,{...f.args,dossier_id:'v2-1'}),e=>e.status===409);
 const saved=await handleApi(new Request('https://studio.test/api/state',{method:'PUT',headers:{'content-type':'application/json','oai-authenticated-user-id':dossierOwner},body:JSON.stringify(after)}),f.env);assert.equal(saved.status,200,'normal browser saves retain dossier snapshots');
 after.revision=3;after.state.assets=after.state.assets.filter(a=>a.id!==f.files.pdf);const invalid=await handleApi(new Request('https://studio.test/api/state',{method:'PUT',headers:{'content-type':'application/json','oai-authenticated-user-id':dossierOwner},body:JSON.stringify(after)}),f.env);assert.equal(invalid.status,400,'cannot leave a dossier pointing to a deleted file');
});
test('publication rejects wrong identities, missing files, bad timeline, incomplete panels and untrusted legacy claims',async()=>{
 const f=await dossierFixture();
 await assert.rejects(publishEpisodeDossier({...f.env,MCP_IDENTITY:{id:'github:999'}},dossierOwner,f.args),e=>e.status===403);
 for(const patch of [{file_ids:{...f.args.file_ids,pdf:crypto.randomUUID()}},{file_ids:{...f.args.file_ids,pdf:f.files.knowledge}},{gallery:[{asset_id:f.files.board,shot_ids:['S02','S01']}]},{gallery:[{asset_id:f.files.board,shot_ids:['S01']}]}])await assert.rejects(publishEpisodeDossier(f.env,dossierOwner,{...f.args,...patch}),e=>e.status===400);
 const csvAsset=f.state.assets.find(a=>a.id===f.files.shotlist);f.store.set(csvAsset.key,dossierCsv.replace('30,60,30','30,90,60'));await assert.rejects(publishEpisodeDossier(f.env,dossierOwner,f.args),e=>e.status===400);f.store.set(csvAsset.key,dossierCsv);
 const content=JSON.stringify({protocol:DOSSIER_PROTOCOL,...Object.fromEntries(Object.entries(f.args).filter(([k])=>k!=='episode_id'))});
 const args={task_id:'episode:ep-01',claim_token:'',filename:'episode-dossier.json',mime:'application/json',encoding:'utf8',content};
 assert.equal((await f.tool('studio_save_artifact',{...args,claim_token:'old-task-token'})).isError,true);
 assert.equal((await f.tool('studio_save_artifact',{...args,task_id:crypto.randomUUID(),claim_token:'not-a-claim'})).isError,true);
 assert.equal((await readState(f.env,dossierOwner)).revision,1);
 const accepted=await f.tool('studio_save_artifact',args);assert.equal(accepted.isError,undefined);assert.equal(JSON.parse(accepted.content[0].text).dossier.id,'v2-0');
});
test('CSV parser handles BOM and multiline quotes, and rejects malformed or ambiguous rows',()=>{
 assert.equal(parseDossierCsv(dossierCsv)[0].shotId,'S01');
 for(const text of ['shotId,shotId\nS01,S02',dossierCsv+'"unclosed',dossierCsv.replace('First, action','First, action"x')])assert.throws(()=>parseDossierCsv(text));
});
test('owner can explicitly refresh gallery labels from real CSV IDs including inserted letter suffixes',async()=>{
 const f=await dossierFixture(),csv=f.state.assets.find(a=>a.id===f.files.shotlist);f.store.set(csv.key,dossierCsv.replace('S02,SC01','S01A,SC01'));
 f.args.gallery[0].shot_ids=['S01','S01A'];f.args.refresh_gallery_labels=true;
 await publishEpisodeDossier(f.env,dossierOwner,f.args);const after=await readState(f.env,dossierOwner),board=after.state.assets.find(a=>a.id===f.files.board);
 assert.match(board.description,/S01 · S01A/);assert.equal(after.state.assets.find(a=>a.id===f.files.pdf).description,'');assert.deepEqual(after.state.episodes[0].approved,[0,1,2,3,4]);
});
test('episode dossier views show real file links, complete shot panels, scene filtering and escaped imported text',async()=>{
 const f=await dossierFixture();await publishEpisodeDossier(f.env,dossierOwner,f.args);const {state}=await readState(f.env,dossierOwner),selection=dossierRoute('#episodes/ep-01/v2-0');
 assert.deepEqual(selection,{episodeId:'ep-01',dossierId:'v2-0'});assert.equal(dossierRoute('#episodes/../../x'),null);assert.ok(findDossier(state,selection));
 assert.match(dossierCards(state),/Tập 1 v2.0/);assert.match(dossierCards(state),new RegExp('/api/files/'+f.files.pdf));
 const board=dossierDetail(state,selection,'storyboard');assert.match(board,/S01 · S02/);assert.match(board,/ẢNH MINH HỌA AI/);
 const document=dossierDetail(state,selection,'documents');assert.match(document,/<iframe/);assert.match(document,/download=/);assert.match(document,/#view=FitH/);
 state.episodes[0].dossiers[0].shots[0].action='<script>alert(1)</script>';const shots=dossierDetail(state,selection,'shots');assert.ok(!shots.includes('<script>'));assert.match(shots,/&lt;script&gt;/);
 assert.match(dossierDetail(state,{episodeId:'missing',dossierId:'none'}),/Chưa tìm thấy/);
});

test('resume archives production, reuses exact dossier shot IDs and panels, and repeat opens preserve edits',async()=>{
 const f=await dossierFixture();await publishEpisodeDossier(f.env,dossierOwner,f.args);
 const before=await readState(f.env,dossierOwner),result=await resumeEpisodeDossier(f.env,dossierOwner,{episode_id:'ep-01',dossier_id:'v2-0',expected_revision:2});assert.equal(result.revision,3);
 const after=await readState(f.env,dossierOwner),e=after.state.episodes[0];assert.equal(e.stage,0);assert.deepEqual(e.outputs,{});assert.equal(e.title,'Tập 1 v2.0 · Đang nâng cấp');assert.deepEqual(e.scenes.flatMap(s=>s.shots.map(s=>s.id)),['S01','S02']);assert.equal(e.storyboards.S02.panel,1);assert.equal(e.storyboards.S01.generated,true);assert.deepEqual(e.dossiers,before.state.episodes[0].dossiers);assert.deepEqual(e.versions.at(-1).snapshot.outputs,before.state.episodes[0].outputs);
 e.scenes[0].shots[0].action='Owner edit';await saveState(f.env,dossierOwner,after.state,after.revision);
 const again=await resumeEpisodeDossier(f.env,dossierOwner,{episode_id:'ep-01',dossier_id:'v2-0',expected_revision:2});assert.equal(again.alreadyResumed,true);assert.equal((await readState(f.env,dossierOwner)).state.episodes[0].scenes[0].shots[0].action,'Owner edit');assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM codex_tasks').get().n,0);
});
test('resume rejects a running lease and stale revision, and cached MCP can resume after explicit handoff',async()=>{
 const f=await dossierFixture();await publishEpisodeDossier(f.env,dossierOwner,f.args);const loaded=await readState(f.env,dossierOwner);loaded.state.episodes[0].stage=0;loaded.state.episodes[0].outputs={};loaded.state.episodes[0].approved=[];await saveState(f.env,dossierOwner,loaded.state,loaded.revision);
 const task=await queueTask(f.env,dossierOwner,'ep-01');await claimTask(f.env,dossierOwner,task.id);
 await assert.rejects(resumeEpisodeDossier(f.env,dossierOwner,{episode_id:'ep-01',dossier_id:'v2-0',expected_revision:3}),e=>e.status===409);assert.equal((await readState(f.env,dossierOwner)).state.episodes[0].workingSource,undefined);
 f.sqlite.prepare('UPDATE codex_tasks SET lease_until=0').run();
 await assert.rejects(resumeEpisodeDossier(f.env,dossierOwner,{episode_id:'ep-01',dossier_id:'v2-0',expected_revision:1}),e=>e.status===409);
 const accepted=await f.tool('studio_save_artifact',{task_id:'episode:ep-01',claim_token:'',filename:'resume.json',mime:'application/json',encoding:'utf8',content:JSON.stringify({protocol:EPISODE_WORK_PROTOCOL,dossier_id:'v2-0',expected_revision:3})});assert.equal(accepted.isError,undefined,accepted.content[0].text);assert.equal(f.sqlite.prepare('SELECT status FROM codex_tasks WHERE id=?').get(task.id).status,'stale');
});
test('archived approved tasks retain their approval history after resuming and subsequent photo saves',async()=>{
 const f=await dossierFixture(),id=crypto.randomUUID(),now=new Date().toISOString();
 f.sqlite.prepare("INSERT INTO codex_tasks (id,owner,episode_id,stage,agent,status,input_digest,input_snapshot,created_at,updated_at) VALUES (?,?,?,4,'designer','approved','old','{}',?,?)").run(id,dossierOwner,'ep-01',now,now);
 const initial=await readState(f.env,dossierOwner);initial.state.episodes[0].outputs[4].taskId=id;await saveState(f.env,dossierOwner,initial.state,initial.revision);
 await publishEpisodeDossier(f.env,dossierOwner,{...f.args,expected_revision:2});await resumeEpisodeDossier(f.env,dossierOwner,{episode_id:'ep-01',dossier_id:'v2-0',expected_revision:3});
 const current=await readState(f.env,dossierOwner);await reconcileReviews(f.env,dossierOwner,current.state);assert.equal(f.sqlite.prepare('SELECT status FROM codex_tasks WHERE id=?').get(id).status,'approved');assert.equal(current.state.episodes[0].versions.at(-1).snapshot.outputs[4].taskId,id);
});
test('actual photos are validated by scope/shot and always enter agent packets with notes; changes invalidate old task claims',async()=>{
 const f=await dossierFixture();await publishEpisodeDossier(f.env,dossierOwner,f.args);await resumeEpisodeDossier(f.env,dossierOwner,{episode_id:'ep-01',dossier_id:'v2-0',expected_revision:2});
 const loaded=await readState(f.env,dossierOwner),e=loaded.state.episodes[0];e.actualPhotos={S01:[{assetId:f.files.bible,note:'Door opens left <script>'}]};await saveState(f.env,dossierOwner,loaded.state,loaded.revision);
 const task=await queueTask(f.env,dossierOwner,e.id),packet=await getTask(f.env,dossierOwner,task.id);assert.equal(packet.context.episode.actualPhotos.S01[0].note,'Door opens left <script>');assert.ok(packet.context.resources.assets.some(a=>a.id===f.files.bible));assert.ok(packet.context.resources.assets.some(a=>a.id===f.files.knowledge));assert.match(packet.instructions,/đối chiếu với storyboard AI/);
 assert.match(shotPhotoEditor(loaded.state,e,'S01'),/Door opens left &lt;script&gt;/);assert.match(actualPhotoStrip(loaded.state,e,'S01'),/1 ảnh thực tế/);
 e.actualPhotos.S01[0].note='New user note';await saveState(f.env,dossierOwner,loaded.state,4);await assert.rejects(claimTask(f.env,dossierOwner,task.id),error=>error.status===409);
 const current=await readState(f.env,dossierOwner),request=state=>new Request('https://studio.test/api/state',{method:'PUT',headers:{'content-type':'application/json','oai-authenticated-user-id':dossierOwner},body:JSON.stringify({state,revision:current.revision})});
 for(const invalid of [{NO_SHOT:[{assetId:f.files.bible,note:''}]},{S01:[{assetId:f.files.pdf,note:''}]},{S01:[{assetId:crypto.randomUUID(),note:''}]}]){const state=structuredClone(current.state);state.episodes[0].actualPhotos=invalid;assert.equal((await handleApi(request(state),f.env)).status,400);}
 const snapshot=current.state.episodes[0].dossiers[0];current.state.episodes[0].outputs={4:{title:'New result',taskId:'approved-v3'}};current.state.episodes[0].approved=[4];reopenForPhotos(current.state.episodes[0],'Changed photos');assert.equal(current.state.episodes[0].stage,0);assert.deepEqual(current.state.episodes[0].dossiers[0],snapshot);
});

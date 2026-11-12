import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {referenceFixture,importReferenceFixture,referenceOwner,referenceAnalysisFixture} from './reference-fixture.mjs';
import {readReferenceZip,readZipCsv,mapReferenceShots} from '../public/reference-zip.js';
import {readState,saveState} from '../worker/api.js';
import {referenceAnalysisAction,queueReferenceAnalysis,readReferenceProfile} from '../worker/reference-profiles.js';
import {queueTask,getTask} from '../worker/bridge.js';
import {handleMcp} from '../worker/mcp.js';

test('ZIP reader maps folder-relative CSV paths and Vietnamese headers, preserves order and surfaces ambiguous images',async()=>{
 const csv='\uFEFFMã shot;Phân cảnh;timecode;image_path;Ghi chú;scene_type\r\nS01;SC01;00:01–00:04;shots/S01.jpg;"Hands, leaves";Hái rau\r\nS02;SC02;00:05–00:08;shots/S02.jpg;Tools;Cuốc đất';
 const bytes=zipSync({'video/shots.csv':strToU8(csv),'video/shots/S01.jpg':strToU8('image1'),'video/shots/S02.jpg':strToU8('image2')});
 const bundle=await readReferenceZip(new File([bytes],'video.zip')),parsed=readZipCsv(bundle,bundle.csvFiles[0]),mapped=mapReferenceShots(bundle,bundle.csvFiles[0],parsed.columns);
 assert.equal(mapped.shots.length,2);assert.equal(mapped.warnings.length,0);assert.equal(mapped.shots[0].id,'S01');assert.equal(mapped.shots[0].imagePath,'video/shots/S01.jpg');assert.deepEqual(mapped.shots[1].sceneTypes,['Cuốc đất']);assert.equal(mapped.shots[0].note,'Hands, leaves');
 const bad=zipSync({'../shots.csv':strToU8(csv)});await assert.rejects(readReferenceZip(new File([bad],'bad.zip')),/đường dẫn/);
 const corrupt=zipSync({'x.csv':strToU8('id,image\n1,x.jpg'),'x.jpg':strToU8('image')},{level:0});corrupt[40]^=1;await assert.rejects(readReferenceZip(new File([corrupt],'corrupt.zip')));
 const ambiguous={...bundle,files:new Map([...bundle.files,['other/S01.jpg',strToU8('duplicate')]])};const noPaths={...parsed.columns,image:''};const uncertain=mapReferenceShots(ambiguous,bundle.csvFiles[0],noPaths);assert.ok(uncertain.warnings.some(w=>w.includes('trùng')));
});
test('profiles keep full shots in D1, deduplicate imports, protect ownership and bound image references',async()=>{
 const f=await referenceFixture(),{response,profile,assets}=await importReferenceFixture(f);assert.equal(response.status,201,await response.clone().text());
 const state=await readState(f.env,referenceOwner);assert.equal(state.state.references[0].shots.length,0);assert.equal(state.state.references[0].shotCount,2);assert.equal((await readReferenceProfile(f.env,referenceOwner,profile.id)).profile.shots.length,2);
 assert.equal((await f.api('/api/reference-profiles/'+profile.id,{},'github:999')).status,404);
 const repeat=await f.api('/api/reference-profiles',{method:'POST',body:JSON.stringify({profile,assets:[],expectedRevision:state.revision})});assert.equal((await repeat.json()).alreadyImported,true);assert.equal((await readState(f.env,referenceOwner)).revision,state.revision);
 assert.equal((await f.api(assets[0].url,{method:'DELETE'})).status,409);
 state.state.assets=state.state.assets.filter(a=>a.id!==assets[0].id);assert.equal((await f.api('/api/state',{method:'PUT',body:JSON.stringify(state)})).status,400);
});
test('leased analysis jobs validate shot evidence, persist reusable skills and feed only selected scenes to production',async()=>{
 const f=await referenceFixture(),{profile}=await importReferenceFixture(f),one=await queueReferenceAnalysis(f.env,referenceOwner,profile.id),two=await queueReferenceAnalysis(f.env,referenceOwner,profile.id);assert.equal(one.job.id,two.job.id);
 const claim=await referenceAnalysisAction(f.env,referenceOwner,{action:'claim',job_id:one.job.id});await assert.rejects(referenceAnalysisAction(f.env,referenceOwner,{action:'claim',job_id:one.job.id}),e=>e.status===409);
 const analysis=referenceAnalysisFixture(profile),args={action:'submit',job_id:one.job.id,claim_token:claim.claimToken,analysis};
 await assert.rejects(referenceAnalysisAction(f.env,referenceOwner,{...args,claim_token:'old-account-token'}),e=>e.status===409);
 await assert.rejects(referenceAnalysisAction(f.env,referenceOwner,{...args,analysis:{...analysis,observations:[analysis.observations[0],analysis.observations[0]]}}),e=>e.status===400);
 const accepted=await referenceAnalysisAction(f.env,referenceOwner,args);assert.equal(accepted.completed,true);assert.equal((await referenceAnalysisAction(f.env,referenceOwner,args)).alreadySubmitted,true);
 const loaded=await readState(f.env,referenceOwner);loaded.state.episodes[0].referenceSelection={videoTypes:['Nấu ăn'],sceneTypes:['Hái rau'],referenceIds:[]};await saveState(f.env,referenceOwner,loaded.state,loaded.revision);
 const queued=await queueTask(f.env,referenceOwner,'ep-01'),packet=await getTask(f.env,referenceOwner,queued.id),reference=packet.context.resources.references[0];assert.equal(reference.shots.length,1);assert.equal(reference.shots[0].id,'S01');assert.equal(reference.analysis.skills.length,1);assert.equal(reference.analysis.skills[0].sourceShotIds[0],'S01');assert.equal(packet.context.resources.assets.some(a=>a.id===profile.shots[1].imageId),false);assert.match(packet.instructions,/Không mô tả kỹ năng là huấn luyện lại mô hình/);
});
test('profile edits invalidate analysis claims and cached MCP tools support the distinct reference job namespace',async()=>{
 const f=await referenceFixture(),{profile}=await importReferenceFixture(f),queued=await queueReferenceAnalysis(f.env,referenceOwner,profile.id);
 const call=async(name,args)=>{const response=await handleMcp(new Request('https://studio.test/mcp',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':referenceOwner},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),f.env);return (await response.json()).result;};
 const taskId='reference:'+queued.job.id,read=await call('studio_get_task',{task_id:taskId});assert.equal(read.isError,undefined);assert.equal(JSON.parse(read.content[0].text).task.type,'reference_analysis');
 const claim=JSON.parse((await call('studio_claim_task',{task_id:taskId})).content[0].text),analysis=referenceAnalysisFixture(profile);
 const submitted=await call('studio_submit_result',{task_id:taskId,claim_token:claim.claimToken,output:{title:analysis.title,summary:analysis.summary,content:'```valley-reference-analysis\n'+JSON.stringify(analysis)+'\n```',scenes:[],sources:[],missing:[]}});assert.equal(submitted.isError,undefined,submitted.content[0].text);
 const next=await queueReferenceAnalysis(f.env,referenceOwner,profile.id),lease=await referenceAnalysisAction(f.env,referenceOwner,{action:'claim',job_id:next.job.id});
 const current=await readReferenceProfile(f.env,referenceOwner,profile.id),state=await readState(f.env,referenceOwner),changed=await f.api('/api/reference-profiles/'+profile.id,{method:'PUT',body:JSON.stringify({expectedRevision:state.revision,profileRevision:current.revision,videoTypes:['Nông nghiệp']})});assert.equal(changed.status,200);
 await assert.rejects(referenceAnalysisAction(f.env,referenceOwner,{action:'progress',job_id:next.job.id,claim_token:lease.claimToken,message:'Finished reading'}),e=>e.status===409);
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM codex_tasks').get().n,0);
});
test('Codex classification suggestions populate only missing labels and become selectable with fresh source hashes',async()=>{
 const f=await referenceFixture(),{profile}=await importReferenceFixture(f),current=await readReferenceProfile(f.env,referenceOwner,profile.id),state=await readState(f.env,referenceOwner);
 const changed=await f.api('/api/reference-profiles/'+profile.id,{method:'PUT',body:JSON.stringify({expectedRevision:state.revision,profileRevision:current.revision,videoTypes:[],sceneTypesById:{SC01:[],SC02:[]}})});assert.equal(changed.status,200);
 const queued=await queueReferenceAnalysis(f.env,referenceOwner,profile.id),claim=await referenceAnalysisAction(f.env,referenceOwner,{action:'claim',job_id:queued.job.id}),analysis=referenceAnalysisFixture(profile);analysis.videoTypes=['Nấu ăn'];analysis.observations.forEach((o,i)=>o.sceneTypes=profile.shots[i].sceneTypes);
 const args={action:'submit',job_id:queued.job.id,claim_token:claim.claimToken,analysis};await referenceAnalysisAction(f.env,referenceOwner,args);assert.equal((await referenceAnalysisAction(f.env,referenceOwner,args)).alreadySubmitted,true);
 const saved=await readReferenceProfile(f.env,referenceOwner,profile.id);assert.deepEqual(saved.profile.videoTypes,['Nấu ăn']);assert.deepEqual(saved.profile.shots[0].sceneTypes,['Hái rau']);assert.equal(saved.sourceHash,saved.profile.analysis.sourceHash);assert.equal(saved.profile.classificationSource,'codex_suggested');
 const project=await readState(f.env,referenceOwner);assert.ok(project.state.references[0].sceneTypes.includes('Cuốc đất'));assert.equal(project.state.references[0].analysisStatus,'complete');
});
test('only the owner handoff endpoint releases an active analysis claim for another Codex session',async()=>{
 const f=await referenceFixture(),{profile}=await importReferenceFixture(f),queued=await queueReferenceAnalysis(f.env,referenceOwner,profile.id),first=await referenceAnalysisAction(f.env,referenceOwner,{action:'claim',job_id:queued.job.id});
 const foreign=await f.api('/api/reference-profiles/'+profile.id+'/handoff',{method:'POST',body:'{}'},'github:999');assert.equal(foreign.status,404);
 const handedOff=await f.api('/api/reference-profiles/'+profile.id+'/handoff',{method:'POST',body:'{}'});assert.equal(handedOff.status,200);
 await assert.rejects(referenceAnalysisAction(f.env,referenceOwner,{action:'progress',job_id:queued.job.id,claim_token:first.claimToken,message:'Old session update'}),e=>e.status===409);
 const second=await referenceAnalysisAction(f.env,referenceOwner,{action:'claim',job_id:queued.job.id});assert.notEqual(first.claimToken,second.claimToken);
 const removed=await f.api('/api/reference-profiles/'+profile.id,{method:'DELETE'});assert.equal(removed.status,200);assert.equal(f.sqlite.prepare('SELECT status FROM reference_jobs WHERE id=?').get(queued.job.id).status,'stale');const state=await readState(f.env,referenceOwner);assert.equal(state.state.references.length,0);assert.equal(state.state.assets.length,2);
});

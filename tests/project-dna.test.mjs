import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceFixture,importReferenceFixture,referenceOwner,referenceAnalysisFixture} from './reference-fixture.mjs';
import {configureProjectDna,readProjectDna,validateDnaPatterns} from '../worker/project-dna.js';
import {readState,saveState} from '../worker/api.js';
import {queueReferenceAnalysis,referenceAnalysisAction} from '../worker/reference-profiles.js';
import {queueTask,getTask,claimTask} from '../worker/bridge.js';
import {projectDnaView} from '../public/project-dna-ui.js';

const dnaConfig={title:'Nala Valley DNA',enabled:true,anchorLabel:'Vid2',anchorReferenceId:'',ownerBrief:'Owner designates Vid2 as the anchor; reuse layouts with own setting and characters.',sourceReferenceIds:[],mode:'match_reference_layout'};
function dnaFixture(){const base={key:'clear-action',title:'Clear action',description:'A clear foreground action.',application:'Keep the arrangement; use the project character and location.',roles:['ceo','creative','writer','camera','designer'],sceneTypes:['Hái rau'],sourceShotIds:['S01'],evidenceBasis:'still'};return {version:'1.0',principles:[base],setups:[{...base,key:'foreground-action-cu',frameLayout:'Hands occupy the lower third, background visible above.'}],recipes:[{...base,key:'establish-to-detail',sourceShotIds:['S01','S02'],steps:[{label:'Establish action',shotIds:['S01']},{label:'Show detail',shotIds:['S02']}]}]};}
test('an unread anchor creates an explicitly empty DNA library rather than invented rules',async()=>{
 const f=await referenceFixture();await configureProjectDna(f.env,referenceOwner,{config:dnaConfig,expected_revision:1});const dna=await readProjectDna(f.env,referenceOwner);assert.equal(dna.title,'Nala Valley DNA');assert.equal(dna.status,'awaiting_sources');assert.equal(dna.sources.length,0);assert.equal(dna.setups.length,0);const state=await readState(f.env,referenceOwner);assert.match(projectDnaView(dna,state.state),/Chưa có kết luận/);
});
test('DNA analysis requires real shot citations, compiles anchor templates, and enters production with source images',async()=>{
 const f=await referenceFixture(),{profile}=await importReferenceFixture(f);const loaded=await readState(f.env,referenceOwner);await configureProjectDna(f.env,referenceOwner,{config:{...dnaConfig,anchorReferenceId:profile.id},expected_revision:loaded.revision});
 const queued=await queueReferenceAnalysis(f.env,referenceOwner,profile.id),packet=await referenceAnalysisAction(f.env,referenceOwner,{action:'get',job_id:queued.job.id});assert.equal(packet.context.dnaTarget.anchor,true);const claim=await referenceAnalysisAction(f.env,referenceOwner,{action:'claim',job_id:queued.job.id}),analysis=referenceAnalysisFixture(profile);
 await assert.rejects(referenceAnalysisAction(f.env,referenceOwner,{action:'submit',job_id:queued.job.id,claim_token:claim.claimToken,analysis}),e=>e.status===400);
 analysis.dna=dnaFixture();const bad=structuredClone(analysis.dna);bad.setups[0].sourceShotIds=['MADE_UP'];assert.throws(()=>validateDnaPatterns(bad,profile.shots));
 await referenceAnalysisAction(f.env,referenceOwner,{action:'submit',job_id:queued.job.id,claim_token:claim.claimToken,analysis});
 const dna=await readProjectDna(f.env,referenceOwner);assert.equal(dna.status,'ready');assert.equal(dna.setups[0].authority,'owner_anchor');assert.equal(dna.setups[0].templateReferenceId,profile.id);assert.equal(dna.setups[0].evidence[0].imageId,profile.shots[0].imageId);assert.equal(dna.signature,(await readProjectDna(f.env,referenceOwner)).signature);
 const task=await queueTask(f.env,referenceOwner,'ep-01'),work=await getTask(f.env,referenceOwner,task.id);assert.equal(work.context.resources.dna.mode,'match_reference_layout');assert.ok(work.context.resources.assets.some(a=>a.id===profile.shots[0].imageId));assert.match(work.instructions,/giữ cấu trúc bố cục/);
 const current=await readState(f.env,referenceOwner);current.state.episodes[0].referenceSelection={videoTypes:[],sceneTypes:[],referenceIds:[],dnaEnabled:false};await saveState(f.env,referenceOwner,current.state,current.revision);const other=await queueTask(f.env,referenceOwner,'ep-01'),without=await getTask(f.env,referenceOwner,other.id);assert.equal(without.context.resources.dna,undefined);
});
test('DNA configuration respects revision and active production leases; imported markup is escaped',async()=>{
 const f=await referenceFixture(),task=await queueTask(f.env,referenceOwner,'ep-01');await claimTask(f.env,referenceOwner,task.id);
 await assert.rejects(configureProjectDna(f.env,referenceOwner,{config:dnaConfig,expected_revision:1}),e=>e.status===409);assert.equal((await readState(f.env,referenceOwner)).state.project.dnaConfig,undefined);
 const rendered=projectDnaView({configured:true,status:'awaiting_sources',title:'x',config:{...dnaConfig,ownerBrief:'<img src=x onerror=1>'},sources:[],principles:[],setups:[],recipes:[]},(await readState(f.env,referenceOwner)).state);assert.ok(!rendered.includes('<img src=x'));assert.match(rendered,/&lt;img/);
});

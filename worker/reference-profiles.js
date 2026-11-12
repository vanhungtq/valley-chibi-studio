import {readProjectDna,validateDnaPatterns} from './project-dna.js';
import {readState,body,fail,json} from './api.js';
import {filterReferenceRecord,referenceTags,referenceTaxonomy} from '../public/reference-catalog.js';

export const REFERENCE_ANALYSIS_PROTOCOL='valley-reference-analysis/1';
const rpHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
const rpSize=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const rpString=(value,max=4000)=>typeof value==='string'&&value.length<=max;
function rpStrings(value,max=50){return Array.isArray(value)&&value.length<=max&&value.every(s=>rpString(s,100)&&s.trim());}
function rpSummary(profile,sourceHash){return {id:profile.id,kind:'reference',package:true,title:profile.title,note:profile.note,tags:profile.tags,url:profile.url,source:profile.source,episodeId:null,imageIds:[profile.shots[0]?.imageId].filter(Boolean),videoId:'',shots:[],shotCount:profile.shots.length,videoTypes:profile.videoTypes,sceneTypes:profile.sceneTypes,sourceHash,analysisStatus:profile.analysis?.sourceHash===sourceHash?'complete':profile.analysis?'stale':'not_analyzed'};}
function rpValidate(profile,assets,owner){
 if(!profile||!rpString(profile.id,80)||!/^[a-f0-9-]{36}$/.test(profile.id)||!rpString(profile.title,500)||!profile.title.trim()||!rpString(profile.note,10000)||!rpString(profile.url,1000)||profile.url&&!/^https?:\/\//i.test(profile.url)||!rpString(profile.source,500)||!rpString(profile.tags,500)||!rpStrings(profile.videoTypes,30)||!Array.isArray(profile.shots)||!profile.shots.length||profile.shots.length>300||!rpString(profile.sourceCsv,1024*1024))throw fail(400,'Hồ sơ cần tiêu đề, loại video, CSV và 1–300 shot hợp lệ.');
 const ids=new Set();for(const shot of profile.shots){
  const asset=assets.find(a=>a.id===shot?.imageId);
  if(!shot||!rpString(shot.id,80)||!/^[a-zA-Z0-9_-]+$/.test(shot.id)||ids.has(shot.id)||['title','timecode','size','lens','move','note','sceneId','sceneTitle','originalId'].some(k=>!rpString(shot[k],k==='note'?4000:500))||!rpStrings(shot.sceneTypes,10)||!asset||asset.episodeId||!asset.mime.startsWith('image/')||asset.key!=='users/'+encodeURIComponent(owner)+'/'+asset.id)throw fail(400,'Shot trùng ID, ảnh thiếu/sai phạm vi hoặc phân loại không hợp lệ.');
  ids.add(shot.id);
 }
 profile.sceneTypes=referenceTags(profile.shots.flatMap(s=>s.sceneTypes));
 if(rpSize(profile)>1024*1024)throw fail(413,'Hồ sơ quá lớn; giảm ghi chú/CSV xuống dưới 1 MiB.');
}
const rpSource=profile=>({title:profile.title,note:profile.note,url:profile.url,source:profile.source,videoTypes:profile.videoTypes,shots:profile.shots});
async function rpRow(env,owner,id){const row=await env.DB.prepare('SELECT * FROM reference_profiles WHERE owner = ? AND id = ?').bind(owner,id).first();if(!row)throw fail(404,'Không tìm thấy hồ sơ video mẫu.');return row;}
export async function readReferenceProfile(env,owner,id){const row=await rpRow(env,owner,id);return {profile:JSON.parse(row.data),revision:row.revision,sourceHash:row.source_hash};}
export async function validateProfileBindings(env,owner,state){
 const active=state.references.filter(r=>r.package);if(!active.length)return;
 const ids=new Set(state.assets.filter(a=>!a.episodeId&&a.mime.startsWith('image/')).map(a=>a.id));
 for(const ref of active){const row=await rpRow(env,owner,ref.id),profile=JSON.parse(row.data);if(profile.shots.some(s=>!ids.has(s.imageId)))throw fail(400,'Ảnh đang được dùng trong hồ sơ video mẫu. Gỡ hồ sơ trước khi xóa ảnh.');}
}
export async function assertReferenceFileUnused(env,owner,id){
 const {state}=await readState(env,owner);if(!state.references.some(r=>r.package))return;
 const used=await env.DB.prepare("SELECT p.id FROM reference_profiles p, json_each(p.data,'$.shots') shot WHERE p.owner = ? AND json_extract(shot.value,'$.imageId') = ? LIMIT 1").bind(owner,id).first();if(used)throw fail(409,'Ảnh đang dùng trong hồ sơ video mẫu. Gỡ hồ sơ trước khi xóa ảnh.');
}
async function rpCommit(env,owner,loaded,profile,hash,old,assets=[]){
 const state=loaded.state,at=new Date().toISOString();state.assets.push(...assets);state.references=state.references.filter(r=>r.id!==profile.id);state.references.push(rpSummary(profile,hash));state.updatedAt=at;
 if(state.assets.length>600||state.references.length>300||rpSize(state)>2*1024*1024)throw fail(413,'Kho dự án đã đầy (600 tài nguyên, 300 reference hoặc 2 MiB metadata).');
 const serialized=JSON.stringify(state),revision=loaded.revision+1;
 const guard=old?'EXISTS (SELECT 1 FROM reference_profiles WHERE owner = ? AND id = ? AND revision = ?)':'NOT EXISTS (SELECT 1 FROM reference_profiles WHERE owner = ? AND import_hash = ?)';
 const args=old?[owner,profile.id,old.revision]:[owner,profile.importHash];
 const update=loaded.revision===0?env.DB.prepare(`INSERT OR IGNORE INTO studio_state (owner,state,revision,updated_at) SELECT ?,?,1,? WHERE ${guard}`).bind(owner,serialized,at,...args):env.DB.prepare(`UPDATE studio_state SET state = ?, revision = revision + 1, updated_at = ? WHERE owner = ? AND revision = ? AND ${guard}`).bind(serialized,at,owner,loaded.revision,...args);
 const active='EXISTS (SELECT 1 FROM studio_state WHERE owner = ? AND revision = ? AND state = ?)';
 const write=old?env.DB.prepare(`UPDATE reference_profiles SET data = ?, source_hash = ?, revision = revision + 1, updated_at = ? WHERE owner = ? AND id = ? AND revision = ? AND ${active}`).bind(JSON.stringify(profile),hash,at,owner,profile.id,old.revision,owner,revision,serialized):env.DB.prepare(`INSERT INTO reference_profiles (id,owner,import_hash,data,source_hash,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${active}`).bind(profile.id,owner,profile.importHash,JSON.stringify(profile),hash,at,at,owner,revision,serialized);
 const statements=[update,write];if(old&&old.source_hash!==hash)statements.push(env.DB.prepare(`UPDATE reference_jobs SET status = 'stale', claim_token = NULL, lease_until = NULL WHERE owner = ? AND reference_id = ? AND source_hash != ? AND status IN ('queued','running') AND ${active}`).bind(owner,profile.id,hash,owner,revision,serialized));
 const result=await env.DB.batch(statements);if(!result[0].meta.changes||!result[1].meta.changes)throw fail(409,'Dự án vừa thay đổi. Tải lại và thử lại; chưa ghi đè dữ liệu.');
 return {reference:rpSummary(profile,hash),profileRevision:(old?.revision||0)+1,revision};
}
export async function referenceProfileApi(request,env,owner){
 const url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean),id=parts[2];
 if(parts.length===2&&request.method==='GET'){const hash=url.searchParams.get('importHash');if(!hash||!/^[a-f0-9]{64}$/.test(hash))throw fail(400,'Cần hash nhập hợp lệ.');const row=await env.DB.prepare('SELECT id FROM reference_profiles WHERE owner = ? AND import_hash = ?').bind(owner,hash).first();return json({id:row?.id||null});}
 if(parts.length===2&&request.method==='POST'){
  const b=await body(request),loaded=await readState(env,owner);if(loaded.revision!==b.expectedRevision)throw fail(409,'Dự án vừa thay đổi. Tải lại rồi nhập.');
  if(!b.profile||!/^[a-f0-9]{64}$/.test(b.profile.importHash||''))throw fail(400,'Thiếu dấu kiểm tra gói nhập.');
  const duplicate=await env.DB.prepare('SELECT id FROM reference_profiles WHERE owner = ? AND import_hash = ?').bind(owner,b.profile.importHash).first();if(duplicate)return json({alreadyImported:true,id:duplicate.id});
  const assets=b.assets;if(!Array.isArray(assets)||assets.length>300)throw fail(400,'Danh sách ảnh nhập không hợp lệ.');
  const used=new Set(loaded.state.assets.map(a=>a.id));for(const a of assets){if(!a||!/^[a-f0-9-]{36}$/.test(a.id)||used.has(a.id)||a.key!=='users/'+encodeURIComponent(owner)+'/'+a.id||a.url!=='/api/files/'+a.id||!['image/jpeg','image/png','image/webp','image/avif'].includes(a.mime)||a.episodeId!==null||a.category!=='reference'||!Number.isFinite(a.size)||a.size<1||a.size>4*1024*1024||!rpString(a.name,240)||!rpString(a.description,6000)||!rpString(a.tags,300))throw fail(400,'Metadata ảnh nhập không hợp lệ.');used.add(a.id);}
  const profile={...b.profile,kind:'reference',package:true,episodeId:null};delete profile.analysis;
  rpValidate(profile,[...loaded.state.assets,...assets],owner);return json(await rpCommit(env,owner,loaded,profile,await rpHash(rpSource(profile)),null,assets),201);
 }
 if(parts[3]==='analyze'&&request.method==='POST')return json(await queueReferenceAnalysis(env,owner,id),201);
 if(parts[3]==='handoff'&&request.method==='POST'){
  await rpRow(env,owner,id);const job=await env.DB.prepare("SELECT * FROM reference_jobs WHERE owner = ? AND reference_id = ? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1").bind(owner,id).first();if(!job)throw fail(409,'Không có đầu việc phân tích đang chờ hoặc đang chạy.');
  const changed=await env.DB.prepare("UPDATE reference_jobs SET status = 'queued', claim_token = NULL, lease_until = NULL, progress = ?, updated_at = ? WHERE owner = ? AND id = ? AND status IN ('queued','running')").bind(('Chủ Xưởng đã bàn giao sang Codex khác. '+job.progress).slice(0,1200),new Date().toISOString(),owner,job.id).run();if(!changed.meta.changes)throw fail(409,'Đầu việc vừa kết thúc hoặc thay đổi; tải lại hồ sơ.');return json({handedOff:true,jobId:job.id});
 }
 if(parts.length===3&&request.method==='GET')return json(await readReferenceProfile(env,owner,id));
 if(parts.length===3&&request.method==='PUT'){
  const b=await body(request),old=await rpRow(env,owner,id),loaded=await readState(env,owner);if(b.expectedRevision!==loaded.revision||b.profileRevision!==old.revision)throw fail(409,'Hồ sơ vừa thay đổi. Mở lại trước khi lưu.');
  const profile=JSON.parse(old.data);for(const k of ['title','note','source','url','tags','videoTypes'])if(b[k]!==undefined)profile[k]=b[k];
  if(b.videoTypes!==undefined||b.sceneTypesById)profile.classificationSource='user';
  if(b.sceneTypesById){if(typeof b.sceneTypesById!=='object')throw fail(400,'Phân loại cảnh không hợp lệ.');profile.shots=profile.shots.map(s=>({...s,sceneTypes:b.sceneTypesById[s.sceneId]??s.sceneTypes}));}
  rpValidate(profile,loaded.state.assets,owner);return json(await rpCommit(env,owner,loaded,profile,await rpHash(rpSource(profile)),old));
 }
 if(parts.length===3&&request.method==='DELETE'){
  const loaded=await readState(env,owner),old=await rpRow(env,owner,id);loaded.state.references=loaded.state.references.filter(r=>r.id!==id);const serialized=JSON.stringify(loaded.state),at=new Date().toISOString();
  const result=await env.DB.batch([env.DB.prepare('UPDATE studio_state SET state = ?, revision = revision + 1 WHERE owner = ? AND revision = ? AND EXISTS (SELECT 1 FROM reference_profiles WHERE owner = ? AND id = ? AND revision = ?)').bind(serialized,owner,loaded.revision,owner,id,old.revision),env.DB.prepare('DELETE FROM reference_profiles WHERE owner = ? AND id = ? AND revision = ? AND EXISTS (SELECT 1 FROM studio_state WHERE owner = ? AND revision = ? AND state = ?)').bind(owner,id,old.revision,owner,loaded.revision+1,serialized),env.DB.prepare("UPDATE reference_jobs SET status = 'stale', claim_token = NULL, lease_until = NULL WHERE owner = ? AND reference_id = ? AND status IN ('queued','running') AND EXISTS (SELECT 1 FROM studio_state WHERE owner = ? AND revision = ? AND state = ?) AND NOT EXISTS (SELECT 1 FROM reference_profiles WHERE owner = ? AND id = ?)").bind(owner,id,owner,loaded.revision+1,serialized,owner,id)]);if(!result[1].meta.changes)throw fail(409,'Dữ liệu vừa thay đổi.');return json({deleted:true});
 }
 throw fail(404,'Thao tác hồ sơ không tồn tại.');
}

export async function hydrateReferenceResources(env,owner,state,episode,resources){
 if(!episode.referenceSelection&&!resources.references.some(r=>r.package))return resources;
 const refs=[];for(const summary of resources.references){let ref=summary;if(summary.package){const loaded=await readReferenceProfile(env,owner,summary.id);ref={...loaded.profile};delete ref.sourceCsv;if(ref.analysis?.sourceHash!==loaded.sourceHash)delete ref.analysis;ref=filterReferenceRecord(ref,episode.referenceSelection);}
  if(ref)refs.push(ref);
 }
 const explicit=new Set(refs.flatMap(r=>[...(r.imageIds||[]),r.videoId,...(r.shots||[]).map(s=>s.imageId)]).filter(Boolean));
 const productionIds=new Set([...episode.scenes.flatMap(s=>s.shots.flatMap(sh=>sh.assetIds||[])),...Object.values(episode.actualPhotos||{}).flatMap(p=>p.map(x=>x.assetId)),...Object.values(episode.storyboards||{}).map(b=>b.assetId)]);
 const assets=state.assets.filter(a=>(a.category!=='reference'||explicit.has(a.id)||productionIds.has(a.id))&&(!a.episodeId||a.episodeId===episode.id)&&(explicit.has(a.id)||resources.assets.some(b=>b.id===a.id)));
 if(rpSize({references:refs,assets})>1024*1024)throw fail(413,'Gói reference quá lớn. Chọn ít hồ sơ hơn hoặc lọc phân cảnh cụ thể.');
 return {...resources,references:refs,assets,selection:{...resources.selection,includedAssets:assets.length,includedReferences:refs.length,requested:episode.referenceSelection||null}};
}
const rpPublicJob=row=>({id:row.id,taskId:'reference:'+row.id,type:'reference_analysis',referenceId:row.reference_id,status:row.status,sourceHash:row.source_hash,leaseUntil:row.lease_until,progress:row.progress,createdAt:row.created_at});
export async function listReferenceJobs(env,owner){const rows=await env.DB.prepare('SELECT id,reference_id,status,source_hash,lease_until,progress,created_at FROM reference_jobs WHERE owner = ? ORDER BY created_at DESC LIMIT 50').bind(owner).all();return rows.results.map(rpPublicJob);}
export async function queueReferenceAnalysis(env,owner,id){
 const row=await rpRow(env,owner,id),loaded=await readState(env,owner),profile=JSON.parse(row.data);
 if(!loaded.state.references.some(r=>r.id===id))throw fail(404,'Hồ sơ đã được gỡ.');
 const prior=await env.DB.prepare("SELECT * FROM reference_jobs WHERE owner = ? AND reference_id = ? AND source_hash = ? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1").bind(owner,id,row.source_hash).first();if(prior)return {job:rpPublicJob(prior)};
 delete profile.analysis;delete profile.sourceCsv;const ids=new Set(profile.shots.map(s=>s.imageId)),assets=loaded.state.assets.filter(a=>ids.has(a.id));if(assets.length!==ids.size)throw fail(409,'Một số ảnh đã bị gỡ.');
 const library=loaded.state.project.dnaConfig?await readProjectDna(env,owner,loaded.state):null,dnaTarget=library?.config?{title:library.title,mode:library.mode,ownerBrief:library.config.ownerBrief,anchorLabel:library.config.anchorLabel,anchor:library.anchorReferenceId===id,knownKeys:Object.fromEntries(['principles','setups','recipes'].map(k=>[k,library[k].map(p=>({key:p.key,title:p.title}))]))}:null;
 const jobId=crypto.randomUUID(),at=new Date().toISOString();await env.DB.prepare("INSERT OR IGNORE INTO reference_jobs (id,owner,reference_id,status,source_hash,snapshot,created_at,updated_at) SELECT ?,?,?,'queued',?,?,?,? WHERE EXISTS (SELECT 1 FROM reference_profiles WHERE owner = ? AND id = ? AND source_hash = ?)").bind(jobId,owner,id,row.source_hash,JSON.stringify({profile,assets,taxonomy:referenceTaxonomy(loaded.state),...(dnaTarget?{dnaTarget}:{})}),at,at,owner,id,row.source_hash).run();
 const actual=await env.DB.prepare("SELECT * FROM reference_jobs WHERE owner = ? AND reference_id = ? AND source_hash = ? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1").bind(owner,id,row.source_hash).first();if(!actual)throw fail(409,'Hồ sơ vừa thay đổi. Giao phân tích lại.');return {job:rpPublicJob(actual)};
}
async function rpJob(env,owner,id){const row=await env.DB.prepare('SELECT * FROM reference_jobs WHERE owner = ? AND id = ?').bind(owner,id).first();if(!row)throw fail(404,'Không tìm thấy đầu việc phân tích.');return row;}
const RP_INSTRUCTIONS='Phân tích video tham khảo trong phiên Codex hiện tại, không gọi API mô hình. Gói chỉ có ảnh từng shot + CSV, KHÔNG có video/âm thanh hoàn chỉnh. Đọc từng ảnh qua studio_read_resource, giữ ID và timecode. Có thể tính thời lượng từ start/end trong CSV, ghi rõ kết quả được suy ra từ bảng timecode. Tách quan sát ảnh, mô tả CSV và suy luận; không khẳng định chuyển động, nhịp dựng hay âm thanh chưa quan sát được. Báo tiến độ ít nhất mỗi 10 phút (lease 15 phút). Trích nguyên tắc bố cục, ánh sáng, coverage, continuity và cách áp dụng theo vai trò; tách mẫu kỹ thuật dùng lại khỏi nhân vật, bối cảnh và câu chuyện của nguồn. Gợi ý phân loại theo context.taxonomy, có thể đề xuất loại mới. Nếu context.dnaTarget có dữ liệu, phân tích thêm analysis.dna version 1.0 gồm principles, setups, recipes. Mỗi mẫu có key ASCII ổn định (dùng lại knownKeys khi cùng nguyên tắc; đọc studio_project_dna action=get hoặc studio_get_task task_id=dna:active để đối chiếu ảnh/mẫu nguồn chuẩn trước khi gắn key), title, description, application, roles, sceneTypes, sourceShotIds, evidenceBasis (still/csv/derived_timing/mixed). Setup cần frameLayout mô tả bố cục để thay bối cảnh/nhân vật của chủ dự án mà giữ setup tương tự. Recipe cần steps [{label,shotIds}] theo thứ tự cảnh. Tách nguyên tắc chung và biến thể theo chủ đề, không gán điều chưa thấy cho DNA. Trả analysis gồm title, summary, videoTypes [dạng video đề xuất], observations [{shotId,imageId,observation,sceneTypes:[loại phân cảnh]}], skills [{title,technique,application,roles,sourceShotIds,sceneTypes}], limits [điều chưa xác minh]. Mỗi shot trong gói phải có observation; skill phải có nguồn shot. Đây là tri thức lưu dùng lại, không phải huấn luyện lại mô hình. Nếu tool cũ, nộp scenes=[] và JSON analysis trong block valley-reference-analysis ở cuối output.content. Phần còn lại theo schema tool hiện có.';
export async function referenceAnalysisAction(env,owner,args){
 if(args.action==='list')return {jobs:await listReferenceJobs(env,owner)};
 const row=await rpJob(env,owner,args.job_id),snapshot=JSON.parse(row.snapshot);
 if(args.action==='get')return {task:rpPublicJob(row),context:snapshot,instructions:RP_INSTRUCTIONS,analysisSchema:{title:'string',summary:'string',videoTypes:['dạng video đề xuất · tùy chọn'],observations:[{sceneTypes:['loại phân cảnh đề xuất · tùy chọn'],shotId:'ID trong context.profile.shots',imageId:'resource ID ảnh đã đọc',observation:'quan sát cụ thể'}],skills:[{title:'string',technique:'string',application:'string',roles:['ceo|creative|writer|camera|designer'],sourceShotIds:['shot ID'],sceneTypes:['phân loại cảnh']}],limits:['giới hạn quan sát']}};
 const current=await rpRow(env,owner,row.reference_id);
 if(current.source_hash!==row.source_hash){if(row.status!=='completed')await env.DB.prepare("UPDATE reference_jobs SET status = 'stale', claim_token = NULL, lease_until = NULL WHERE owner = ? AND id = ?").bind(owner,row.id).run();throw fail(409,'Hồ sơ đã thay đổi. Giao một lượt phân tích mới.');}
 const at=new Date().toISOString();
 if(args.action==='claim'){
  const token=crypto.randomUUID(),result=await env.DB.prepare("UPDATE reference_jobs SET status = 'running', claim_token = ?, lease_until = ?, updated_at = ? WHERE owner = ? AND id = ? AND (status = 'queued' OR status = 'running' AND lease_until < ?)").bind(token,Date.now()+900000,at,owner,row.id,Date.now()).run();if(!result.meta.changes)throw fail(409,'Đầu việc đang thuộc phiên khác hoặc đã kết thúc.');return {task:rpPublicJob({...row,status:'running',lease_until:Date.now()+900000}),claimToken:token};
 }
 const analysis=args.analysis,hash=analysis?await rpHash(analysis):null;
 if(args.action==='submit'&&row.status==='completed'&&row.result_hash===hash)return {alreadySubmitted:true,referenceId:row.reference_id};
 if(row.status!=='running'||!args.claim_token||row.claim_token!==args.claim_token||row.lease_until<Date.now())throw fail(409,'Cần claim còn hiệu lực của phiên này.');
 if(args.action==='progress'||args.action==='fail'){
  if(!rpString(args.message,1200)||!args.message.trim())throw fail(400,'Cần ghi chú ngắn.');const result=await env.DB.prepare("UPDATE reference_jobs SET progress = ?, lease_until = ?, status = ?, updated_at = ? WHERE owner = ? AND id = ? AND status = 'running' AND claim_token = ? AND lease_until >= ?").bind(args.message,Date.now()+900000,args.action==='fail'?'failed':'running',at,owner,row.id,args.claim_token,Date.now()).run();if(!result.meta.changes)throw fail(409,'Claim vừa thay đổi.');return {saved:true};
 }
 if(args.action!=='submit')throw fail(400,'Thao tác phân tích không hợp lệ.');
 if(!analysis||!rpString(analysis.title,500)||!analysis.title.trim()||!rpString(analysis.summary,6000)||!Array.isArray(analysis.observations)||analysis.observations.length!==snapshot.profile.shots.length||!Array.isArray(analysis.skills)||!analysis.skills.length||analysis.skills.length>60||!Array.isArray(analysis.limits)||!analysis.limits.length||analysis.limits.length>30||analysis.limits.some(s=>!rpString(s,2000)||!s.trim())||rpSize(analysis)>512*1024)throw fail(400,'Phân tích cần đủ quan sát từng shot, kỹ năng có nguồn và giới hạn nhận định.');
 if(snapshot.dnaTarget&&!analysis.dna)throw fail(400,'Gói này yêu cầu DNA: cần analysis.dna version 1.0 với principles, setups, recipes có dẫn chứng.');
 if(analysis.dna)validateDnaPatterns(analysis.dna,snapshot.profile.shots);
 if(analysis.videoTypes!==undefined&&!rpStrings(analysis.videoTypes,30))throw fail(400,'Phân loại video đề xuất không hợp lệ.');
 const seen=new Set(),shotMap=new Map(snapshot.profile.shots.map(s=>[s.id,s]));
 for(const o of analysis.observations){if(!o||seen.has(o.shotId)||!shotMap.has(o.shotId)||shotMap.get(o.shotId).imageId!==o.imageId||(o.sceneTypes!==undefined&&!rpStrings(o.sceneTypes,10))||!rpString(o.observation,4000)||!o.observation.trim())throw fail(400,'Quan sát phải dẫn đúng shot và ảnh trong gói.');seen.add(o.shotId);}
 for(const skill of analysis.skills)if(!skill||!['title','technique','application'].every(k=>rpString(skill[k],4000)&&skill[k].trim())||!rpStrings(skill.roles,5)||!skill.roles.length||skill.roles.some(r=>!['ceo','creative','writer','camera','designer'].includes(r))||!rpStrings(skill.sourceShotIds,300)||!skill.sourceShotIds.length||new Set(skill.sourceShotIds).size!==skill.sourceShotIds.length||skill.sourceShotIds.some(id=>!seen.has(id))||!rpStrings(skill.sceneTypes,20))throw fail(400,'Kỹ năng cần vai trò, cách áp dụng và ID shot dẫn chứng.');
 const loaded=await readState(env,owner),profile=JSON.parse(current.data),summary=loaded.state.references.find(r=>r.id===row.reference_id);if(!summary)throw fail(409,'Hồ sơ đã được gỡ.');
 let inferred=false;if(!profile.videoTypes.length&&analysis.videoTypes?.length){profile.videoTypes=analysis.videoTypes;inferred=true;}
 for(const shot of profile.shots)if(!shot.sceneTypes.length){const observation=analysis.observations.find(o=>o.shotId===shot.id),types=observation.sceneTypes||referenceTags(analysis.skills.filter(s=>s.sourceShotIds.includes(shot.id)).flatMap(s=>s.sceneTypes));if(types.length){shot.sceneTypes=types;inferred=true;}}
 profile.sceneTypes=referenceTags(profile.shots.flatMap(s=>s.sceneTypes));if(inferred)profile.classificationSource='codex_suggested';const finalSourceHash=await rpHash(rpSource(profile));
 profile.analysis={...analysis,sourceHash:finalSourceHash,jobId:row.id,analyzedAt:at};if(rpSize(profile)>1536*1024)throw fail(413,'Kết quả khiến hồ sơ vượt giới hạn lưu trữ.');
 Object.assign(summary,rpSummary(profile,finalSourceHash),{skillCount:analysis.skills.length});loaded.state.updatedAt=at;const serialized=JSON.stringify(loaded.state),revision=loaded.revision+1;
 const guard="EXISTS (SELECT 1 FROM reference_jobs WHERE owner = ? AND id = ? AND status = 'running' AND claim_token = ? AND lease_until >= ?) AND EXISTS (SELECT 1 FROM reference_profiles WHERE owner = ? AND id = ? AND source_hash = ? AND revision = ?)";
 const update=env.DB.prepare(`UPDATE studio_state SET state = ?, revision = revision + 1, updated_at = ? WHERE owner = ? AND revision = ? AND ${guard}`).bind(serialized,at,owner,loaded.revision,owner,row.id,args.claim_token,Date.now(),owner,row.reference_id,row.source_hash,current.revision);
 const active='EXISTS (SELECT 1 FROM studio_state WHERE owner = ? AND revision = ? AND state = ?)';
 const result=await env.DB.batch([update,env.DB.prepare(`UPDATE reference_profiles SET data = ?, source_hash = ?, revision = revision + 1, updated_at = ? WHERE owner = ? AND id = ? AND ${active}`).bind(JSON.stringify(profile),finalSourceHash,at,owner,row.reference_id,owner,revision,serialized),env.DB.prepare(`UPDATE reference_jobs SET status = 'completed', source_hash = ?, result_hash = ?, updated_at = ?, claim_token = NULL, lease_until = NULL WHERE owner = ? AND id = ? AND ${active}`).bind(finalSourceHash,hash,at,owner,row.id,owner,revision,serialized)]);
 if(!result[0].meta.changes)throw fail(409,'Dữ liệu vừa thay đổi. Nộp lại cùng kết quả.');return {referenceId:row.reference_id,skills:analysis.skills.length,revision,completed:true};
}

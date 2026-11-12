import {readState,body,fail,json} from './api.js';
import {referenceKey} from '../public/reference-catalog.js';

export const PROJECT_DNA_PROTOCOL='valley-project-dna/1';
const dnaString=(value,max=4000)=>typeof value==='string'&&value.length<=max;
const dnaStrings=(value,max=50)=>Array.isArray(value)&&value.length<=max&&value.every(s=>dnaString(s,100)&&s.trim());
const dnaBytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const dnaHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
export function validateDnaConfig(config){
 if(!config||typeof config.enabled!=='boolean'||!dnaString(config.title,160)||!config.title.trim()||!dnaString(config.anchorLabel,100)||!dnaString(config.anchorReferenceId,80)||!dnaString(config.ownerBrief,6000)||!dnaStrings(config.sourceReferenceIds,50)||!['match_reference_layout','adapt_layout'].includes(config.mode))throw fail(400,'Cấu hình DNA không hợp lệ.');
}
export function validateDnaPatterns(dna,shots){
 if(!dna||dna.version!=='1.0'||dnaBytes(dna)>160*1024)throw fail(400,'DNA cần version 1.0 và tối đa 160 KiB.');
 if(['principles','setups','recipes'].every(k=>Array.isArray(dna[k])&&!dna[k].length))throw fail(400,'DNA chưa có mẫu có dẫn chứng.');
 const ids=new Set(shots.map(s=>s.id)),roles=new Set(['ceo','creative','writer','camera','designer']);
 for(const kind of ['principles','setups','recipes']){
  if(!Array.isArray(dna[kind])||dna[kind].length>60)throw fail(400,'DNA cần principles, setups, recipes dạng danh sách.');const keys=new Set();
  for(const p of dna[kind]){
   if(!p||!dnaString(p.key,100)||!/^[a-z0-9][a-z0-9_-]*$/.test(p.key)||keys.has(p.key)||!dnaString(p.title,300)||!p.title.trim()||!dnaString(p.description,4000)||!p.description.trim()||!dnaString(p.application,4000)||!p.application.trim()||!dnaStrings(p.roles,5)||!p.roles.length||p.roles.some(r=>!roles.has(r))||!dnaStrings(p.sceneTypes,20)||!dnaStrings(p.sourceShotIds,300)||!p.sourceShotIds.length||new Set(p.sourceShotIds).size!==p.sourceShotIds.length||p.sourceShotIds.some(id=>!ids.has(id))||!['still','csv','derived_timing','mixed'].includes(p.evidenceBasis))throw fail(400,'Mẫu DNA cần key duy nhất, mô tả, cách áp dụng, vai trò, nguồn shot và cơ sở quan sát.');
   keys.add(p.key);
   if(kind==='setups'&&(!dnaString(p.frameLayout,4000)||!p.frameLayout.trim()))throw fail(400,'Setup cần frameLayout mô tả bố cục của ảnh đã đọc.');
   if(kind==='recipes'){
    if(!Array.isArray(p.steps)||p.steps.length<2||p.steps.length>30)throw fail(400,'Mẫu phân cảnh cần 2–30 bước có ảnh dẫn chứng.');
    for(const step of p.steps)if(!step||!dnaString(step.label,500)||!step.label.trim()||!dnaStrings(step.shotIds,30)||!step.shotIds.length||step.shotIds.some(id=>!p.sourceShotIds.includes(id)))throw fail(400,'Bước phân cảnh phải dẫn shot trong mẫu.');
   }
  }
 }
}
export async function configureProjectDna(env,owner,args){
 const config=args.config;validateDnaConfig(config);const loaded=await readState(env,owner);
 if(args.expected_revision!==loaded.revision)throw fail(409,'Dự án vừa đổi. Đọc revision mới trước khi cấu hình DNA.');
 const referenceIds=new Set(loaded.state.references.filter(r=>r.package).map(r=>r.id));
 if(config.sourceReferenceIds.some(id=>!referenceIds.has(id))||config.anchorReferenceId&&!referenceIds.has(config.anchorReferenceId))throw fail(400,'Nguồn DNA phải là hồ sơ video mẫu của dự án.');
 if(JSON.stringify(loaded.state.project.dnaConfig)===JSON.stringify(config))return {revision:loaded.revision,alreadyConfigured:true};
 loaded.state.project.dnaConfig=config;loaded.state.updatedAt=new Date().toISOString();const text=JSON.stringify(loaded.state);
 if(dnaBytes(loaded.state)>2*1024*1024)throw fail(413,'Dự án vượt giới hạn metadata.');
 const guard="NOT EXISTS (SELECT 1 FROM codex_tasks WHERE owner = ? AND status = 'running' AND lease_until >= ?)";
 const statement=loaded.revision===0
  ?env.DB.prepare(`INSERT OR IGNORE INTO studio_state (owner,state,revision,updated_at) SELECT ?,?,1,? WHERE ${guard}`).bind(owner,text,loaded.state.updatedAt,owner,Date.now())
  :env.DB.prepare(`UPDATE studio_state SET state = ?, revision = revision + 1, updated_at = ? WHERE owner = ? AND revision = ? AND ${guard}`).bind(text,loaded.state.updatedAt,owner,loaded.revision,owner,Date.now());
 const result=await statement.run();
 if(!result.meta.changes)throw fail(409,'Dự án vừa đổi hoặc Codex đang nhận việc. Giữ phiên hiện tại và cấu hình lại sau.');
 return {revision:loaded.revision+1,configured:true};
}
function dnaAnchor(config,rows){
 if(config.anchorReferenceId)return rows.find(r=>r.id===config.anchorReferenceId)?.id||null;
 const matches=rows.filter(r=>String(r.title).replace(/\.zip$/i,'').split(/[\s_.-]+/)[0].toLowerCase()===config.anchorLabel.toLowerCase());return matches.length===1?matches[0].id:null;
}
export async function readProjectDna(env,owner,state){
 state??=(await readState(env,owner)).state;const config=state.project.dnaConfig;
 if(!config)return {configured:false,status:'not_configured',title:'DNA dự án',sources:[],principles:[],setups:[],recipes:[]};
 validateDnaConfig(config);
 const active=state.references.filter(r=>r.package&&(!config.sourceReferenceIds.length||config.sourceReferenceIds.includes(r.id)));
 if(active.length>50)throw fail(413,'Chọn tối đa 50 nguồn cho bộ DNA.');
 const result={configured:true,config,title:config.title,mode:config.mode,status:'awaiting_sources',anchorReferenceId:null,sources:[],principles:[],setups:[],recipes:[]};
 if(!active.length)return result;
 const rows=(await env.DB.prepare(`SELECT p.id, p.source_hash, json_extract(p.data,'$.title') AS title, json_extract(p.data,'$.analysis.sourceHash') AS analyzed_hash, json_extract(p.data,'$.analysis.dna') AS dna, json_extract(p.data,'$.analysis.skills') AS skills, json_extract(p.data,'$.videoTypes') AS video_types, (SELECT json_group_array(json_object('id',json_extract(s.value,'$.id'),'imageId',json_extract(s.value,'$.imageId'))) FROM json_each(p.data,'$.shots') s) AS shot_map FROM reference_profiles p WHERE p.owner = ? AND p.id IN (${active.map(()=>'?').join(',')})`).bind(owner,...active.map(r=>r.id)).all()).results;
 rows.sort((a,b)=>a.id.localeCompare(b.id));const anchorId=dnaAnchor(config,rows);result.anchorReferenceId=anchorId;
 const groups=new Map(),assets=new Set(state.assets.map(a=>a.id));
 for(const row of rows){
  const fresh=row.analyzed_hash===row.source_hash,resultSource={id:row.id,title:row.title,anchor:row.id===anchorId,status:fresh?'analyzed':'awaiting_analysis',structured:false};result.sources.push(resultSource);if(!fresh)continue;
  const shots=JSON.parse(row.shot_map),byId=new Map(shots.map(s=>[s.id,s]));let dna;
  if(row.dna){dna=JSON.parse(row.dna);try{validateDnaPatterns(dna,shots);}catch{resultSource.status='invalid_dna';continue;}resultSource.structured=true;}
  else{const skills=JSON.parse(row.skills||'[]');dna={principles:skills.map((s,i)=>({key:referenceKey(s.title)||'skill'+i,title:s.title,description:s.technique,application:s.application,roles:s.roles,sceneTypes:s.sceneTypes,sourceShotIds:s.sourceShotIds,evidenceBasis:'mixed'})),setups:[],recipes:[]};}
  for(const kind of ['principles','setups','recipes'])for(const pattern of dna[kind]){
   const evidence=pattern.sourceShotIds.map(id=>byId.get(id)).filter(s=>s&&assets.has(s.imageId)).map(s=>({referenceId:row.id,referenceTitle:row.title,shotId:s.id,imageId:s.imageId,sourceHash:row.source_hash}));
   if(evidence.length!==pattern.sourceShotIds.length)continue;
   const clean=Object.fromEntries(['key','title','description','application','roles','sceneTypes','sourceShotIds','evidenceBasis','frameLayout','steps'].filter(k=>pattern[k]!==undefined).map(k=>[k,pattern[k]]));
   const key=kind+':'+pattern.key;let group=groups.get(key);if(!group){group={...clean,kind,templateReferenceId:row.id,evidence:[],sourceIds:[],videoTypes:[],authority:'single_source'};groups.set(key,group);}
   const sceneTypes=[...new Set([...group.sceneTypes,...pattern.sceneTypes])],roles=[...new Set([...group.roles,...pattern.roles])];
   if(row.id===anchorId){Object.assign(group,clean);group.templateReferenceId=row.id;}group.sceneTypes=sceneTypes;group.roles=roles;
   if(!group.sourceIds.includes(row.id))group.sourceIds.push(row.id);group.videoTypes=[...new Set([...group.videoTypes,...JSON.parse(row.video_types||'[]')])];group.evidence.push(...evidence);
  }
 }
 for(const group of groups.values()){
  group.core=group.sourceIds.includes(anchorId)||group.sourceIds.length>=2;group.authority=group.sourceIds.includes(anchorId)?'owner_anchor':group.sourceIds.length>=2?'cross_video':'single_source';result[group.kind].push(group);
 }
 for(const kind of ['principles','setups','recipes'])result[kind].sort((a,b)=>Number(b.core)-Number(a.core)||a.key.localeCompare(b.key));
 result.status=result.sources.every(s=>s.status!=='analyzed')?'awaiting_analysis':result.principles.some(p=>p.core)&&result.setups.some(p=>p.core)&&result.recipes.length?'ready':'partial';
 result.signature=await dnaHash({config,sources:rows.map(r=>[r.id,r.source_hash,r.analyzed_hash,r.dna,r.skills])});
 if(dnaBytes(result)>1024*1024)throw fail(413,'Bộ DNA lớn hơn 1 MiB; chọn ít nguồn hơn.');
 return result;
}
export async function dnaProductionResources(env,owner,state,episode,resources){
 if(!state.project.dnaConfig?.enabled||episode.referenceSelection?.dnaEnabled===false)return resources;
 const dna=await readProjectDna(env,owner,state);if(!dna.signature||!['ready','partial'].includes(dna.status))return resources;
 const chosen=episode.referenceSelection?.sceneTypes||[],matches=p=>!chosen.length||!p.sceneTypes.length||p.sceneTypes.some(t=>chosen.some(c=>referenceKey(t)===referenceKey(c)));
 const videoTypes=episode.referenceSelection?.videoTypes||[],videoMatches=p=>!videoTypes.length||p.videoTypes.some(t=>videoTypes.some(v=>referenceKey(t)===referenceKey(v)));
 const selected={title:dna.title,status:dna.status,signature:dna.signature,mode:dna.mode,anchorReferenceId:dna.anchorReferenceId,principles:dna.principles.filter(p=>p.core),setups:dna.setups.filter(p=>matches(p)&&(p.core||(chosen.length||videoTypes.length)&&videoMatches(p))),recipes:dna.recipes.filter(p=>matches(p)&&videoMatches(p))};
 const evidence=[...selected.principles,...selected.setups,...selected.recipes].flatMap(p=>p.evidence),ids=new Set(evidence.map(e=>e.imageId)),assets=[...resources.assets];for(const asset of state.assets)if(ids.has(asset.id)&&!assets.some(a=>a.id===asset.id))assets.push(asset);
 if(dnaBytes({...resources,assets,dna:selected})>1536*1024)throw fail(413,'DNA/reference quá lớn cho gói viết kịch bản. Chọn phân cảnh cụ thể hơn.');
 return {...resources,assets,dna:selected};
}
export async function projectDnaApi(request,env,owner){
 if(request.method==='GET')return json(await readProjectDna(env,owner));
 if(request.method==='POST')return json(await configureProjectDna(env,owner,await body(request)));
 throw fail(405,'DNA hỗ trợ GET và POST.');
}

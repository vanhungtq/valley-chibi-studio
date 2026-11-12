import {resumeEpisodeDossier,EPISODE_WORK_PROTOCOL} from './episode-work.js';
import {readState,saveState,fail} from './api.js';

export const DOSSIER_PROTOCOL='valley-episode-dossier/1';
const dossierRoles={pdf:'application/pdf',archive:'application/zip',shotlist:'text/csv',knowledge:'text/markdown'};
const dossierId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);
const dossierText=(value,max=4000)=>typeof value==='string'&&value.length<=max;
const dossierHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),n=>n.toString(16).padStart(2,'0')).join('');

// Read real CSV, including quoted commas/newlines and the UTF-8 BOM emitted for Excel.
export function parseDossierCsv(source){
 if(typeof source!=='string'||source.length>1024*1024)throw fail(413,'Shotlist CSV vượt giới hạn 1 MiB.');
 const rows=[];let row=[],field='',quoted=false,closed=false;
 const text=source.replace(/^\uFEFF/,'');
 const push=()=>{row.push(field);field='';closed=false;};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c==='"'){if(field||closed)throw fail(400,'Dấu nháy trong CSV không hợp lệ.');quoted=true;}
  else if(c===',')push();
  else if(c==='\n'||c==='\r'){push();if(row.some(v=>v!==''))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
  else{if(closed)throw fail(400,'Có ký tự sau ô CSV đã đóng.');field+=c;}
  if(rows.length>601||row.length>40)throw fail(413,'Shotlist có quá nhiều hàng hoặc cột.');
 }
 if(quoted)throw fail(400,'Ô CSV chưa đóng dấu nháy.');
 if(field||row.length||closed){push();if(row.some(v=>v!==''))rows.push(row);}
 const headers=rows.shift()||[];
 if(new Set(headers).size!==headers.length||!['shotId','sceneId','sceneTitle','seconds','start','end','page','panel'].every(k=>headers.includes(k)))throw fail(400,'CSV cần ID shot/cảnh, tiêu đề cảnh, timeline, page và panel.');
 return rows.map(values=>{
  if(values.length!==headers.length)throw fail(400,'Số cột CSV không khớp.');
  const record=Object.fromEntries(headers.map((key,i)=>[key,values[i]])),shot={};
  for(const key of ['shotId','sceneId','sceneTitle','timecode','size','angle','move','action','continuity','sound','lighting','aperture','recording','techniqueRefs'])shot[key]=record[key]||'';
  for(const key of ['seconds','start','end','page','panel','lensMm'])shot[key]=Number(record[key]);
  return shot;
 });
}

function dossierAsset(state,episodeId,id,mime){
 const asset=state.assets.find(a=>a.id===id);
 if(!asset||asset.episodeId&&asset.episodeId!==episodeId||!(mime==='image/'?asset.mime.startsWith(mime):asset.mime===mime))throw fail(400,'Tệp hồ sơ không tồn tại, sai định dạng hoặc thuộc tập khác.');
 return asset;
}
export function validateEpisodeDossiers(state){
 for(const episode of state.episodes){
  if(episode.dossiers===undefined)continue;
  if(!Array.isArray(episode.dossiers)||episode.dossiers.length>20)throw fail(400,'Mỗi tập tối đa 20 phiên bản hồ sơ.');
  const ids=new Set();
  for(const dossier of episode.dossiers){
   if(!dossier||!dossierId(dossier.id)||ids.has(dossier.id)||!dossierText(dossier.title,160)||!dossier.title.trim()||!dossierText(dossier.version,32)||!dossier.version.trim()||!dossierText(dossier.summary,3000)||!Number.isInteger(dossier.targetMinutes)||dossier.targetMinutes<1||dossier.targetMinutes>240||typeof dossier.publishedAt!=='string'||!Number.isFinite(Date.parse(dossier.publishedAt)))throw fail(400,'Phiên bản hồ sơ không hợp lệ.');
   ids.add(dossier.id);
   if(!dossier.files||Object.keys(dossier.files).length!==4)throw fail(400,'Hồ sơ cần PDF, ZIP, CSV và kiến thức Markdown.');
   for(const [role,mime] of Object.entries(dossierRoles))dossierAsset(state,episode.id,dossier.files[role],mime);
   if(!Array.isArray(dossier.shots)||!dossier.shots.length||dossier.shots.length>600)throw fail(400,'Hồ sơ cần danh sách shot hợp lệ.');
   const shots=new Map();let elapsed=0;
   for(const shot of dossier.shots){
    if(!shot||!dossierId(shot.shotId)||shots.has(shot.shotId)||!dossierId(shot.sceneId)||!dossierText(shot.sceneTitle,300)||!shot.sceneTitle.trim()||!Number.isInteger(shot.seconds)||shot.seconds<1||shot.seconds>600||shot.start!==elapsed||shot.end!==elapsed+shot.seconds||!Number.isInteger(shot.page)||shot.page<1||shot.page>150||!Number.isInteger(shot.panel)||shot.panel<1||shot.panel>4||!Number.isFinite(shot.lensMm)||shot.lensMm<1||shot.lensMm>2000||['timecode','size','angle','move','action','continuity','sound','lighting','aperture','recording','techniqueRefs'].some(k=>!dossierText(shot[k])))throw fail(400,'ID, timeline hoặc thông tin shot không hợp lệ.');
    shots.set(shot.shotId,shot);elapsed=shot.end;
   }
   if(Math.abs(elapsed-dossier.targetMinutes*60)>dossier.targetMinutes*3)throw fail(400,'Thời lượng shotlist phải khớp mục tiêu của bản hồ sơ (±5%).');
   if(!Array.isArray(dossier.gallery)||dossier.gallery.length>150)throw fail(400,'Danh sách ảnh storyboard không hợp lệ.');
   const covered=new Set(),pages=new Set(),imageIds=new Set();
   for(const item of dossier.gallery){
    dossierAsset(state,episode.id,item.assetId,'image/');
    if(!Array.isArray(item.shotIds)||!item.shotIds.length||item.shotIds.length>4||pages.has(item.page)||imageIds.has(item.assetId))throw fail(400,'Mỗi bảng storyboard cần ảnh riêng, 1–4 shot, mỗi page chỉ một bảng.');
    pages.add(item.page);imageIds.add(item.assetId);
    item.shotIds.forEach((id,index)=>{const shot=shots.get(id);if(!shot||covered.has(id)||shot.panel!==index+1||shot.page!==item.page)throw fail(400,'Ảnh storyboard cần đúng page, thứ tự ô và ID shot duy nhất.');covered.add(id);});
   }
   if(dossier.gallery.length&&covered.size!==shots.size)throw fail(400,'Storyboard chưa đủ ảnh cho tất cả shot trong hồ sơ.');
   if(dossier.visualBibleId)dossierAsset(state,episode.id,dossier.visualBibleId,'image/');
  }
 }
}

// An explicit owner publication groups existing private files as a read-only
// edition. It never changes creative task claims, outputs, approvals or policy.
export async function publishEpisodeDossier(env,owner,args){
 if(!env.MCP_OAUTH||env.MCP_IDENTITY?.id!==owner||!/^github:\d+$/.test(owner))throw fail(403,'Cần kết nối MCP Cloudflare của chủ Xưởng để trình bày hồ sơ.');
 if(!dossierId(args.episode_id)||!dossierId(args.dossier_id)||!Number.isInteger(args.expected_revision)||!Array.isArray(args.gallery)||args.gallery.some(g=>!g||typeof g.asset_id!=='string'||!Array.isArray(g.shot_ids))||!args.file_ids)throw fail(400,'Thiếu ID tập, ID phiên bản, revision hoặc tệp hồ sơ.');
 if(args.refresh_gallery_labels!==undefined&&typeof args.refresh_gallery_labels!=='boolean')throw fail(400,'Tùy chọn nhãn ảnh phải là bật hoặc tắt.');
 const request={episodeId:args.episode_id,id:args.dossier_id,title:args.title,version:args.version,summary:args.summary||'',files:args.file_ids,gallery:args.gallery,visualBibleId:args.visual_bible_id||null,refreshGalleryLabels:args.refresh_gallery_labels===true};
 const hash=await dossierHash(request),loaded=await readState(env,owner),episode=loaded.state.episodes.find(e=>e.id===args.episode_id);
 if(!episode)throw fail(404,'Không tìm thấy tập phim.');
 const existing=episode.dossiers?.find(d=>d.id===args.dossier_id);
 if(existing){if(existing.requestHash===hash)return {dossier:existing,episodeId:episode.id,revision:loaded.revision,alreadyPublished:true,url:'/#episodes/'+encodeURIComponent(episode.id)+'/'+encodeURIComponent(existing.id)};throw fail(409,'ID phiên bản này đã có nội dung khác. Dùng ID phiên bản mới.');}
 if(loaded.revision!==args.expected_revision)throw fail(409,'Dự án vừa thay đổi. Đọc lại studio_get_project trước khi trình bày hồ sơ.');
 const csv=dossierAsset(loaded.state,episode.id,args.file_ids.shotlist,'text/csv');
 if(csv.size>1024*1024)throw fail(413,'Shotlist CSV vượt giới hạn 1 MiB.');
 const object=await env.BUCKET.get(csv.key);if(!object)throw fail(503,'Shotlist đang đồng bộ trong KV. Chờ rồi thử lại.');
 const shots=parseDossierCsv(await object.text());
 const dossier={...request,targetMinutes:episode.targetMinutes||Math.round(shots.reduce((n,s)=>n+s.seconds,0)/60),shots,gallery:args.gallery.map(g=>({assetId:g.asset_id,shotIds:g.shot_ids,page:shots.find(s=>s.shotId===g.shot_ids?.[0])?.page})),publishedAt:new Date().toISOString(),requestHash:hash};
 delete dossier.episodeId;
 (episode.dossiers??=[]).push(dossier);validateEpisodeDossiers(loaded.state);
 if(args.refresh_gallery_labels===true)for(const item of dossier.gallery){const asset=loaded.state.assets.find(a=>a.id===item.assetId);asset.description=dossier.title+' · Storyboard AI · bảng '+item.page+' · '+item.shotIds.join(' · ')+'.';}
 if(new TextEncoder().encode(JSON.stringify(loaded.state)).length>2*1024*1024)throw fail(413,'Dự án vượt giới hạn 2 MiB; chưa công bố hồ sơ.');
 const revision=await saveState(env,owner,loaded.state,loaded.revision);
 return {dossier,episodeId:episode.id,revision,alreadyPublished:false,url:'/#episodes/'+encodeURIComponent(episode.id)+'/'+encodeURIComponent(dossier.id)};
}
export async function publishLegacyEpisodeDossier(env,owner,args){
 const match=/^episode:([a-zA-Z0-9_-]{1,80})$/.exec(args.task_id||'');
 if(!match||args.claim_token!==''||args.mime!=='application/json'||args.encoding!=='utf8'||args.storyboard_shot_ids!==undefined)throw fail(400,'Hồ sơ dùng namespace episode:<id>, claim rỗng và phong bì JSON.');
 let value;try{value=JSON.parse(args.content);}catch{throw fail(400,'Phong bì hồ sơ không phải JSON.');}
 if(value?.protocol===EPISODE_WORK_PROTOCOL&&value.episode_id===undefined){if(!env.MCP_OAUTH||env.MCP_IDENTITY?.id!==owner)throw fail(403,'Cần MCP Cloudflare của chủ Xưởng.');return resumeEpisodeDossier(env,owner,{...value,episode_id:match[1]});}
 if(value?.protocol!==DOSSIER_PROTOCOL||value.episode_id!==undefined)throw fail(400,'Sai giao thức hoặc phạm vi hồ sơ.');
 return publishEpisodeDossier(env,owner,{...value,episode_id:match[1]});
}

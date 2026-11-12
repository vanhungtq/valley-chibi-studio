import {referenceProfileApi,listReferenceJobs,validateProfileBindings,assertReferenceFileUnused} from './reference-profiles.js';
import {filterReferenceRecord,validateReferenceSelection} from '../public/reference-catalog.js';
import {resumeEpisodeDossier} from './episode-work.js';
import {validateEpisodeDossiers} from './episode-dossiers.js';
import { AGENTS, STAGES, seedState, SCENES } from '../public/data.js';
import {handleTasks,reconcileReviews,setWorkflow,continueWorkflow,startEpisode} from './bridge.js';
import {targetMinutes,approveEpisode} from '../public/workflow.js';
import {GENERIC_PRODUCTION_SCHEMA} from './production/contracts.js';
import {WORKFLOW} from './production/manifest.js';

export const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export const fail=(status,message)=>Object.assign(new Error(message),{status});
const userOf=r=>r.headers.get('oai-authenticated-user-id');
const clean=s=>String(s||'').slice(0,10000);
const MAX_FILE=30*1024*1024;
export const mimeTypes=new Set(['image/jpeg','image/png','image/webp','image/avif','application/pdf','text/plain','text/markdown','text/csv','application/json','application/zip','video/mp4','video/quicktime']);
const isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);

export async function readState(env,owner){
 const row=await env.DB.prepare('SELECT state, revision FROM studio_state WHERE owner = ?').bind(owner).first();
 return row?{state:JSON.parse(row.state),revision:row.revision}:{state:seedState(),revision:0};
}
export async function saveState(env,owner,state,revision){
 state.updatedAt=new Date().toISOString();
 if(revision===0){
  const r=await env.DB.prepare('INSERT OR IGNORE INTO studio_state (owner,state,revision,updated_at) VALUES (?,?,1,?)').bind(owner,JSON.stringify(state),state.updatedAt).run();
  if(!r.meta.changes)throw fail(409,'Dữ liệu vừa thay đổi ở một phiên khác. Hãy tải lại để đồng bộ.');
 }else{
  const r=await env.DB.prepare('UPDATE studio_state SET state = ?, revision = revision + 1, updated_at = ? WHERE owner = ? AND revision = ?').bind(JSON.stringify(state),state.updatedAt,owner,revision).run();
  if(!r.meta.changes)throw fail(409,'Dữ liệu vừa thay đổi ở một phiên khác. Hãy tải lại để đồng bộ.');
 }
 return revision+1;
}
export async function body(r){
 if(Number(r.headers.get('content-length')||0)>2*1024*1024)throw fail(413,'Dữ liệu quá lớn.');
 const text=await r.text();if(new TextEncoder().encode(text).length>2*1024*1024)throw fail(413,'Dữ liệu dự án vượt quá 2 MB. Hãy giảm các phiên bản cũ trước khi nhập.');
 try{return JSON.parse(text);}catch{throw fail(400,'Dữ liệu JSON không hợp lệ.');}
}
function validState(v,owner){
 if(!isObj(v)||v.schema!==1||!isObj(v.project)||!Array.isArray(v.episodes)||!Array.isArray(v.assets)||!Array.isArray(v.references))throw fail(400,'Cấu trúc dự án không hợp lệ.');
 if(v.episodes.length>100||v.assets.length>600||v.references.length>300)throw fail(400,'Dự án vượt giới hạn của bản đầu.');
 for(const field of ['name','audience','language','duration','bible'])if(typeof v.project[field]!=='string')throw fail(400,'Nền tảng dự án thiếu thông tin.');
 const ids=new Set();
 for(const e of v.episodes){
  if(!isObj(e)||typeof e.id!=='string'||ids.has(e.id)||typeof e.title!=='string'||!e.title.trim()||typeof e.brief!=='string'||!Number.isInteger(e.stage)||e.stage<0||e.stage>5||!Array.isArray(e.approved)||!Array.isArray(e.scenes)||!Array.isArray(e.activity)||!Array.isArray(e.versions)||!Array.isArray(e.notes)||!isObj(e.outputs))throw fail(400,'Tập phim không hợp lệ.');
  if(e.targetMinutes!==undefined&&(!Number.isInteger(e.targetMinutes)||e.targetMinutes<1||e.targetMinutes>240))throw fail(400,'Thời lượng mục tiêu phải là số phút nguyên từ 1 đến 240.');
  if(e.autoApprove!==undefined&&typeof e.autoApprove!=='boolean')throw fail(400,'Chế độ tự động duyệt phải là bật hoặc tắt.');
  if(e.referenceSelection!==undefined)try{validateReferenceSelection(e.referenceSelection);}catch(error){throw fail(400,error.message);}
  ids.add(e.id);validateScenes(e.scenes);
 }
 if(v.episodes.length&&!ids.has(v.activeEpisode))throw fail(400,'Tập hiện tại không tồn tại.');
 for(const a of v.assets){
  if(!isObj(a)||typeof a.id!=='string'||!/^[a-f0-9-]{36}$/.test(a.id)||a.key!=='users/'+encodeURIComponent(owner)+'/'+a.id||a.url!=='/api/files/'+a.id||typeof a.name!=='string'||typeof a.mime!=='string'||!mimeTypes.has(a.mime)||!Number.isFinite(a.size)||a.size<1||a.size>MAX_FILE||!['context','character','prop','knowledge','reference','storyboard'].includes(a.category)||typeof a.description!=='string'||typeof a.tags!=='string'||(a.episodeId&&!ids.has(a.episodeId)))throw fail(400,'Tài nguyên không hợp lệ hoặc thuộc tài khoản khác.');
 }
 const assetsById=new Map(v.assets.map(a=>[a.id,a]));
 if(assetsById.size!==v.assets.length)throw fail(400,'ID tài nguyên bị trùng.');
 const linked=(id,type,episodeId)=>{const a=assetsById.get(id);return a&&a.mime.startsWith(type+'/')&&(!a.episodeId||a.episodeId===episodeId);};
 for(const r of v.references){
  if(!isObj(r)||typeof r.id!=='string'||typeof r.title!=='string'||!r.title.trim()||typeof r.note!=='string'||typeof r.tags!=='string'||typeof r.url!=='string'||(r.url&&!/^https?:\/\//i.test(r.url))||!['technique','reference','production'].includes(r.kind)||(r.episodeId&&!ids.has(r.episodeId)))throw fail(400,'Kiến thức tham khảo không hợp lệ.');
  if(r.imageIds!==undefined&&(!Array.isArray(r.imageIds)||r.imageIds.length>60||r.imageIds.some(id=>!linked(id,'image',r.episodeId))))throw fail(400,'Ảnh kiến thức không tồn tại hoặc sai phạm vi.');
  if(r.videoId&&!linked(r.videoId,'video',r.episodeId))throw fail(400,'Video mẫu không tồn tại hoặc sai phạm vi.');
  if(r.shots!==undefined){
   if(!Array.isArray(r.shots)||r.shots.length>200)throw fail(400,'Mỗi video mẫu tối đa 200 shot phân tích.');
   const shotIds=new Set();for(const s of r.shots){
    if(!isObj(s)||typeof s.id!=='string'||! /^[a-zA-Z0-9_-]{1,80}$/.test(s.id)||shotIds.has(s.id)||['title','timecode','size','lens','move','note','imageId'].some(k=>typeof s[k]!=='string'||s[k].length>4000)||(s.imageId&&!linked(s.imageId,'image',r.episodeId)))throw fail(400,'Shot reference hoặc ảnh góc quay không hợp lệ.');
    shotIds.add(s.id);
   }
  }
 }
 for(const e of v.episodes)if(e.storyboards!==undefined){
  if(!isObj(e.storyboards))throw fail(400,'Storyboard không hợp lệ.');
  const shotIds=new Set(e.scenes.flatMap(s=>s.shots.map(sh=>sh.id)));
  for(const [id,b] of Object.entries(e.storyboards))if(!shotIds.has(id)||!isObj(b)||!linked(b.assetId,'image',e.id)||!(b.panel===null||Number.isInteger(b.panel)&&b.panel>=0&&b.panel<4)||typeof b.generated!=='boolean')throw fail(400,'Ảnh storyboard phải liên kết đúng shot và tài nguyên.');
 }
 for(const e of v.episodes)if(e.actualPhotos!==undefined){
  if(!isObj(e.actualPhotos))throw fail(400,'Ảnh thực tế không hợp lệ.');
  const shotIds=new Set(e.scenes.flatMap(s=>s.shots.map(sh=>sh.id)));
  for(const [id,photos] of Object.entries(e.actualPhotos)){if(!shotIds.has(id)||!Array.isArray(photos)||photos.length>20)throw fail(400,'Ảnh thực tế cần đúng ID shot, tối đa 20 ảnh/shot.');const seen=new Set();for(const p of photos){if(!isObj(p)||seen.has(p.assetId)||!linked(p.assetId,'image',e.id)||typeof p.note!=='string'||p.note.length>2000)throw fail(400,'Ảnh thực tế hoặc ghi chú không hợp lệ.');seen.add(p.assetId);}}
 }
 validateEpisodeDossiers(v);
}
export function validateScenes(scenes){
 if(!Array.isArray(scenes)||scenes.length>40)throw fail(400,'Phân cảnh không hợp lệ.');
 const sceneIds=new Set(),shotIds=new Set();
 for(const s of scenes){
  if(!isObj(s)||typeof s.id!=='string'||sceneIds.has(s.id)||['title','time','location','emotion','summary','sound','palette','image'].some(k=>typeof s[k]!=='string')||!Array.isArray(s.shots)||s.shots.length>80)throw fail(400,'Phân cảnh thiếu ID, tiêu đề hoặc danh sách shot.');
  sceneIds.add(s.id);
  for(const shot of s.shots){if(!isObj(shot)||typeof shot.id!=='string'||shotIds.has(shot.id)||['size','lens','move','action','sound','light','note'].some(k=>typeof shot[k]!=='string')||!Array.isArray(shot.assetIds)||!Number.isFinite(shot.seconds)||shot.seconds<1||shot.seconds>600)throw fail(400,'Shot cần ID duy nhất, hành động và thời lượng hợp lệ.');shotIds.add(shot.id);}
 }
}
const SAMPLE_CONTENT=[
 {title:'Định hướng tập phim',summary:'Một ngày đầu tiên, một khởi đầu được chăm chút.',content:'Mục tiêu: kể bằng hành động và âm thanh đời sống, hướng tới người xem quốc tế.\n\nMạch cảm xúc: rời xa → khám phá → cùng lao động → thành quả nhỏ → cảm giác thuộc về.\n\nPhạm vi một ngày: dọn phòng chính, sơn thử một mảng tường và lợp thử mái hiên thấp. Cải tạo kết cấu lớn cần lịch riêng.\n\nMốc duyệt: bạn xác nhận hình bối cảnh, nhân vật và công việc có thể thực hiện thật trước khi chốt lịch quay.',missing:['Ảnh hiện trạng và hướng nắng căn nhà','Danh tính, trang phục hai chị em','Thợ kiểm tra mái hiên và vật liệu có sẵn']},
 {title:'Một căn nhà, một khởi đầu',summary:'Từ khoảng trống của căn nhà đến sự ấm áp của một bữa cơm.',content:'Concept: căn nhà thức dậy theo từng cử chỉ nhỏ của hai chị em. Mở đầu bằng âm thanh thung lũng, kết thúc bằng căn nhà lên đèn.\n\nHook 20 giây: sương, bước chân, bàn tay chạm cổng; trì hoãn việc hé lộ toàn bộ căn nhà đến shot thứ tư.\n\nPalette: xanh rêu, gỗ nâu, vải kem; màu ấm tăng dần về bữa tối. Hạn chế đồ nhựa nổi màu trong khung.\n\nMotif: đôi bàn tay và những cánh cửa. Lặp bố cục trước/sau để thành quả được cảm nhận tự nhiên.\n\nKhông cần thoại dẫn chuyện. Để âm thanh thật gắn kết người xem với công việc.',missing:['Trang phục thực tế','Món ăn và nguyên liệu có sẵn','Ảnh cửa, hiên và góc bếp']},
 {title:'Kịch bản 6 phân cảnh',summary:'24 shot chủ đạo · tổng 8 phút · ít thoại.',content:'SC01 — Con đường trở về: đặt không gian và hai nhân vật.\nSC02 — Mở cửa một khởi đầu: ánh sáng tràn vào căn nhà cũ.\nSC03 — Đánh thức căn nhà: lao động song song, chi tiết nhỏ, đối chiếu trước/sau.\nSC04 — Một mái hiên mới: chuẩn bị lá và lợp thử ở độ cao an toàn.\nSC05 — Bữa cơm đầu tiên: âm thanh nấu ăn dẫn nhịp.\nSC06 — Ở đây, mình bắt đầu: bữa tối và căn nhà lên đèn.\n\nCác phân cảnh và shot chi tiết nằm trong tab Kịch bản. Đây là nội dung minh họa; chưa suy luận từ ảnh bối cảnh của bạn.',missing:['Chốt công việc và thời lượng thực tế sau khảo sát']},
 {title:'Shot list & phương án quay',summary:'Tripod làm nền, ánh sáng tự nhiên, âm thanh đồng bộ.',content:'24 shot chủ đạo được liên kết SC01–SC06, đầy đủ cỡ cảnh, tiêu cự, chuyển động, âm thanh và hướng sáng.\n\nThiết bị tối thiểu: máy quay, tripod, ống kính tương đương 24–85 mm, ND, micro định hướng, recorder, tai nghe, tấm hắt trắng.\n\nContinuity: cố định trục di chuyển; chụp ảnh trang phục, vị trí đạo cụ, độ ướt của vật liệu và mức hoàn thiện trước mỗi setup. Khóa WB theo từng bối cảnh sau khi đo thực tế.\n\nLịch quay: ngoại sớm → nội cửa sổ → hiên bóng râm → chi tiết bếp → toàn cảnh blue hour. Bổ sung 30–60 giây room tone mỗi vị trí.\n\nCảnh mái: thợ kiểm tra trước; quay thao tác trên mô hình thấp và hai nhân vật hỗ trợ từ mặt đất.',missing:['Thiết bị ekip sở hữu','Giờ nắng theo vị trí nhà','Lịch mưa và phương án dự phòng']},
 {title:'Production book · bản mẫu',summary:'Hồ sơ quay có kịch bản, storyboard, shot list và checklist.',content:'Bộ hồ sơ được dựng từ dữ liệu của các bước đã duyệt, giữ nguyên ID cảnh và shot.\n\nBao gồm: bìa song ngữ, brief, ghi chú khảo sát, kịch bản theo cảnh, bảng shot, storyboard minh họa, lịch theo khung sáng, checklist thiết bị và đạo cụ.\n\nẢnh minh họa là mood reference, không phải ảnh hiện trường. Hãy liên kết tài nguyên thực tế vào từng shot để thay hình trong hồ sơ.\n\nXuất bản HTML để ekip mở trên điện thoại hoặc in thành PDF, CSV cho trợ lý quay và JSON để lưu toàn bộ dữ liệu.',missing:['Thay mood reference bằng ảnh hiện trường','Chốt call sheet với ngày, người phụ trách và địa điểm liên hệ']}
];
export function sampleOutput(stage){return {...structuredClone(SAMPLE_CONTENT[stage]),sources:[],scenes:stage===2||stage===3?structuredClone(SCENES):[]};}
function fingerprint(state,e){return JSON.stringify({brief:e.brief,targetMinutes:targetMinutes(e),stage:e.stage,outputs:e.outputs,scenes:e.scenes,bible:state.project.bible,assets:state.assets,references:state.references});}
export function chooseResources(state,e){
 const words=new Set((e.brief+' '+e.title).toLowerCase().split(/\s+/).filter(x=>x.length>2));
 const score=x=>Array.from(words).filter(w=>JSON.stringify(x).toLowerCase().includes(w)).length;
 const references=state.references.filter(a=>!a.episodeId||a.episodeId===e.id).map(r=>filterReferenceRecord(r,e.referenceSelection)).filter(Boolean).sort((a,b)=>score(b)-score(a)).slice(0,10);
 const eligible=state.assets.filter(a=>!a.episodeId||a.episodeId===e.id).sort((a,b)=>score(b)-score(a));
 const explicit=new Set([...references.flatMap(r=>[...(r.imageIds||[]),r.videoId,...(r.shots||[]).map(s=>s.imageId)]),...e.scenes.flatMap(s=>s.shots.flatMap(sh=>sh.assetIds||[])),...Object.values(e.storyboards||{}).map(b=>b.assetId),...Object.values(e.actualPhotos||{}).flatMap(photos=>photos.map(p=>p.assetId)),...Object.values(e.workingSource?.fileIds||{})].filter(Boolean));
 const assets=eligible.filter(a=>explicit.has(a.id)||eligible.indexOf(a)<16);
 return {assets,references,selection:{availableAssets:eligible.length,includedAssets:assets.length,availableReferences:state.references.filter(r=>!r.episodeId||r.episodeId===e.id).length,includedReferences:references.length,note:'Gói gồm tư liệu liên quan, toàn bộ ảnh/video gắn với reference được chọn và ảnh gắn shot. Đọc tệp thật qua studio_read_resource; ghi chú và URL không chứng minh đã xem video. Có thể đọc studio_get_project để kiểm tra nguồn còn thiếu.'}};
}
const STR={type:'string'};
const shotSchema={type:'object',properties:{id:STR,size:STR,lens:STR,move:STR,action:STR,seconds:{type:'integer'},sound:STR,light:STR,assetIds:{type:'array',items:STR},note:STR},required:['id','size','lens','move','action','seconds','sound','light','assetIds','note'],additionalProperties:false};
const sceneSchema={type:'object',properties:{id:STR,title:STR,time:STR,location:STR,emotion:STR,summary:STR,sound:STR,palette:STR,image:STR,shots:{type:'array',items:shotSchema}},required:['id','title','time','location','emotion','summary','sound','palette','image','shots'],additionalProperties:false};
export const outputSchema={type:'object',properties:{title:STR,summary:STR,content:STR,missing:{type:'array',items:STR},sources:{type:'array',items:STR},scenes:{type:'array',items:sceneSchema},production:GENERIC_PRODUCTION_SCHEMA},required:['title','summary','content','missing','sources','scenes'],additionalProperties:false};

export async function handleApi(request,env){
 try{
 const url=new URL(request.url),path=url.pathname,owner=userOf(request);
 if(path==='/api/config'&&request.method==='GET')return json({executionMode:'codex',externalModelCalls:false,bridgeReady:!!env.DB&&!!env.BUCKET,storageReady:!!env.DB&&!!env.BUCKET,signedIn:!!owner,displayName:clean(request.headers.get('oai-authenticated-user-full-name')||request.headers.get('oai-authenticated-user-email')||'Nhà sáng tạo'),storageProvider:env.FILE_STORAGE_DRIVER||'r2',maxUploadBytes:env.FILE_MAX_BYTES||MAX_FILE});
 if(!owner)throw fail(401,'Vui lòng đăng nhập để mở dự án.');
 if(!env.DB||!env.BUCKET)throw fail(503,'Kho lưu trữ của studio chưa sẵn sàng.');
 if(path.startsWith('/api/reference-profiles'))return await referenceProfileApi(request,env,owner);
 if(path==='/api/reference-jobs'&&request.method==='GET')return json({jobs:await listReferenceJobs(env,owner)});
 if(path==='/api/production'&&request.method==='GET')return json(WORKFLOW);
 if(path==='/api/episodes/resume'&&request.method==='POST')return json(await resumeEpisodeDossier(env,owner,await body(request)));
 if(path==='/api/episodes/start'&&request.method==='POST')return json(await startEpisode(env,owner,await body(request)));
 if(path.startsWith('/api/tasks'))return await handleTasks(request,env,owner);
 if(path==='/api/workflow'&&request.method==='POST'){const b=await body(request);return json(await setWorkflow(env,owner,b.episodeId,b.autoApprove));}
 if(path==='/api/state'){
  if(request.method==='GET')return json(await readState(env,owner));
  if(request.method==='PUT'){
   const b=await body(request);validState(b.state,owner);await validateProfileBindings(env,owner,b.state);if(!Number.isInteger(b.revision)||b.revision<0)throw fail(400,'Thiếu phiên bản dữ liệu.');
   const revision=await saveState(env,owner,b.state,b.revision);await reconcileReviews(env,owner,b.state);return json({revision,updatedAt:b.state.updatedAt});
  }
 }
 if(path==='/api/files'&&request.method==='POST'){
  const maxFile=env.FILE_MAX_BYTES||MAX_FILE,limitMiB=Math.floor(maxFile/1024/1024);
  if(Number(request.headers.get('content-length')||0)>maxFile+8192)throw fail(413,'Mỗi tệp tối đa '+limitMiB+' MiB.');
  const data=await request.formData(),file=data.get('file');
  if(!file||typeof file==='string')throw fail(400,'Chưa có tệp tải lên.');
  if(file.size>maxFile||!file.size)throw fail(413,'Tệp phải lớn hơn 0 và không quá '+limitMiB+' MiB.');
  let mime=file.type;if(!mime&&/\.(md|txt)$/i.test(file.name))mime=file.name.endsWith('.md')?'text/markdown':'text/plain';
  if(!mimeTypes.has(mime))throw fail(415,'Hỗ trợ ảnh, PDF, TXT, MD, CSV, JSON, ZIP và video MP4/MOV.');
  const id=crypto.randomUUID(),key='users/'+encodeURIComponent(owner)+'/'+id;
  await env.BUCKET.put(key,file.stream(),{httpMetadata:{contentType:mime},customMetadata:{owner,name:file.name.slice(0,240)}});
  return json({id,key,name:file.name.slice(0,240),mime,size:file.size,url:'/api/files/'+id},201);
 }
 if(path.startsWith('/api/files/')){
  const id=path.slice('/api/files/'.length);if(!/^[a-f0-9-]{36}$/.test(id))throw fail(400,'ID tệp không hợp lệ.');
  const key='users/'+encodeURIComponent(owner)+'/'+id;
  if(request.method==='DELETE'){await assertReferenceFileUnused(env,owner,id);await env.BUCKET.delete(key);return json({ok:true});}
  if(request.method==='GET'){
   const object=await env.BUCKET.get(key,request.headers.has('range')?{range:request.headers}:undefined);if(!object){if(env.FILE_STORAGE_DRIVER==='kv'){const {state}=await readState(env,owner);const expected=state.assets.some(a=>a.id===id)||state.episodes.some(e=>Object.values(e.outputs).some(o=>(o.artifacts||[]).some(a=>a.id===id)));if(expected)throw Object.assign(fail(503,'Tệp đang đồng bộ trong Workers KV. Hãy chờ rồi thử lại.'),{retryAfter:'5'});}throw fail(404,'Không tìm thấy tệp.');}
   const headers=new Headers({'content-type':object.httpMetadata?.contentType||'application/octet-stream','cache-control':'private, max-age=60','x-content-type-options':'nosniff'});
   headers.set('accept-ranges','bytes');
   const partial=request.headers.has('range')&&object.range&&Number.isFinite(object.range.offset)&&Number.isFinite(object.range.length)&&Number.isFinite(object.size);
   if(partial){headers.set('content-range',`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);headers.set('content-length',String(object.range.length));}
   else if(Number.isFinite(object.size))headers.set('content-length',String(object.size));
   headers.set('content-disposition',(['text/html','application/zip','text/csv','application/json'].includes(object.httpMetadata?.contentType)?'attachment':'inline')+'; filename*=UTF-8\'\''+encodeURIComponent(object.customMetadata?.name||'resource'));
   if(object.httpMetadata?.contentType==='text/html')headers.set('content-security-policy',"sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
   return new Response(object.body,{headers,status:partial?206:200});
  }
 }
 if(path==='/api/run'&&request.method==='POST'){
  const b=await body(request),loaded=await readState(env,owner),state=loaded.state,e=state.episodes.find(x=>x.id===b.episodeId);
  if(!e)throw fail(404,'Không tìm thấy tập phim.');
  if(e.stage>=5)throw fail(409,'Tập phim đã hoàn tất. Hãy yêu cầu sửa một bước để chạy lại.');
  const stage=e.stage;if(stage>0&&!e.approved.includes(stage-1))throw fail(409,'Bạn cần duyệt bước trước để tiếp tục.');
  if(e.outputs[stage])throw fail(409,'Bước này đang chờ duyệt. Bạn có thể duyệt hoặc yêu cầu chỉnh sửa.');
  if(!e.brief.trim())throw fail(400,'Hãy điền brief trước khi bắt đầu.');
  if(b.mode!=='sample')throw fail(400,'Tác vụ thực được giao cho Codex qua /api/tasks. Xưởng không gọi API mô hình.');
  if(b.mode==='sample'&&!e.sample)throw fail(400,'Quy trình mẫu chỉ áp dụng cho tập minh họa.');
  const token=crypto.randomUUID(),now=Date.now();
  const lock=await env.DB.prepare('INSERT INTO run_locks (owner,episode_id,token,expires_at) VALUES (?,?,?,?) ON CONFLICT(owner,episode_id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at WHERE run_locks.expires_at < ? RETURNING token').bind(owner,e.id,token,now+90000,now).first();
  if(!lock||lock.token!==token)throw fail(409,'Một agent đang làm việc cho tập này. Vui lòng chờ.');
  try{
   const basis=fingerprint(state,e),output=sampleOutput(stage);
   const current=await readState(env,owner),ep=current.state.episodes.find(x=>x.id===e.id);
   if(!ep||fingerprint(current.state,ep)!==basis)throw fail(409,'Brief hoặc tư liệu đã thay đổi trong khi agent chạy. Kết quả chưa được áp dụng; hãy chạy lại với dữ liệu mới.');
   const at=new Date().toISOString();
   ep.outputs[stage]={...output,agent:AGENTS[stage].id,at,mode:b.mode,version:ep.versions.length+1};
   if((stage===2||stage===3)&&output.scenes.length){ep.scenes=output.scenes;ep.stale=false;}
   ep.activity.push({id:crypto.randomUUID(),agent:AGENTS[stage].id,text:output.summary,at,kind:b.mode});
   if(ep.autoApprove===true)approveEpisode(ep,{automatic:true,at});
   const revision=await saveState(env,owner,current.state,current.revision);
   return json({state:current.state,revision,output:ep.outputs[stage],...await continueWorkflow(env,owner,ep.id)});
  }finally{await env.DB.prepare('DELETE FROM run_locks WHERE owner = ? AND episode_id = ? AND token = ?').bind(owner,e.id,token).run();}
 }
 throw fail(404,'Không tìm thấy chức năng này.');
 }catch(error){const response=json({error:error.status?error.message:'Studio chưa thể xử lý yêu cầu. Hãy thử lại sau.'},error.status||500);if(error.contentRange)response.headers.set('content-range',error.contentRange);if(error.retryAfter)response.headers.set('retry-after',error.retryAfter);return response;}
}

import {readState,handleApi,fail,mimeTypes} from './api.js';

export const LIBRARY_UPLOAD_PROTOCOL='valley-library-upload/1';
export const LIBRARY_BATCH_PROTOCOL='valley-library-batch/1';
const LIBRARY_UPLOAD_TTL=15*60*1000;
const libraryHex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
async function libraryHash(value){return libraryHex(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value));}
const libraryReply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const libraryMaximum=env=>Math.min(env.FILE_MAX_BYTES||20*1024*1024,20*1024*1024);

function libraryOrigin(env){
 let url;try{url=new URL(env.PUBLIC_ORIGIN);}catch{throw fail(503,'Nhập tệp qua MCP cần cấu hình Cloudflare PUBLIC_ORIGIN.');}
 if(url.protocol!=='https:'||url.origin!==env.PUBLIC_ORIGIN)throw fail(503,'PUBLIC_ORIGIN không hợp lệ.');
 return url.origin;
}
function libraryMetadata(args,owner,maximum){
 const name=args.filename,mime=args.mime,episodeId=args.episode_id??null;
 if(typeof name!=='string'||!name.trim()||name.length>200||/[\\/\u0000-\u001f]/.test(name))throw fail(400,'Tên tệp thư viện không hợp lệ.');
 if(!mimeTypes.has(mime))throw fail(415,'Định dạng tệp thư viện không được hỗ trợ.');
 if(!Number.isSafeInteger(args.size)||args.size<1||args.size>maximum)throw fail(413,'Nhập thư viện hỗ trợ tối đa '+Math.floor(maximum/1024/1024)+' MiB mỗi tệp.');
 if(typeof args.sha256!=='string'||!/^[a-f0-9]{64}$/.test(args.sha256))throw fail(400,'Cần SHA-256 của đúng tệp gốc.');
 if(episodeId!==null&&(typeof episodeId!=='string'||!episodeId||episodeId.length>80))throw fail(400,'Phạm vi tập phim không hợp lệ.');
 const category=args.category||'knowledge',description=args.description??'',tags=args.tags??'';
 if(!['context','character','prop','knowledge','reference','storyboard'].includes(category)||typeof description!=='string'||description.length>6000||typeof tags!=='string'||tags.length>300)throw fail(400,'Phân loại hoặc mô tả tài nguyên không hợp lệ.');
 const id=crypto.randomUUID();
 return {id,key:'users/'+encodeURIComponent(owner)+'/'+id,name:name.trim(),mime,size:args.size,url:'/api/files/'+id,sha256:args.sha256,category,episodeId,description,tags,createdAt:new Date().toISOString()};
}

// A library import is an explicit owner file action, independent of creative tasks.
// It does not claim, reopen, approve or alter an episode's production output.
export async function prepareLibraryUpload(env,owner,args){
 const origin=libraryOrigin(env),user=env.MCP_IDENTITY;
 if(!user||user.id!==owner||!/^github:\d+$/.test(user.id)||typeof user.login!=='string')throw fail(403,'Cần kết nối MCP Cloudflare bằng tài khoản chủ Xưởng để nhập tệp.');
 const asset=libraryMetadata(args,owner,libraryMaximum(env)),loaded=await readState(env,owner);
 if(asset.episodeId&&!loaded.state.episodes.some(e=>e.id===asset.episodeId))throw fail(404,'Không tìm thấy tập phim để gắn tệp.');
 const duplicate=loaded.state.assets.find(a=>a.name===asset.name&&a.mime===asset.mime&&a.size===asset.size&&a.sha256===asset.sha256&&a.episodeId===asset.episodeId&&a.category===asset.category);
 if(duplicate){
  if(!await env.BUCKET.get(duplicate.key))throw fail(503,'Tệp đã nhập đang đồng bộ trong kho. Chờ rồi thử lại.');
  return {uploadRequired:false,asset:duplicate,revision:loaded.revision};
 }
 if(loaded.state.assets.length>=600)throw fail(413,'Thư viện đã đạt giới hạn 600 tài nguyên.');
 const token=libraryHex(crypto.getRandomValues(new Uint8Array(32))),at=new Date().toISOString(),expires=Date.now()+LIBRARY_UPLOAD_TTL;
 await env.DB.prepare('DELETE FROM library_uploads WHERE expires_at < ? AND status != ?').bind(Date.now()-86400000,'uploading').run();
 await env.DB.prepare('INSERT INTO library_uploads (id,owner,identity,token_hash,metadata,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(asset.id,owner,JSON.stringify({id:user.id,login:user.login}),await libraryHash(token),JSON.stringify(asset),'pending',expires,at,at).run();
 return {uploadRequired:true,uploadUrl:origin+'/api/library-uploads/'+asset.id,uploadToken:token,expiresAt:new Date(expires).toISOString(),maxUploadBytes:libraryMaximum(env),asset,method:'PUT',note:'Gửi byte gốc qua HTTPS với Authorization: Bearer uploadToken và Content-Type đúng MIME. Token chỉ dành cho tệp này trong 15 phút; không ghi vào tài liệu/Git. Sau PUT thành công có thể GET cùng URL/token để kiểm tra byte. Tải cho người dùng qua asset.url trong Xưởng sau đăng nhập.'};
}

// Authorize many independent files with one MCP round trip. Bytes still use
// individual immutable uploads, each scoped to its own size, MIME and digest.
export async function prepareLibraryBatch(env,owner,args){
 const origin=libraryOrigin(env),user=env.MCP_IDENTITY;
 if(!env.MCP_OAUTH||!user||user.id!==owner||!/^github:\d+$/.test(user.id)||typeof user.login!=='string')throw fail(403,'Cần MCP Cloudflare của chủ Xưởng để nhập theo lô.');
 if(!Array.isArray(args.files)||!args.files.length||args.files.length>100)throw fail(400,'Mỗi lô cần 1–100 tệp.');
 const loaded=await readState(env,owner),at=new Date().toISOString(),expires=Date.now()+LIBRARY_UPLOAD_TTL,seen=new Set(),uploads=[],statements=[];
 for(const file of args.files){
  const asset=libraryMetadata(file,owner,libraryMaximum(env)),key=JSON.stringify([asset.name,asset.mime,asset.sha256,asset.episodeId,asset.category]);
  if(seen.has(key))throw fail(400,'Lô có metadata tệp trùng.');seen.add(key);
  if(asset.episodeId&&!loaded.state.episodes.some(e=>e.id===asset.episodeId))throw fail(404,'Không tìm thấy tập phim.');
  const duplicate=loaded.state.assets.find(a=>a.name===asset.name&&a.mime===asset.mime&&a.size===asset.size&&a.sha256===asset.sha256&&a.episodeId===asset.episodeId&&a.category===asset.category);
  if(duplicate){uploads.push({uploadRequired:false,asset:duplicate});continue;}
  const token=libraryHex(crypto.getRandomValues(new Uint8Array(32)));
  statements.push(env.DB.prepare('INSERT INTO library_uploads (id,owner,identity,token_hash,metadata,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(asset.id,owner,JSON.stringify({id:user.id,login:user.login}),await libraryHash(token),JSON.stringify(asset),'pending',expires,at,at));
  uploads.push({uploadRequired:true,uploadUrl:origin+'/api/library-uploads/'+asset.id,uploadToken:token,expiresAt:new Date(expires).toISOString(),asset,method:'PUT'});
 }
 if(loaded.state.assets.length+statements.length>600)throw fail(413,'Lô vượt giới hạn 600 tài nguyên của thư viện.');
 if(statements.length)await env.DB.batch(statements);
 return {protocol:LIBRARY_BATCH_PROTOCOL,uploads,revision:loaded.revision,note:'Quyền riêng cho từng tệp, hạn 15 phút. PUT byte thật với token tương ứng; kiểm tra receipt. Metadata chưa phải tệp đã tải hoặc ảnh đã đọc.'};
}

// Compatibility for clients caching the original nine-tool catalog. The reserved
// library: namespace selects an owner import, NOT a task; it must have no claim.
export async function prepareLegacyLibraryUpload(env,owner,args){
 const scope=/^library:([a-zA-Z0-9_-]{1,80})$/.exec(args.task_id||'');
 if(!scope||args.claim_token!==''||args.encoding!=='utf8'||args.mime!=='application/json'||args.storyboard_shot_ids!==undefined)throw fail(400,'Nhập thư viện cần namespace library:<episodeId|project>, claim_token rỗng và phong bì JSON. Không dùng claim của đầu việc.');
 let value;try{value=JSON.parse(args.content);}catch{throw fail(400,'Phong bì nhập thư viện không phải JSON.');}
 if(!value||value.protocol!==LIBRARY_UPLOAD_PROTOCOL)throw fail(400,'Sai phiên bản giao thức nhập thư viện.');
 if(value.episode_id!==undefined)throw fail(400,'Phạm vi thư viện lấy từ namespace, không đặt trong phong bì.');
 return prepareLibraryUpload(env,owner,{...value,filename:args.filename,episode_id:scope[1]==='project'?null:scope[1]});
}

async function libraryReadBytes(request,expected){
 const declared=request.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)!==expected))throw fail(400,'Dung lượng gửi lên không khớp tệp được cấp quyền.');
 if(!request.body)throw fail(400,'Thiếu nội dung tệp.');
 const reader=request.body.getReader(),chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>expected){await reader.cancel();throw fail(413,'Nội dung vượt dung lượng tệp đã cấp quyền.');}chunks.push(value);}}finally{reader.releaseLock();}
 if(length!==expected)throw fail(400,'Tệp gửi lên chưa đủ byte.');
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
async function libraryCommit(env,row,asset){
 const at=new Date().toISOString(),metadata=JSON.stringify(asset),margin=new TextEncoder().encode(metadata).byteLength+64;
 const active="EXISTS (SELECT 1 FROM library_uploads WHERE id = ? AND owner = ? AND token_hash = ? AND status = 'uploading')";
 // File registration is an atomic JSON append in D1. Avoid parsing and
 // serializing the entire project repeatedly on a Workers Free request.
 if(!await env.DB.prepare('SELECT revision FROM studio_state WHERE owner = ?').bind(row.owner).first()){
  const initial=await readState(env,row.owner);
  await env.DB.prepare(`INSERT OR IGNORE INTO studio_state (owner,state,revision,updated_at) SELECT ?,?,0,? WHERE ${active}`).bind(row.owner,JSON.stringify(initial.state),at,row.id,row.owner,row.token_hash).run();
 }
 const append=env.DB.prepare(`UPDATE studio_state SET state = json_set(state, '$.assets[#]', json(?), '$.updatedAt', ?), revision = revision + 1, updated_at = ? WHERE owner = ? AND ${active} AND json_array_length(state,'$.assets') < 600 AND length(CAST(state AS BLOB)) + ? <= 2097152 AND (? IS NULL OR EXISTS (SELECT 1 FROM json_each(state,'$.episodes') e WHERE json_extract(e.value,'$.id') = ?)) AND NOT EXISTS (SELECT 1 FROM json_each(state,'$.assets') a WHERE json_extract(a.value,'$.id') = ?)`)
  .bind(metadata,at,at,row.owner,row.id,row.owner,row.token_hash,margin,asset.episodeId,asset.episodeId,asset.id);
 const complete=env.DB.prepare("UPDATE library_uploads SET status = 'complete', updated_at = ? WHERE id = ? AND owner = ? AND token_hash = ? AND status = 'uploading' AND EXISTS (SELECT 1 FROM studio_state s, json_each(s.state,'$.assets') a WHERE s.owner = ? AND json_extract(a.value,'$.id') = ? AND json_extract(a.value,'$.sha256') = ?)")
  .bind(at,row.id,row.owner,row.token_hash,row.owner,asset.id,asset.sha256);
 const result=await env.DB.batch([append,complete]);
 if(result[1].meta.changes){const current=await env.DB.prepare('SELECT revision FROM studio_state WHERE owner = ?').bind(row.owner).first();return {asset,revision:current.revision};}
 const current=await env.DB.prepare("SELECT json_array_length(state,'$.assets') AS count, length(CAST(state AS BLOB)) AS bytes, EXISTS (SELECT 1 FROM json_each(state,'$.episodes') e WHERE json_extract(e.value,'$.id') = ?) AS has_episode FROM studio_state WHERE owner = ?").bind(asset.episodeId,row.owner).first();
 if(current?.count>=600||current?.bytes+margin>2*1024*1024)throw fail(413,'Thư viện vượt giới hạn tài nguyên hoặc metadata dự án.');
 if(asset.episodeId&&!current?.has_episode)throw fail(409,'Tập phim đã bị gỡ trong lúc nhập tệp.');
 throw fail(409,'Quyền tải hoặc dữ liệu vừa thay đổi. Thử lại tệp, không ghi đè dữ liệu.');
}

export async function receiveLibraryUpload(request,env,isAllowedIdentity){
 try{
  if(!['PUT','GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'PUT, GET, HEAD'}});
  const origin=libraryOrigin(env),url=new URL(request.url),id=url.pathname.slice('/api/library-uploads/'.length);
  if(url.origin!==origin||request.headers.has('origin')&&request.headers.get('origin')!==origin)throw fail(403,'Nguồn yêu cầu không hợp lệ.');
  const token=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization')||'')?.[1];
  if(!/^[a-f0-9-]{36}$/.test(id)||!token)throw fail(401,'Cần quyền tải tệp do MCP cấp.');
  const row=await env.DB.prepare('SELECT * FROM library_uploads WHERE id = ? AND token_hash = ?').bind(id,await libraryHash(token)).first();
  if(!row||row.expires_at<Date.now())throw fail(401,'Quyền tải tệp không hợp lệ hoặc đã hết hạn.');
  const identity=JSON.parse(row.identity);if(!isAllowedIdentity(identity)||identity.id!==row.owner)throw fail(403,'Tài khoản không còn được cấp quyền.');
  const asset=JSON.parse(row.metadata);
  if(request.method!=='PUT'){
   if(row.status!=='complete')throw fail(409,'Tệp chưa được nhập hoàn tất.');
   const current=await readState(env,row.owner);if(!current.state.assets.some(a=>a.id===asset.id))throw fail(404,'Tài nguyên đã được gỡ khỏi thư viện.');
   const headers=new Headers();headers.set('oai-authenticated-user-id',row.owner);if(request.headers.has('range'))headers.set('range',request.headers.get('range'));
   const response=await handleApi(new Request(origin+asset.url,{headers}),env);
   if(request.method==='HEAD'){await response.body?.cancel();return new Response(null,{status:response.status,headers:response.headers});}
   return response;
  }
  if(row.status==='complete'){const fresh=await readState(env,row.owner);const stored=fresh.state.assets.find(a=>a.id===asset.id);if(!stored)throw fail(409,'Tài nguyên đã được chủ Xưởng gỡ khỏi thư viện.');await request.body?.cancel();return libraryReply({asset:stored,revision:fresh.revision,alreadyUploaded:true});}
  if(asset.size>libraryMaximum(env))throw fail(413,'Tệp vượt giới hạn kho lưu trữ hiện tại.');
  if(request.headers.get('content-type')?.split(';')[0]!==asset.mime||request.headers.has('content-encoding'))throw fail(415,'MIME phải khớp quyền đã cấp; gửi byte gốc, không nén lại.');
  const claimed=await env.DB.prepare("UPDATE library_uploads SET status = 'uploading', updated_at = ? WHERE id = ? AND token_hash = ? AND status = 'pending' AND expires_at >= ?").bind(new Date().toISOString(),id,row.token_hash,Date.now()).run();
  if(!claimed.meta.changes)throw fail(409,'Tệp đang được tải ở yêu cầu khác. Chờ rồi thử lại.');
  let objectWritten=false;
  try{
   const bytes=await libraryReadBytes(request,asset.size);
   if(await libraryHash(bytes)!==asset.sha256)throw fail(400,'SHA-256 không khớp tệp được cấp quyền.');
   await env.BUCKET.put(asset.key,bytes,{httpMetadata:{contentType:asset.mime},customMetadata:{owner:row.owner,name:asset.name}});objectWritten=true;
   return libraryReply(await libraryCommit(env,row,asset),201);
  }catch(error){
   // A failed transfer cannot leave a half-registered resource. If the D1
   // transaction committed despite a lost acknowledgement, preserve its file.
   const fresh=await env.DB.prepare('SELECT status FROM library_uploads WHERE id = ?').bind(id).first();
   if(fresh?.status!=='complete'){
    if(objectWritten)await env.BUCKET.delete(asset.key);
    await env.DB.prepare("UPDATE library_uploads SET status = 'pending', updated_at = ? WHERE id = ? AND token_hash = ? AND status = 'uploading'").bind(new Date().toISOString(),id,row.token_hash).run();
   }
   throw error;
  }
 }catch(error){return libraryReply({error:error.status?error.message:'Không thể nhập tệp vào thư viện. Thử lại sau.'},error.status||500);}
}

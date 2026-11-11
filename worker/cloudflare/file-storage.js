export const KV_MAX_UPLOAD_BYTES=20*1024*1024;
const textEncoder=new TextEncoder();
const storageError=(status,message)=>Object.assign(new Error(message),{status});

async function kvOperation(operation){
 try{return await operation();}
 catch(error){if(error.status)throw error;const quota=/quota|rate.?limit|daily.?limit|storage.?limit|\b429\b/i.test(String(error.message));throw storageError(quota?429:503,quota?'Workers KV đã chạm hạn mức. Kiểm tra usage trong Cloudflare hoặc thử lại khi hạn mức được đặt lại.':'Kho tệp Workers KV chưa sẵn sàng. Hãy thử lại sau.');}
}
async function fileBytes(value){
 if(value?.getReader){const reader=value.getReader(),chunks=[];let size=0;try{for(;;){const part=await reader.read();if(part.done)break;const bytes=new Uint8Array(part.value);size+=bytes.byteLength;if(size>KV_MAX_UPLOAD_BYTES){await reader.cancel();throw storageError(413,'Bản Workers KV hỗ trợ tối đa 20 MiB mỗi tệp.');}chunks.push(bytes);}}finally{reader.releaseLock();}const out=new Uint8Array(size);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;}
 const bytes=typeof value==='string'?textEncoder.encode(value):value instanceof ArrayBuffer?new Uint8Array(value):ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):new Uint8Array(await value.arrayBuffer());
 if(bytes.byteLength>KV_MAX_UPLOAD_BYTES)throw storageError(413,'Bản Workers KV hỗ trợ tối đa 20 MiB mỗi tệp.');return bytes;
}
function metadataFor(options,size){
 const metadata={size,httpMetadata:{contentType:options.httpMetadata?.contentType||'application/octet-stream'},customMetadata:{name:String(options.customMetadata?.name||'resource')}};
 // KV metadata is limited to 1024 UTF-8 bytes. The full display name stays in D1.
 while(textEncoder.encode(JSON.stringify(metadata)).byteLength>1024&&metadata.customMetadata.name.length)metadata.customMetadata.name=Array.from(metadata.customMetadata.name).slice(0,-1).join('');
 if(textEncoder.encode(JSON.stringify(metadata)).byteLength>1024)throw storageError(400,'Metadata tệp quá dài.');return metadata;
}
function byteRange(value,size){
 if(!value)return null;
 const match=/^bytes=(\d*)-(\d*)$/.exec(value);
 const invalid=()=>{throw Object.assign(storageError(416,'Khoảng byte không hợp lệ.'),{contentRange:'bytes */'+size});};
 if(!match||!size||!match[1]&&!match[2])return invalid();
 let start,end;if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return invalid();start=Math.max(0,size-suffix);end=size-1;}else{start=Number(match[1]);end=match[2]?Number(match[2]):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return invalid();end=Math.min(end,size-1);}return {offset:start,length:end-start+1};
}
export function kvFileStore(namespace){
 return {
  async put(key,value,options={}){const bytes=await fileBytes(value);await kvOperation(()=>namespace.put(key,bytes,{metadata:metadataFor(options,bytes.byteLength)}));},
  async get(key,options={}){
   const result=await kvOperation(()=>namespace.getWithMetadata(key,{type:'arrayBuffer',cacheTtl:30}));if(result.value===null)return null;
   const original=result.value instanceof ArrayBuffer?result.value:new Uint8Array(result.value).buffer;
   const rangeValue=options?.range?.get?.('range');const range=byteRange(rangeValue,original.byteLength);
   const selected=range?original.slice(range.offset,range.offset+range.length):original;
   return {body:selected,size:original.byteLength,range:range||undefined,httpMetadata:result.metadata?.httpMetadata||{contentType:'application/octet-stream'},customMetadata:result.metadata?.customMetadata||{},arrayBuffer:async()=>selected.slice(0),text:async()=>new TextDecoder().decode(selected)};
  },
  async delete(key){await kvOperation(()=>namespace.delete(key));}
 };
}
export function fileStorageEnv(env){
 if(env.FILES_KV)return {...env,BUCKET:kvFileStore(env.FILES_KV),FILE_STORAGE_DRIVER:'kv',FILE_MAX_BYTES:KV_MAX_UPLOAD_BYTES};
 return {...env,FILE_STORAGE_DRIVER:env.BUCKET?'r2':null,FILE_MAX_BYTES:30*1024*1024};
}

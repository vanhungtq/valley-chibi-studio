import {Unzip,UnzipInflate} from './vendor/fflate.js';
import {parseReferenceCsv,guessReferenceColumns,referenceKey,referenceTags} from './reference-catalog.js';

const refCrcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const refCrc=bytes=>{let crc=0xffffffff;for(const b of bytes)crc=refCrcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
const refZipLimit=100*1024*1024,refExpandedLimit=200*1024*1024;
const refPath=value=>{const path=String(value).replaceAll('\\','/').replace(/^\.\//,'');if(path.startsWith('/')||/^[a-z]:/i.test(path)||path.split('/').includes('..')||path.includes('\0'))throw new Error('ZIP chứa đường dẫn không hợp lệ.');return path.normalize('NFC');};
const refImage=path=>/\.(jpe?g|png|webp|avif)$/i.test(path);
export async function readReferenceZip(file){
 if(file.size>refZipLimit)throw new Error('ZIP tối đa 100 MiB.');
 const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))throw new Error('ZIP không hợp lệ hoặc là ZIP nhiều phần.');
 const count=view.getUint16(end+10,true);let pos=view.getUint32(end+16,true),total=0;
 if(count>1000||count===65535)throw new Error('ZIP tối đa 1.000 tệp, không hỗ trợ ZIP64.');
 const names=new Map();
 for(let i=0;i<count;i++){
  if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)throw new Error('Danh mục ZIP bị hỏng.');
  const size=view.getUint32(pos+24,true),len=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),flags=view.getUint16(pos+8,true);
  if(flags&1||size===0xffffffff||pos+46+len+extra+comment>bytes.length)throw new Error('ZIP mã hóa hoặc ZIP64 không được hỗ trợ.');
  const name=refPath(new TextDecoder().decode(bytes.subarray(pos+46,pos+46+len)));
  if((view.getUint32(pos+38,true)>>>16&0xf000)===0xa000)throw new Error('ZIP chứa liên kết tệp không được hỗ trợ.');
  if(!name.startsWith('__MACOSX/')&&!name.endsWith('/')&&(refImage(name)||/\.csv$/i.test(name))){if(names.has(name.toLowerCase()))throw new Error('Tên tệp ZIP bị trùng: '+name);if(![0,8].includes(view.getUint16(pos+10,true)))throw new Error('Chỉ hỗ trợ ZIP Store/Deflate.');names.set(name.toLowerCase(),{name,size,crc:view.getUint32(pos+16,true)});total+=size;if(size>20*1024*1024||total>refExpandedLimit)throw new Error('Ảnh tối đa 20 MiB, tổng ảnh/CSV giải nén tối đa 200 MiB.');}
  pos+=46+len+extra+comment;
 }
 if([...names.values()].filter(x=>refImage(x.name)).length>600)throw new Error('ZIP có quá nhiều ảnh.');
 const extracted=new Map();let actualTotal=0;
 const unzip=new Unzip(file=>{const path=refPath(file.name),info=names.get(path.toLowerCase());if(!info)return;let length=0;const chunks=[];
  file.ondata=(error,data,final)=>{if(error)throw error;length+=data.length;actualTotal+=data.length;if(length>info.size||actualTotal>refExpandedLimit){file.terminate();throw new Error('ZIP giải nén vượt dung lượng đã khai báo.');}chunks.push(data);
   if(final){if(length!==info.size)throw new Error('Kích thước giải nén không khớp: '+path);const out=new Uint8Array(length);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}if(refCrc(out)!==info.crc)throw new Error('CRC không khớp, ZIP bị hỏng: '+path);extracted.set(path,out);}
  };file.start();
 });unzip.register(UnzipInflate);
 for(let offset=0;offset<bytes.length;offset+=16384)unzip.push(bytes.subarray(offset,offset+16384),offset+16384>=bytes.length);
 if(extracted.size!==names.size)throw new Error('ZIP thiếu tệp hoặc bị cắt ngắn.');
 const csvFiles=[...extracted.keys()].filter(p=>/\.csv$/i.test(p));if(!csvFiles.length)throw new Error('ZIP cần có ít nhất một CSV.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 return {name:file.name,files:extracted,csvFiles,hash};
}
export function readZipCsv(bundle,path){
 const bytes=bundle.files.get(path);if(!bytes||bytes.length>1024*1024)throw new Error('CSV tối đa 1 MiB.');
 let text;if(bytes[0]===255&&bytes[1]===254)text=new TextDecoder('utf-16le').decode(bytes);else if(bytes[0]===254&&bytes[1]===255)text=new TextDecoder('utf-16be').decode(bytes);else try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1258').decode(bytes);}
 const parsed=parseReferenceCsv(text);return {...parsed,text,columns:guessReferenceColumns(parsed.headers)};
}
export function mapReferenceShots(bundle,csvPath,columns,{videoTypes=[],defaultScene='',sequential=false}={}){
 const parsed=readZipCsv(bundle,csvPath),images=[...bundle.files.keys()].filter(refImage),sorted=[...images].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),usedIds=new Set(),warnings=[];
 const get=(row,key)=>String(row[columns[key]]||'').trim(),base=path=>path.split('/').at(-1),stem=path=>referenceKey(base(path).replace(/\.[^.]+$/,''));
 const shots=parsed.rows.map((row,index)=>{
  const originalId=get(row,'id')||String(index+1),raw=get(row,'image').replaceAll('\\','/'),csvDir=csvPath.split('/').slice(0,-1).join('/');let matches=[];
  if(raw){const path=refPath(raw);for(const candidate of [path,csvDir+'/'+path]){matches=images.filter(p=>p.toLowerCase()===candidate.toLowerCase());if(matches.length)break;}if(!matches.length)matches=images.filter(p=>p.toLowerCase().endsWith('/'+path.toLowerCase()));if(!matches.length)matches=images.filter(p=>base(p).toLowerCase()===base(path).toLowerCase());}
  else if(sequential&&sorted.length===parsed.rows.length)matches=[sorted[index]];
  else matches=images.filter(p=>stem(p)===referenceKey(originalId)||stem(p)===referenceKey('shot'+originalId));
  if(matches.length!==1)warnings.push('Dòng '+(index+2)+': '+(matches.length?'trùng tên ảnh':'chưa ghép được ảnh')+' · '+originalId);
  let id=/^[a-zA-Z0-9_-]{1,80}$/.test(originalId)&&!usedIds.has(originalId)?originalId:'RS'+String(index+1).padStart(4,'0');while(usedIds.has(id))id+='_';usedIds.add(id);
  const scene=get(row,'scene')||get(row,'sceneTitle')||'Chưa phân cảnh',sceneTitle=get(row,'sceneTitle')||scene,sceneTypes=referenceTags(get(row,'sceneType')||defaultScene);
  return {id,originalId,sceneId:scene,sceneTitle,sceneTypes,title:originalId+' · '+(get(row,'note')||scene).slice(0,180),timecode:get(row,'timecode')||[get(row,'start'),get(row,'end')].filter(Boolean).join('–'),size:get(row,'size'),lens:get(row,'lens'),move:get(row,'move'),note:get(row,'note'),imageId:'',imagePath:matches.length===1?matches[0]:''};
 });
 return {shots,warnings,sourceCsv:parsed.text,videoTypes:referenceTags(videoTypes)};
}
export function referenceImageFile(bundle,path){const bytes=bundle.files.get(path),ext=path.split('.').at(-1).toLowerCase(),mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',avif:'image/avif'}[ext];return new File([bytes],path.split('/').at(-1),{type:mime});}

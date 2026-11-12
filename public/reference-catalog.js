export const REFERENCE_VIDEO_TYPES=['Nấu ăn','Nông nghiệp','Thu hoạch','Cải tạo nhà','Đời sống nông thôn','Thủ công'];
export const REFERENCE_SCENE_TYPES=['Hái rau','Cuốc đất','Trồng cây','Thu hoạch','Sơ chế','Nấu ăn','Bày món','Ăn uống','Dọn nhà','Sửa nhà','Phong cảnh'];
export const referenceKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]/g,'');
export const referenceTags=value=>[...new Set((Array.isArray(value)?value:String(value||'').split(/[,;|]/)).map(s=>String(s).trim()).filter(Boolean))];
export function referenceTaxonomy(state){return {videoTypes:referenceTags([...REFERENCE_VIDEO_TYPES,...state.references.flatMap(r=>r.videoTypes||[])]),sceneTypes:referenceTags([...REFERENCE_SCENE_TYPES,...state.references.flatMap(r=>r.sceneTypes||[])])};}
export function validateReferenceSelection(selection){
 if(!selection||typeof selection!=='object'||Array.isArray(selection))throw new Error('Lựa chọn reference không hợp lệ.');
 for(const [key,max] of [['videoTypes',30],['sceneTypes',50],['referenceIds',10]])if(!Array.isArray(selection[key])||selection[key].length>max||selection[key].some(v=>typeof v!=='string'||!v.trim()||v.length>100))throw new Error('Lựa chọn reference vượt giới hạn hoặc sai định dạng.');
}
export function filterReferenceRecord(record,selection){
 if(!selection||!['videoTypes','sceneTypes','referenceIds'].some(k=>selection[k]?.length)||record.kind!=='reference')return record;
 const matches=(values,chosen)=>!chosen.length||values.some(v=>chosen.some(c=>referenceKey(c)===referenceKey(v)));
 if(selection.referenceIds?.length&&!selection.referenceIds.includes(record.id))return null;
 if(!matches(record.videoTypes||[],selection.videoTypes||[])||!matches(record.sceneTypes||[],selection.sceneTypes||[]))return null;
 const filtered={...record};
 if(selection.sceneTypes?.length&&record.shots?.length){filtered.shots=record.shots.filter(s=>matches(s.sceneTypes||[s.sceneType||s.sceneTitle||''],selection.sceneTypes));filtered.imageIds=[];
  if(record.analysis){const ids=new Set(filtered.shots.map(s=>s.id));filtered.analysis={...record.analysis,observations:(record.analysis.observations||[]).filter(o=>ids.has(o.shotId)),skills:(record.analysis.skills||[]).filter(s=>s.sourceShotIds.every(id=>ids.has(id)))};}
 }
 return filtered;
}
export function parseReferenceCsv(text){
 text=text.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/)[0],delimiter=[',',';','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
 const rows=[];let row=[],field='',quoted=false,closed=false;
 const add=()=>{row.push(field);field='';closed=false;};
 for(let i=0;i<text.length;i++){
  const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c==='"'){if(field||closed)throw new Error('CSV có dấu nháy không hợp lệ.');quoted=true;}
  else if(c===delimiter)add();else if(c==='\r'||c==='\n'){add();if(row.some(v=>v!==''))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
  else{if(closed&&c.trim())throw new Error('CSV có ký tự sau dấu nháy đóng.');if(!closed)field+=c;}
  if(rows.length>301||row.length>100)throw new Error('CSV tối đa 300 shot và 100 cột.');
 }
 if(quoted)throw new Error('CSV có ô chưa đóng dấu nháy.');if(row.length||field||closed){add();if(row.some(v=>v!==''))rows.push(row);}
 const headers=(rows.shift()||[]).map(v=>v.trim());if(!headers.length||new Set(headers).size!==headers.length||headers.some(h=>!h))throw new Error('Tên cột CSV thiếu hoặc bị trùng.');
 if(!rows.length||rows.some(r=>r.length!==headers.length))throw new Error('CSV không có shot hoặc số cột không khớp.');
 return {headers,rows:rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]])))};
}
export const REFERENCE_COLUMNS={id:['shotid','shot','id','mashot','shotnumber'],image:['image','imagepath','imagefile','framepath','imagefilename','filename','file','frame','thumbnail','anh','tenanh'],scene:['sceneid','scene','phancanh','scene_title','scenename','scenetitle'],sceneTitle:['scenetitle','scenename','tenphancanh','scenedescription'],sceneType:['scenetype','category','loaip hancanh','phanloaicanh'],timecode:['timecode','timestamp','time','tc'],start:['start','starttime','starttimecode','timein','batdau'],end:['end','endtime','endtimecode','timeout','ketthuc'],note:['note','notes','description','action','hanhdong','noidung','ghichu'],size:['size','shotsize','shottype','cocanh'],lens:['lens','lensmm','focallength','tieucu'],move:['move','movement','cameramovement','chuyendong']};
export function guessReferenceColumns(headers){return Object.fromEntries(Object.entries(REFERENCE_COLUMNS).map(([key,aliases])=>[key,headers.find(h=>aliases.some(a=>referenceKey(a)===referenceKey(h)))||'']));}

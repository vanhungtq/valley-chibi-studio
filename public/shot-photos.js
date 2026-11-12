import {esc,bytes} from './ui.js';
import {archiveEpisode} from './workflow.js';

export function photoAsset(state,id){return state.assets.find(a=>a.id===id&&a.mime.startsWith('image/')&&/^[a-f0-9-]{36}$/.test(a.id));}
export function actualPhotoStrip(state,episode,shotId){
 const photos=episode.actualPhotos?.[shotId]||[];if(!photos.length)return '';
 return `<div class="actual-photo-strip">${photos.slice(0,3).map(p=>{const a=photoAsset(state,p.assetId);return a?`<img loading="lazy" src="/api/files/${a.id}" alt="Ảnh thực tế ${esc(shotId)}">`:'';}).join('')}<span>${photos.length} ảnh thực tế</span></div>`;
}
export function shotPhotoEditor(state,episode,shotId){
 const photos=episode.actualPhotos?.[shotId]||[],eligible=state.assets.filter(a=>a.mime.startsWith('image/')&&a.category!=='storyboard'&&(!a.episodeId||a.episodeId===episode.id)&&!photos.some(p=>p.assetId===a.id));
 return `<fieldset class="shot-photos"><legend>Ảnh thực tế · ${esc(shotId)}</legend><p>Ảnh khảo sát, bố cục thử hoặc khung hình quay thật. Agent nhận ảnh cùng ID shot và ghi chú khi bạn giao việc tiếp.</p><div class="shot-photo-list">${photos.map(p=>{const a=photoAsset(state,p.assetId);return a?`<article><a href="/api/files/${a.id}" target="_blank" rel="noopener"><img src="/api/files/${a.id}" alt="Ảnh thực tế ${esc(shotId)}"></a><small>${esc(a.name)} · ${bytes(a.size)}</small><label>Ghi chú cho Agent<textarea name="photo-note-${a.id}" maxlength="2000" rows="2">${esc(p.note||'')}</textarea></label><label class="photo-remove"><input type="checkbox" name="remove-photo" value="${a.id}"> Gỡ khỏi shot</label></article>`:'';}).join('')}</div><div class="form-group"><label for="shot-actual-files">Tải thêm ảnh thực tế</label><input id="shot-actual-files" name="actual-photo-files" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif"><small>Ảnh được lưu khi bấm “Lưu shot”. Tối đa 20 ảnh/shot. Ảnh lớn tự tối ưu để Agent đọc được; giữ ảnh gốc trên máy.</small></div><div class="form-group"><label for="shot-actual-existing">Hoặc chọn ảnh thực tế từ Thư viện</label><select id="shot-actual-existing" name="actual-photo-existing" multiple size="3">${eligible.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div></fieldset>`;
}
export function reopenForPhotos(episode,label){
 if(Object.keys(episode.outputs).length){archiveEpisode(episode,label);episode.preservedTaskIds=[...new Set([...(episode.preservedTaskIds||[]),...Object.entries(episode.outputs).filter(([k])=>episode.approved.includes(Number(k))).map(([,o])=>o.taskId).filter(Boolean)])];episode.outputs={};episode.approved=[];episode.stage=0;}
 episode.sample=false;episode.stale=false;
}
export async function prepareActualPhoto(file){
 if(file.size<=4*1024*1024)return file;
 const bitmap=await createImageBitmap(file);
 try{
  const scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));
  if(!blob||blob.size>4*1024*1024)throw new Error('Chưa tối ưu được ảnh. Chọn ảnh dưới 4 MiB để Agent đọc.');
  return new File([blob],file.name.replace(/\.[^.]*$/,'')+'.agent.webp',{type:'image/webp'});
 }finally{bitmap.close();}
}

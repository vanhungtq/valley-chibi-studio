import {esc,icon,button,bytes,mmss,fmtDate} from './ui.js';

const dossierFileLabels={pdf:['PDF','Hồ sơ storyboard','Bản trình bày đầy đủ cho ekip'],archive:['ZIP','Bộ tài liệu đầy đủ','Ảnh storyboard và các tài liệu gốc'],shotlist:['CSV','Danh sách cảnh quay','Shot, thời lượng và thông số quay'],knowledge:['MD','Kiến thức dự án','Định hướng và kỹ thuật áp dụng']};
const dossierFile=(state,id)=>state.assets.find(a=>a.id===id&&/^[a-f0-9-]{36}$/.test(a.id));
const dossierUrl=asset=>'/api/files/'+asset.id;
const dossierScenes=dossier=>[...new Map(dossier.shots.map(s=>[s.sceneId,s.sceneTitle])).entries()];
const dossierShotCount=dossier=>dossier.shots.length;
const dossierDuration=dossier=>dossier.shots.reduce((n,s)=>n+s.seconds,0);
const dossierLink=(asset,label,primary=false,download=false)=>asset?`<a class="btn ${primary?'primary':''}" href="${dossierUrl(asset)}" ${download?`download="${esc(asset.name)}"`:'target="_blank" rel="noopener"'}>${icon(download?'download':'external')}${label}</a>`:'';

export function dossierRoute(hash){
 const match=/^#?episodes\/([a-zA-Z0-9_-]{1,80})\/([a-zA-Z0-9_-]{1,80})$/.exec(hash);
 return match?{episodeId:match[1],dossierId:match[2]}:null;
}
export function dossierLocation(episodeId,id){return '#episodes/'+encodeURIComponent(episodeId)+'/'+encodeURIComponent(id);}
export function findDossier(state,selection){
 const episode=state.episodes.find(e=>e.id===selection?.episodeId),dossier=episode?.dossiers?.find(d=>d.id===selection?.dossierId);
 return dossier?{episode,dossier}:null;
}
export function dossierCards(state){
 const editions=state.episodes.flatMap(episode=>(episode.dossiers||[]).map(dossier=>({episode,dossier}))).sort((a,b)=>b.dossier.publishedAt.localeCompare(a.dossier.publishedAt));
 if(!editions.length)return '';
 return `<section class="dossier-editions" aria-label="Phiên bản hồ sơ tập phim"><div class="section-label"><h2>Hồ sơ tập phim</h2><span>${editions.length} phiên bản · xem trực tiếp hoặc tải xuống</span></div>${editions.map(({episode,dossier})=>{
  const cover=dossierFile(state,dossier.gallery[0]?.assetId||dossier.visualBibleId),pdf=dossierFile(state,dossier.files.pdf),zip=dossierFile(state,dossier.files.archive);
  return `<article class="panel dossier-card"><button class="dossier-card-cover" data-action="open-dossier" data-id="${esc(episode.id)}" data-dossier="${esc(dossier.id)}" aria-label="Mở ${esc(dossier.title)}">${cover?`<img src="${dossierUrl(cover)}" alt="Storyboard AI của ${esc(dossier.title)}" loading="lazy">`:icon('board')}<span class="dossier-ai-label">STORYBOARD AI</span></button><div class="dossier-card-body"><div class="eyebrow">TẬP ${String(episode.number).padStart(2,'0')} · PHIÊN BẢN ${esc(dossier.version)}</div><h2>${esc(dossier.title)}</h2><p>${esc(dossier.summary)}</p><div class="dossier-mini-stats"><span>${icon('clock')}${dossier.targetMinutes} phút</span><span>${icon('film')}${dossierShotCount(dossier)} shot</span><span>${icon('board')}${dossier.gallery.length} bảng hình</span></div><div class="dossier-actions">${button('open-dossier','Xem hồ sơ','arrow','primary',`data-id="${esc(episode.id)}" data-dossier="${esc(dossier.id)}"`)}${button('resume-dossier',episode.workingSource?.dossierId===dossier.id?'Mở bản nâng cấp':'Tiếp tục trong Xưởng','edit','',`data-id="${esc(episode.id)}" data-dossier="${esc(dossier.id)}"`)}${dossierLink(pdf,'Tải PDF',false,true)}${dossierLink(zip,'Tải ZIP',false,true)}</div><small class="muted">Cập nhật ${fmtDate(dossier.publishedAt)} · Hồ sơ nhập từ Codex</small></div></article>`;
 }).join('')}</section><div class="section-label dossier-source-heading"><h2>Quy trình sản xuất</h2><span>Kịch bản và các mốc bàn giao của tập</span></div>`;
}
export function dossierDocumentCards(state,dossier){
 return `<div class="dossier-documents">${Object.entries(dossierFileLabels).map(([role,[type,label,description]])=>{
  const asset=dossierFile(state,dossier.files[role]);
  return `<article class="panel dossier-document"><span class="dossier-file-type">${type}</span><div><h3>${label}</h3><p>${description}</p><small>${asset?esc(asset.name)+' · '+bytes(asset.size):'Tệp chưa có trong thư viện'}</small></div>${asset?`<div class="dossier-actions">${dossierLink(asset,'Mở')}${dossierLink(asset,'Tải xuống',false,true)}</div>`:''}</article>`;
 }).join('')}</div>`;
}
const dossierSceneSelect=(dossier,selected)=>`<label class="dossier-scene-select">Phân cảnh <select id="dossier-scene-filter" aria-label="Lọc phân cảnh hồ sơ"><option value="all">Tất cả phân cảnh</option>${dossierScenes(dossier).map(([id,title])=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(id)} · ${esc(title)}</option>`).join('')}</select></label>`;
function dossierOverview(state,dossier){
 const cover=dossierFile(state,dossier.gallery[0]?.assetId),bible=dossierFile(state,dossier.visualBibleId);
 return `<section class="dossier-overview"><div class="panel dossier-overview-image">${cover?`<img src="${dossierUrl(cover)}" alt="Bảng storyboard mở đầu · ảnh minh họa AI">`:icon('board')}<p>Storyboard minh họa bằng AI · thứ tự ô: trên trái, trên phải, dưới trái, dưới phải.</p></div><section class="panel dossier-story"><div class="eyebrow">MẠCH CHUYỆN</div><h2>${dossierScenes(dossier).length} phân cảnh · ${mmss(dossierDuration(dossier))}</h2><ol>${dossierScenes(dossier).map(([id,title])=>{const shots=dossier.shots.filter(s=>s.sceneId===id);return `<li><span>${esc(id)}</span><div><strong>${esc(title)}</strong><small>${shots.length} shot · ${mmss(shots.reduce((n,s)=>n+s.seconds,0))}</small><p>${esc(shots[0]?.action||'')}</p></div></li>`;}).join('')}</ol></section></section>${bible?`<details class="panel dossier-bible"><summary>Nhân vật & định hướng mỹ thuật <span class="muted">Ảnh minh họa AI</span></summary><img loading="lazy" src="${dossierUrl(bible)}" alt="Visual bible nhân vật, trang phục và mỹ thuật"></details>`:''}<div class="section-label"><h2>Hồ sơ cho ekip</h2><span>Đủ bốn tài liệu trong cùng phiên bản</span></div>${dossierDocumentCards(state,dossier)}`;
}
function dossierGallery(state,dossier,scene){
 const shots=new Map(dossier.shots.map(s=>[s.shotId,s])),gallery=dossier.gallery.filter(g=>scene==='all'||g.shotIds.some(id=>shots.get(id)?.sceneId===scene));
 return `<div class="dossier-toolbar">${dossierSceneSelect(dossier,scene)}<span>${gallery.length} bảng hình · ${gallery.reduce((n,g)=>n+g.shotIds.length,0)} khung</span></div><p class="text-small muted">Bấm ảnh để xem lớn. Mỗi bảng giữ thứ tự 2×2: trên trái → trên phải → dưới trái → dưới phải.</p><div class="dossier-gallery">${gallery.map(g=>{
  const asset=dossierFile(state,g.assetId);return `<figure class="panel dossier-board"><button data-action="dossier-image" data-id="${esc(g.assetId)}" aria-label="Xem lớn ${esc(g.shotIds.join(', '))}">${asset?`<img src="${dossierUrl(asset)}" alt="Storyboard AI · ${esc(g.shotIds.join(', '))}" loading="lazy">`:'<span>Ảnh chưa có trong thư viện</span>'}<span class="dossier-ai-label">ẢNH MINH HỌA AI</span></button><figcaption><strong>Bảng ${String(g.page).padStart(2,'0')}</strong><span>${esc(g.shotIds.join(' · '))}</span></figcaption><ol class="dossier-panel-captions">${g.shotIds.map(id=>{const shot=shots.get(id);return `<li><b>${esc(id)}</b> ${esc(shot?.action||'')}</li>`;}).join('')}</ol></figure>`;
 }).join('')}</div>`;
}
function dossierShotlist(dossier,scene){
 const shots=dossier.shots.filter(s=>scene==='all'||s.sceneId===scene);
 return `<div class="dossier-toolbar">${dossierSceneSelect(dossier,scene)}<span>${shots.length} shot · ${mmss(shots.reduce((n,s)=>n+s.seconds,0))}</span></div><div class="dossier-shotlist">${dossierScenes(dossier).filter(([id])=>scene==='all'||scene===id).map(([id,title])=>`<section class="panel dossier-shot-scene"><h2>${esc(id)} · ${esc(title)}</h2>${shots.filter(s=>s.sceneId===id).map(s=>`<details class="dossier-shot"><summary><span class="dossier-shot-id">${esc(s.shotId)}</span><span class="dossier-shot-action">${esc(s.action)}<small>${esc(s.size)} · ${s.lensMm} mm · ${esc(s.recording)}</small></span><span class="dossier-shot-time">${esc(s.timecode)}<small>${s.seconds} giây</small></span></summary><dl>${[['Góc máy',s.angle],['Chuyển động',s.move],['Ánh sáng',s.lighting],['Khẩu độ',s.aperture],['Âm thanh',s.sound],['Continuity',s.continuity],['Kỹ thuật áp dụng',s.techniqueRefs]].map(([label,text])=>`<div><dt>${label}</dt><dd>${esc(text)}</dd></div>`).join('')}</dl></details>`).join('')}</section>`).join('')}</div>`;
}
export function dossierDetail(state,selection,tab='overview',scene='all'){
 const found=findDossier(state,selection);
 if(!found)return `<div class="panel dossier-not-found"><h1>Chưa tìm thấy bản hồ sơ</h1><p>Kiểm tra đăng nhập hoặc mở danh sách tập phim.</p>${button('close-dossier','Về Tập phim','arrow')}</div>`;
 const {episode,dossier}=found,pdf=dossierFile(state,dossier.files.pdf),zip=dossierFile(state,dossier.files.archive);
 const tabs=[['overview','Tổng quan','grid'],['storyboard','Storyboard','board'],['shots','Shotlist','list'],['documents','Tài liệu & PDF','file']];
 const content=tab==='storyboard'?dossierGallery(state,dossier,scene):tab==='shots'?dossierShotlist(dossier,scene):tab==='documents'?`${dossierDocumentCards(state,dossier)}${pdf?`<section class="panel dossier-pdf"><div class="panel-head"><h2>Xem hồ sơ PDF</h2>${dossierLink(pdf,'Mở trong tab mới')}</div><iframe src="${dossierUrl(pdf)}#view=FitH" title="PDF ${esc(dossier.title)}" loading="lazy"></iframe><p class="text-small muted">Nếu thiết bị không hiển thị PDF, chọn “Mở trong tab mới” hoặc tải xuống.</p></section>`:''}`:dossierOverview(state,dossier);
 return `<div class="dossier-detail">${button('close-dossier','Tất cả tập phim','arrow','dossier-back')}<header class="dossier-heading"><div><div class="eyebrow">TẬP ${String(episode.number).padStart(2,'0')} · PHIÊN BẢN ${esc(dossier.version)}</div><h1>${esc(dossier.title)}</h1><p>${esc(dossier.summary)}</p></div><div class="dossier-actions">${button('resume-dossier',episode.workingSource?.dossierId===dossier.id?'Mở bản nâng cấp':'Tiếp tục trong Xưởng','edit','primary',`data-id="${esc(episode.id)}" data-dossier="${esc(dossier.id)}"`)}${dossierLink(pdf,'Tải PDF',false,true)}${dossierLink(zip,'Tải bộ ZIP',false,true)}</div></header><div class="dossier-stat-strip">${[[dossier.targetMinutes+' phút','Thời lượng mục tiêu'],[dossierShotCount(dossier)+' shot','Shotlist hoàn chỉnh'],[dossierScenes(dossier).length+' cảnh','Mạch câu chuyện'],[dossier.gallery.length+' bảng','Storyboard AI']].map(([value,label])=>`<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</div><nav class="tabs dossier-tabs" aria-label="Nội dung hồ sơ">${tabs.map(([id,label,ico])=>`<button data-action="dossier-tab" data-view="${id}" aria-current="${id===tab?'page':'false'}" class="${id===tab?'active':''}">${icon(ico)}${label}</button>`).join('')}</nav>${content}<p class="dossier-note">${icon('info')}Ảnh storyboard là minh họa AI. Đối chiếu nhân vật, đạo cụ và hiện trạng thực tế trước ngày quay.</p></div>`;
}
export function dossierImage(state,id){const asset=dossierFile(state,id);return asset?.mime.startsWith('image/')?`<img class="dossier-enlarged" src="${dossierUrl(asset)}" alt="${esc(asset.description||asset.name)}"><div class="modal-foot">${dossierLink(asset,'Mở ảnh gốc')}${dossierLink(asset,'Tải ảnh',false,true)}</div>`:'';}

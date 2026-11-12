import {esc,mmss,button} from './ui.js';

const labels={grounding:'Nguồn & điều chưa biết',feasibility:'Khả năng quay thực tế',continuity:'Liên tục giữa các cảnh',scope:'Phạm vi & bàn giao',differentiation:'Concept & khác biệt',story_progression:'Hành động & nhịp kể',coverage:'Coverage & âm thanh',document_integrity:'Hình & hồ sơ'};
const bullets=items=>`<ul>${items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`;
const block=(title,content)=>`<div class="production-block"><h4>${title}</h4>${content}</div>`;
export function qualityFeedback(review){
 if(review?.verdict!=='needs_revision')return '';
 return `<div class="quality-feedback" role="status"><strong>Cần chỉnh trước khi bàn giao</strong>${(review.issues||[]).map(i=>`<p><b>${esc(i.field)}</b> · ${esc(i.message)}<br><span>${esc(i.proposedFix)}</span></p>`).join('')}</div>`;
}
export function productionReview(output){
 if(!output.quality)return '';
 if(output.quality.verdict==='legacy')return '<p class="text-small muted">Bản bàn giao cũ · chưa có báo cáo tự rà soát theo quy trình mới.</p>';
 const review=output.production?.review;if(!review||!Array.isArray(review.checks)||!Array.isArray(review.findings))return '';
 return `<section class="production-review"><h3>Kiểm tra trước khi bàn giao</h3><p>Codex đã tự rà soát · vòng ${review.round}. Máy chủ đã kiểm tra dữ liệu và liên kết.</p><div class="review-checks">${review.checks.map(c=>`<div><strong>${c.status==='warning'?'△':'✓'} ${esc(labels[c.id]||c.id)}</strong><small>${esc(c.evidence)}</small></div>`).join('')}</div>${review.findings.length?block('Ghi nhận và cách xử lý',review.findings.map(f=>`<p><strong>${f.resolved?'Đã xử lý':'Cảnh báo'} · ${esc(f.field)}</strong><br>${esc(f.description)}<br>${esc(f.proposedFix)}</p>`).join('')):''}<small>Tự rà soát hỗ trợ chất lượng hồ sơ; hiện trạng quay vẫn cần đối chiếu thực tế.</small></section>`;
}
export function productionDetail(output,stage){
 const data=output.production?.data;if(!data||output.production.schemaVersion!=='1.0')return '';
 try{
 let body='';
 if(stage===0)body=block('Mục tiêu',`<p>${esc(data.goal)} · ${data.targetMinutes} phút</p>`)+block('Phạm vi',bullets(data.scope))+block('Tiêu chí bàn giao',bullets(data.acceptanceCriteria))+block('Điều cần xác nhận',bullets(data.questions));
 if(stage===1)body=data.concepts.map(c=>block((c.id===data.selectedConceptId?'✓ Đã chọn · ':'')+esc(c.title),`<p>${esc(c.logline)}</p><p><strong>Khác biệt:</strong> ${esc(c.difference)}<br><strong>Mở:</strong> ${esc(c.hook)}<br><strong>Motif:</strong> ${esc(c.motif)}<br><strong>Kết:</strong> ${esc(c.ending)}</p>${bullets(c.arc)}`)).join('')+block('Ngôn ngữ hình ảnh',`<p>${esc(data.selectionReason)}</p>${bullets([data.styleProfile.palette.join(' · '),data.styleProfile.camera,data.styleProfile.lighting,data.styleProfile.sound,data.styleProfile.wardrobe,...data.styleProfile.avoid])}`);
 if(stage===2)body=block('Bản đồ nhịp kể',data.beatMap.map(b=>`<p><strong>${esc(b.title)} · ${mmss(b.seconds)}</strong><br>${esc(b.purpose)}<br><small>${esc(b.sceneIds.join(' · '))}</small></p>`).join(''))+block('Continuity',data.continuity.map(c=>`<p><strong>${esc(c.sceneId)} · ${esc(c.entity)}</strong><br>${esc(c.before)} → ${esc(c.after)}</p>`).join('')||'<p>Chưa có ghi chú continuity riêng.</p>');
 if(stage===3)body=block('Mục đích & setup từng shot',data.shotDesigns.map(s=>`<details><summary>${esc(s.shotId)} · ${esc(s.purpose)}</summary><p><strong>Bố cục:</strong> ${esc(s.composition)}<br><strong>Nét:</strong> ${esc(s.focus)}<br><strong>Trục:</strong> ${esc(s.axis)}<br><strong>Continuity:</strong> ${esc(s.continuity)}</p></details>`).join(''))+block('Kế hoạch âm thanh',data.soundPlan.map(s=>`<p><strong>${esc(s.sceneId)}</strong> · ${esc(s.ambience)}<br>${esc(s.method)} · Room tone: ${s.roomToneSeconds}s<br>${esc(s.actionSounds.join(' · '))}</p>`).join(''))+block('Thiết bị',bullets(data.equipment));
 if(stage===4)body=block('Bộ hồ sơ đã lưu',bullets(data.deliverables.map(d=>d.label)))+block('Storyboard',`<p>${data.storyboardCoverage.filter(b=>b.status==='ready').length}/${data.storyboardCoverage.length} shot đã có ảnh liên kết.</p>${bullets(data.storyboardCoverage.filter(b=>b.status==='missing').map(b=>b.shotId+' · '+b.note))}`)+block('Checklist ekip',bullets(data.checklist));
 return `<section class="production-detail"><h3>Bàn giao chuyên môn</h3>${body}${data.assumptions?.length?block('Giả định cần giữ rõ',bullets(data.assumptions)):''}${block('Bước tiếp theo',`<p>${esc(data.handoff)}</p>`)}${button('download-production','Tải dữ liệu & báo cáo kiểm tra','download','small',`data-stage="${stage}"`)}</section>`;
 }catch{return '<p class="text-small muted">Dữ liệu bàn giao đã lưu chưa đủ trường để hiển thị theo mẫu mới.</p>';}
}

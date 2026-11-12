import {readState,fail} from './api.js';
import {archiveEpisode} from '../public/workflow.js';

export const EPISODE_WORK_PROTOCOL='valley-episode-work/1';
export async function resumeEpisodeDossier(env,owner,args){
 if(typeof args.episode_id!=='string'||typeof args.dossier_id!=='string'||!Number.isInteger(args.expected_revision))throw fail(400,'Cần ID tập, hồ sơ và revision mới nhất.');
 const loaded=await readState(env,owner),e=loaded.state.episodes.find(e=>e.id===args.episode_id),d=e?.dossiers?.find(d=>d.id===args.dossier_id);
 if(!e||!d)throw fail(404,'Không tìm thấy bản hồ sơ để tiếp tục.');
 if(e.workingSource?.dossierId===d.id)return {episodeId:e.id,title:e.title,revision:loaded.revision,alreadyResumed:true,url:'/#studio'};
 if(loaded.revision!==args.expected_revision)throw fail(409,'Dự án vừa thay đổi. Tải lại trước khi tiếp tục.');
 const at=new Date().toISOString();archiveEpisode(e,'Trước khi nâng cấp từ '+d.title,at);
 e.preservedTaskIds=[...new Set([...(e.preservedTaskIds||[]),...Object.entries(e.outputs).filter(([k])=>e.approved.includes(Number(k))).map(([,o])=>o.taskId).filter(Boolean)])];
 const previousPhotos=e.actualPhotos||{};
 e.scenes=[...new Map(d.shots.map(s=>[s.sceneId,s.sceneTitle])).entries()].map(([id,title])=>{
  const list=d.shots.filter(s=>s.sceneId===id);
  return {id,title,time:list[0].timecode+' → '+list.at(-1).timecode,location:'',emotion:'',summary:list[0].action,sound:list[0].sound,palette:'#8d9d78',image:'',shots:list.map(s=>({id:s.shotId,size:s.size,lens:s.lensMm+' mm thực · '+Math.round(s.lensMm*1.5)+' mm tương đương FF',move:s.move,action:s.action,seconds:s.seconds,sound:s.sound,light:s.lighting,assetIds:[],note:['Góc máy: '+s.angle,'Khẩu độ: '+s.aperture,'Ghi hình: '+s.recording,'Continuity: '+s.continuity,'Kỹ thuật: '+s.techniqueRefs].join('\n')}))};
 });
 const shotIds=new Set(d.shots.map(s=>s.shotId));e.actualPhotos=Object.fromEntries(Object.entries(previousPhotos).filter(([id])=>shotIds.has(id)));
 e.storyboards={};for(const board of d.gallery)board.shotIds.forEach((id,panel)=>{e.storyboards[id]={assetId:board.assetId,panel,generated:true};});
 e.title=d.title+' · Đang nâng cấp';e.brief=d.summary||e.brief;e.targetMinutes=d.targetMinutes;e.sample=false;e.stale=false;
 e.outputs={};e.approved=[];e.stage=0;e.runRequestId=crypto.randomUUID();
 e.workingSource={dossierId:d.id,title:d.title,version:d.version,fileIds:d.files,resumedAt:at};
 e.activity.push({id:crypto.randomUUID(),agent:'ceo',kind:'working_copy',at,text:'Đã mở '+d.title+' để nâng cấp. Thêm ảnh thực tế vào từng shot rồi giao việc cho Codex.'});
 loaded.state.activeEpisode=e.id;loaded.state.updatedAt=at;
 const serialized=JSON.stringify(loaded.state);if(new TextEncoder().encode(serialized).length>2*1024*1024)throw fail(413,'Lịch sử dự án vượt 2 MiB. Chưa thay đổi tập.');
 const revision=loaded.revision+1;
 const update=env.DB.prepare("UPDATE studio_state SET state = ?, revision = revision + 1, updated_at = ? WHERE owner = ? AND revision = ? AND NOT EXISTS (SELECT 1 FROM codex_tasks WHERE owner = ? AND episode_id = ? AND status = 'running' AND lease_until >= ?)").bind(serialized,at,owner,loaded.revision,owner,e.id,Date.now());
 const stale=env.DB.prepare("UPDATE codex_tasks SET status = 'stale', claim_token = NULL, lease_until = NULL, updated_at = ? WHERE owner = ? AND episode_id = ? AND status IN ('queued','running') AND EXISTS (SELECT 1 FROM studio_state WHERE owner = ? AND revision = ? AND state = ?)").bind(at,owner,e.id,owner,revision,serialized);
 const result=await env.DB.batch([update,stale]);if(!result[0].meta.changes)throw fail(409,'Dự án vừa thay đổi hoặc có phiên Codex đang nhận việc. Bàn giao phiên hiện tại trước khi mở bản nâng cấp.');
 return {episodeId:e.id,title:e.title,revision,alreadyResumed:false,url:'/#studio'};
}

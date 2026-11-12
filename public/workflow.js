import {AGENTS,STAGES} from './data.js';

// Older episodes used the eight-minute sample before duration was per episode.
export const targetMinutes=episode=>episode.targetMinutes??8;
export const durationSeconds=episode=>episode.scenes.flatMap(scene=>scene.shots).reduce((sum,shot)=>sum+shot.seconds,0);
export function archiveEpisode(episode,label,at=new Date().toISOString()){
 episode.versions.push({id:crypto.randomUUID(),label,at,snapshot:structuredClone({title:episode.title,englishTitle:episode.englishTitle||'',actualPhotos:episode.actualPhotos||{},workingSource:episode.workingSource||null,brief:episode.brief,targetMinutes:targetMinutes(episode),stage:episode.stage,outputs:episode.outputs,approved:episode.approved,scenes:episode.scenes,storyboards:episode.storyboards||{}})});
 if(episode.versions.length>30)episode.versions.shift();
}
export function approveEpisode(episode,{automatic=false,at=new Date().toISOString()}={}){
 const stage=episode.stage,output=episode.outputs[stage];
 if(stage>=STAGES.length||!output||episode.approved.includes(stage))return false;
 output.approval={mode:automatic?'automatic':'manual',at};
 episode.approved.push(stage);episode.stage=stage+1;
 archiveEpisode(episode,(automatic?'Tự động duyệt ':'Duyệt ')+STAGES[stage],at);
 episode.activity.push({id:crypto.randomUUID(),agent:AGENTS[stage].id,text:(automatic?'Xưởng tự động duyệt ':'Bạn đã duyệt ')+STAGES[stage].toLowerCase()+'. '+(stage<4?'Đã bàn giao cho '+AGENTS[stage+1].name+'.':'Hồ sơ sẵn sàng để xuất cho ekip.'),at,kind:automatic?'auto_approval':'approval'});
 return true;
}
export function workflowPolicy(episode){
 return {autoApprove:episode.autoApprove===true,stage:episode.stage,completed:episode.stage>=STAGES.length,awaitingHumanReview:!!episode.outputs[episode.stage]&&!episode.approved.includes(episode.stage)};
}

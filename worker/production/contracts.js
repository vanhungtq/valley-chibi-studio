import {CONTRACT_VERSION,WORKFLOW_VERSION,PRODUCTION_STAGES} from './manifest.js';

const text={type:'string',minLength:1,maxLength:12000};
const integer=(minimum=0,maximum=14400)=>({type:'integer',minimum,maximum});
const list=(items=text,minItems=0,maxItems=200)=>({type:'array',items,minItems,maxItems});
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const choice=(...values)=>({type:'string',enum:values});
const continuity=list(object({entity:text,sceneId:text,before:text,after:text}),0,1000);
export const DATA_SCHEMAS=[
 object({goal:text,targetMinutes:integer(1,240),scope:list(text,1),constraints:list(),assumptions:list(),facts:list(object({statement:text,status:choice('verified','owner_provided','assumption','unknown'),sourceIds:list()})),questions:list(),acceptanceCriteria:list(text,3),handoff:text}),
 object({concepts:list(object({id:text,title:text,logline:text,difference:text,hook:text,motif:text,arc:list(text,3),ending:text}),2,3),selectedConceptId:text,selectionReason:text,styleProfile:object({palette:list(text,2,8),camera:text,lighting:text,sound:text,wardrobe:text,avoid:list(text,1)}),props:list(),assumptions:list(),handoff:text}),
 object({beatMap:list(object({id:text,title:text,purpose:text,sceneIds:list(text,1,40),seconds:integer(1)}),1,40),continuity,assumptions:list(),handoff:text}),
 object({shotDesigns:list(object({shotId:text,purpose:text,composition:text,focus:text,axis:text,continuity:text,coverage:choice('wide','medium','detail','insert','transition','hero','other')}),1,3200),soundPlan:list(object({sceneId:text,ambience:text,actionSounds:list(),method:text,roomToneSeconds:integer(0,600)}),1,40),equipment:list(text,1),assumptions:list(),handoff:text}),
 object({deliverables:list(object({artifactId:text,kind:choice('production_book','storyboard','shot_list','notes'),label:text}),1,100),storyboardCoverage:list(object({shotId:text,status:choice('ready','missing'),artifactId:text,note:text},['shotId','status','note']),1,3200),checklist:list(text,1),assumptions:list(),handoff:text})
];
export const REVIEW_SCHEMA=object({verdict:choice('passed','needs_revision','needs_input'),round:integer(1,2),checks:list(object({id:text,status:choice('pass','warning','blocked'),evidence:text}),1,12),findings:list(object({id:text,severity:choice('critical','warning'),field:text,description:text,proposedFix:text,resolved:{type:'boolean'}}),0,100)});
export const GENERIC_PRODUCTION_SCHEMA=object({schemaVersion:{type:'string',const:CONTRACT_VERSION},stage:integer(0,4),data:{type:'object'},review:REVIEW_SCHEMA});
export function productionSchema(stage){return object({...GENERIC_PRODUCTION_SCHEMA.properties,stage:{type:'integer',const:stage},data:DATA_SCHEMAS[stage]});}
export function outputSchemaForStage(base,stage,required){return {...base,properties:{...base.properties,production:productionSchema(stage)},required:[...base.required,...(required?['production']:[])]};}

// A deliberately small validator for the closed schemas above, not arbitrary JSON Schema.
function checkSchema(value,schema,path,issues){
 if(issues.length>=25)return;
 const actual=Array.isArray(value)?'array':value===null?'null':typeof value;
 const valid=schema.type==='integer'?typeof value==='number'&&Number.isInteger(value):actual===schema.type;
 if(!valid){issues.push({field:path,message:'Cần kiểu '+schema.type+'.',proposedFix:'Điền đúng kiểu theo productionSchema.'});return;}
 const issue=(message,proposedFix='Đối chiếu productionSchema và sửa trường này.')=>issues.push({field:path,message,proposedFix});
 if(schema.const!==undefined&&value!==schema.const)issue('Giá trị phải là '+schema.const+'.');
 if(schema.enum&&!schema.enum.includes(value))issue('Chọn một trong: '+schema.enum.join(', ')+'.');
 if(schema.type==='string'&&(value.trim().length<(schema.minLength||0)||value.length>(schema.maxLength??Infinity)))issue('Văn bản trống hoặc vượt giới hạn.');
 if(schema.type==='integer'&&(value<schema.minimum||value>schema.maximum))issue('Số ngoài giới hạn cho phép.');
 if(schema.type==='array'){
  if(value.length<schema.minItems||value.length>schema.maxItems)issue(`Cần từ ${schema.minItems} đến ${schema.maxItems} phần tử.`);
  value.slice(0,schema.maxItems).forEach((item,index)=>checkSchema(item,schema.items,path+'['+index+']',issues));
 }
 if(schema.type==='object'&&schema.properties){
  for(const key of schema.required||[])if(!Object.hasOwn(value,key))issues.push({field:path+'.'+key,message:'Thiếu trường bắt buộc.',proposedFix:'Bổ sung '+key+' theo productionSchema.'});
  for(const [key,item] of Object.entries(value))if(schema.properties[key])checkSchema(item,schema.properties[key],path+'.'+key,issues);else if(schema.additionalProperties===false)issues.push({field:path+'.'+key,message:'Trường không thuộc hợp đồng.',proposedFix:'Bỏ trường này hoặc dùng đúng tên trường trong productionSchema.'});
 }
}
function productionError(issues){return Object.assign(new Error('Bàn giao chưa đạt kiểm tra. '+issues.slice(0,3).map(i=>i.field+': '+i.message).join(' ')),{status:422,quality:{verdict:'needs_revision',issues:issues.slice(0,25),maxRepairRounds:2}});}
export function extractProduction(output){
 const fences=[...output.content.matchAll(/```valley-production\s*\n([\s\S]*?)\n```/g)];
 if(fences.length>1||fences.length&&output.production!==undefined)throw productionError([{field:'production',message:'Gói production bị trùng.',proposedFix:'Chỉ dùng trường production hoặc một block valley-production.'}]);
 if(!fences.length)return {production:output.production,content:output.content};
 let production;try{production=JSON.parse(fences[0][1]);}catch{throw productionError([{field:'content',message:'Block valley-production không phải JSON hợp lệ.',proposedFix:'Sửa JSON; không có comment, dấu phẩy thừa hoặc markdown bên trong.'}]);}
 const content=output.content.replace(fences[0][0],'').trim();
 if(!content)throw productionError([{field:'content',message:'Thiếu tài liệu dễ đọc.',proposedFix:'Viết nội dung bàn giao trước block dữ liệu.'}]);
 return {production,content};
}

export function validateProduction(output,{stage,required,context,artifacts=[]}){
 const {production,content}=extractProduction(output);
 if(production===undefined){
  if(required)throw productionError([{field:'production',message:'Thiếu hợp đồng và self-review cho đầu việc mới.',proposedFix:'Đọc productionSchema/reviewRubric từ studio_get_task. Nộp production hoặc block valley-production trong content nếu MCP đang dùng schema cũ.'}]);
  return {content,quality:{verdict:'legacy',reviewer:'none',note:'Bàn giao theo hợp đồng cũ, chưa có self-review có cấu trúc.'}};
 }
 const issues=[];checkSchema(production,productionSchema(stage),'production',issues);
 if(issues.length)throw productionError(issues);
 const add=(field,message,proposedFix)=>issues.push({field,message,proposedFix});
 const data=production.data,review=production.review,spec=PRODUCTION_STAGES[stage];
 const ids=review.checks.map(c=>c.id);
 for(const check of spec.checks)if(!ids.includes(check.id))add('production.review.checks','Thiếu tiêu chí '+check.id+'.','Rà soát '+check.label+' và ghi evidence cụ thể.');
 if(new Set(ids).size!==ids.length||ids.some(id=>!spec.checks.some(c=>c.id===id)))add('production.review.checks','ID tiêu chí trùng hoặc không thuộc rubric.','Dùng mỗi ID trong reviewRubric đúng một lần.');
 if(review.verdict!=='passed'||review.checks.some(c=>c.status==='blocked')||review.findings.some(f=>f.severity==='critical'&&!f.resolved))add('production.review','Còn lỗi chưa giải quyết hoặc review chưa đạt.','Tự sửa theo findings rồi review lại. Nếu thiếu nguồn/công cụ, lưu nháp và báo đúng phần bị chặn.');
 const sourceIds=new Set([...context.resources.assets,...context.resources.references].map(a=>a.id));
 const scenes=[2,3].includes(stage)?output.scenes:context.episode.scenes;
 const sceneIds=new Set(scenes.map(s=>s.id)),shotIds=new Set(scenes.flatMap(s=>s.shots.map(sh=>sh.id)));
 const exactIds=(values,expected,field)=>{if(values.length!==expected.size||new Set(values).size!==values.length||values.some(id=>!expected.has(id)))add(field,'Danh sách thiếu, trùng hoặc có ID ngoài dữ liệu cảnh/shot.','Giữ mỗi ID đúng một lần, bao phủ toàn bộ dữ liệu được giao.');};
 if(stage===0){
  if(data.targetMinutes!==context.episode.targetMinutes)add('production.data.targetMinutes','Mục tiêu phút khác gói đầu việc.','Dùng '+context.episode.targetMinutes+' phút; nếu brief mâu thuẫn, báo rõ điều cần xác nhận.');
  for(const [i,fact] of data.facts.entries())if(fact.sourceIds.some(id=>!sourceIds.has(id))||fact.status==='verified'&&!fact.sourceIds.length)add('production.data.facts['+i+']','Dữ kiện xác minh thiếu nguồn hợp lệ.','Dẫn ID trong gói tư liệu hoặc đổi nhãn thành owner_provided/assumption/unknown.');
 }
 if(stage===1){
  const conceptIds=data.concepts.map(c=>c.id);
  if(new Set(conceptIds).size!==conceptIds.length||!conceptIds.includes(data.selectedConceptId))add('production.data.selectedConceptId','Concept được chọn không tồn tại hoặc ID bị trùng.','Đặt ID riêng cho từng concept và chọn đúng một ID.');
 }
 if(stage===2){
  exactIds(data.beatMap.flatMap(b=>b.sceneIds),sceneIds,'production.data.beatMap.sceneIds');
  if(new Set(data.beatMap.map(b=>b.id)).size!==data.beatMap.length)add('production.data.beatMap','ID beat bị trùng.','Đặt ID beat duy nhất.');
  for(const beat of data.beatMap){const seconds=scenes.filter(s=>beat.sceneIds.includes(s.id)).flatMap(s=>s.shots).reduce((sum,s)=>sum+s.seconds,0);if(Math.abs(seconds-beat.seconds)>.5)add('production.data.beatMap.'+beat.id+'.seconds','Thời lượng beat không bằng tổng shot liên kết.','Điền '+seconds+' giây hoặc điều chỉnh dữ liệu cảnh/shot.');}
  for(const item of data.continuity)if(!sceneIds.has(item.sceneId))add('production.data.continuity','Continuity dùng sceneId không tồn tại.','Chọn ID trong output.scenes.');
 }
 if(stage===3){
  exactIds(data.shotDesigns.map(d=>d.shotId),shotIds,'production.data.shotDesigns');exactIds(data.soundPlan.map(d=>d.sceneId),sceneIds,'production.data.soundPlan');
  if(context.episode.scenes.length){
   exactIds(scenes.map(s=>s.id),new Set(context.episode.scenes.map(s=>s.id)),'scenes');
   const outputLocations=new Map(scenes.flatMap(s=>s.shots.map(sh=>[sh.id,s.id])));
   for(const scene of context.episode.scenes)for(const shot of scene.shots)if(outputLocations.get(shot.id)!==scene.id)add('scenes.'+scene.id+'.'+shot.id,'Shot của kịch bản bị bỏ, đổi ID hoặc chuyển sang cảnh khác.','Giữ shot gốc đúng cảnh; có thể thêm shot coverage với ID mới.');
  }
 }
 if(stage===4){
  const files=new Map(artifacts.map(a=>[a.id,a]));
  for(const d of data.deliverables)if(!files.has(d.artifactId))add('production.data.deliverables','File bàn giao chưa được lưu trong đầu việc này.','Dùng studio_save_artifact và lấy đúng ID trả về.');
  if(!data.deliverables.some(d=>d.kind==='production_book'&&['text/html','application/pdf'].includes(files.get(d.artifactId)?.mime)))add('production.data.deliverables','Chưa có production book HTML/PDF thật.','Lưu hồ sơ HTML hoặc PDF qua studio_save_artifact trước khi nộp.');
  exactIds(data.storyboardCoverage.map(d=>d.shotId),shotIds,'production.data.storyboardCoverage');
  if(data.storyboardCoverage.some(b=>b.status==='missing')&&(!output.missing.length||!review.checks.some(c=>c.id==='document_integrity'&&c.status==='warning')))add('production.data.storyboardCoverage','Storyboard còn thiếu nhưng chưa được ghi nhận trong missing và review.','Ghi rõ shot thiếu, thêm missing và đánh dấu document_integrity là warning; không báo bộ hình đã hoàn chỉnh.');
  for(const board of data.storyboardCoverage)if(board.status==='ready'){
   const file=files.get(board.artifactId),prior=context.episode.storyboards?.[board.shotId];
   if(!board.artifactId||!(file?.mime.startsWith('image/')&&file.storyboardShotIds?.includes(board.shotId))&&!(prior?.assetId===board.artifactId&&context.resources.assets.some(a=>a.id===board.artifactId&&a.mime.startsWith('image/'))))add('production.data.storyboardCoverage.'+board.shotId,'Ảnh ready chưa có mapping đã đồng bộ đúng shot.','Lưu atlas kèm storyboard_shot_ids, dùng mapping nguồn đã có hoặc ghi missing.');
  }
 }
 if(issues.length)throw productionError(issues);
 return {content,production,quality:{verdict:'passed',workflowVersion:WORKFLOW_VERSION,contractVersion:CONTRACT_VERSION,reviewer:'codex_self_review',round:review.round,warnings:review.checks.filter(c=>c.status==='warning').length+review.findings.filter(f=>f.severity==='warning'&&!f.resolved).length,serverChecks:['contract','review_rubric','source_links','scene_shot_links','saved_artifacts']}};
}

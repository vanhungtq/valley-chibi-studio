import {readState,body,json,fail,outputSchema} from './api.js';
import {listTasks,getTask,claimTask,reportProgress,submitResult,saveArtifact,readResource,closeTask} from './bridge.js';
export const MCP_VERSIONS=['2026-07-28','2025-11-25','2025-06-18','2025-03-26'];
const toolSchema=(properties={},required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const taskId={type:'string',description:'ID đầu việc từ studio_list_tasks.'};
const claimToken={type:'string',description:'Token phiên nhận việc từ studio_claim_task; không ghi vào output công khai.'};
export const MCP_TOOLS=[
 {name:'studio_get_project',description:'Đọc nền tảng dự án, tập phim, nguồn tư liệu và các mốc duyệt. Dùng trước khi làm việc. Không gọi mô hình bên ngoài.',inputSchema:toolSchema(),annotations:{readOnlyHint:true}},
 {name:'studio_list_tasks',description:'Liệt kê đầu việc đang chờ Codex, đang chạy và đã nộp. Chỉ nhận việc do chủ dự án giao, không tự chuyển bước.',inputSchema:toolSchema({episode_id:{type:'string'}},[]),annotations:{readOnlyHint:true}},
 {name:'studio_get_task',description:'Đọc gói đầu việc, instruction chuyên môn, ngữ cảnh, nguồn và JSON schema đầu ra.',inputSchema:toolSchema({task_id:taskId}),annotations:{readOnlyHint:true}},
 {name:'studio_claim_task',description:'Nhận đầu việc, làm nhân vật tương ứng bắt đầu trạng thái đang xử lý. Trả claimToken và lease 15 phút.',inputSchema:toolSchema({task_id:taskId}),annotations:{readOnlyHint:false,destructiveHint:false}},
 {name:'studio_report_progress',description:'Cập nhật tiến độ ngắn và gia hạn phiên nhận việc. Nêu việc đã xong và tiếp theo, không gửi suy luận nội bộ. Gọi ít nhất mỗi 10 phút khi làm.',inputSchema:toolSchema({task_id:taskId,claim_token:claimToken,message:{type:'string',maxLength:1200}}),annotations:{readOnlyHint:false,destructiveHint:false}},
 {name:'studio_read_resource',description:'Đọc tệp thật từ thư viện. Ảnh trả bằng image content, TXT/MD trả văn bản, PDF/tệp khác trả tài nguyên nhị phân. Mỗi lượt tối đa 5 MB.',inputSchema:toolSchema({resource_id:{type:'string'}}),annotations:{readOnlyHint:true}},
 {name:'studio_save_artifact',description:'Đồng bộ file Codex tạo về Xưởng, tối đa 1 MB mỗi file; encoding utf8 cho văn bản, base64 cho PDF/ảnh. Gọi tuần tự từng file, sau đó nộp kết quả. Ảnh ChatGPT 2×2 có thể kèm storyboard_shot_ids để gắn 1–4 ô vào shot.',inputSchema:toolSchema({task_id:taskId,claim_token:claimToken,filename:{type:'string'},mime:{type:'string',enum:['text/html','text/markdown','text/plain','text/csv','application/json','application/pdf','image/png','image/jpeg','image/webp']},encoding:{type:'string',enum:['utf8','base64']},content:{type:'string'},storyboard_shot_ids:{type:'array',items:{type:'string'},minItems:1,maxItems:4,description:'Designer: ID shot theo ô trên trái, trên phải, dưới trái, dưới phải của ảnh ChatGPT 2×2. Đồng bộ vào storyboard khi nộp kết quả.'}},['task_id','claim_token','filename','mime','encoding','content']),annotations:{readOnlyHint:false,destructiveHint:false}},
 {name:'studio_submit_result',description:'Nộp tài liệu theo schema. Kết quả về Xưởng để chủ dự án duyệt, không tự phê duyệt. Từ chối đầu vào đã đổi và ID nguồn không hợp lệ.',inputSchema:toolSchema({task_id:taskId,claim_token:claimToken,output:outputSchema}),annotations:{readOnlyHint:false,destructiveHint:false}},
 {name:'studio_fail_task',description:'Báo không thể hoàn thành kèm lý do cụ thể, giữ nguyên các kết quả trước đó.',inputSchema:toolSchema({task_id:taskId,claim_token:claimToken,message:{type:'string'}}),annotations:{readOnlyHint:false,destructiveHint:false}}
];
export async function handleMcp(request,env){
 if(request.method!=='POST')return new Response('MCP uses POST',{status:405,headers:{Allow:'POST'}});
 let rpc;try{rpc=await body(request);}catch{return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}} ,400);}
 const reply=result=>json({jsonrpc:'2.0',id:rpc.id??null,result});
 const error=(code,message)=>json({jsonrpc:'2.0',id:rpc.id??null,error:{code,message}});
 if(rpc.jsonrpc!=='2.0'||typeof rpc.method!=='string')return error(-32600,'Invalid JSON-RPC request');
 if(rpc.method==='server/discover')return reply({supportedVersions:MCP_VERSIONS,capabilities:{tools:{}}});
 if(rpc.method==='initialize')return reply({protocolVersion:MCP_VERSIONS.includes(rpc.params?.protocolVersion)?rpc.params.protocolVersion:MCP_VERSIONS[0],capabilities:{tools:{}},serverInfo:{name:'valley-chibi-studio',version:'2.0.0'},instructions:'Codex thực hiện tác vụ do chủ dự án giao. Xưởng chỉ lưu và đồng bộ. Không gọi API mô hình, không tự duyệt.'});
 if(rpc.method.startsWith('notifications/')&&rpc.id===undefined)return new Response(null,{status:202});
 if(rpc.method==='ping')return reply({});
 if(rpc.method==='tools/list')return reply({tools:env.MCP_OAUTH?MCP_TOOLS.map(t=>({...t,securitySchemes:[{type:'oauth2',scopes:['studio:access']}],_meta:{securitySchemes:[{type:'oauth2',scopes:['studio:access']}]}})):MCP_TOOLS});
 if(rpc.method!=='tools/call')return error(-32601,'Method not found');
 const owner=request.headers.get('oai-authenticated-user-id');if(!owner)return reply({content:[{type:'text',text:'Đăng nhập qua plugin riêng của Xưởng để đồng bộ đúng tài khoản.'}],isError:true});
 const args=rpc.params?.arguments||{},name=rpc.params?.name;
 if(!MCP_TOOLS.some(t=>t.name===name))return error(-32602,'Unknown tool');
 if(!env.DB||!env.BUCKET)return reply({content:[{type:'text',text:'Kho dữ liệu chưa sẵn sàng.'}],isError:true});
 try{
  const schema=MCP_TOOLS.find(t=>t.name===name).inputSchema;for(const required of schema.required)if(!(required in args))throw fail(400,'Thiếu trường '+required);
  let result;
  switch(name){
  case 'studio_get_project':{const data=await readState(env,owner);result={...data,executionMode:'codex',externalModelCalls:false};break;}
  case 'studio_list_tasks':result={tasks:await listTasks(env,owner,args.episode_id)};break;
  case 'studio_get_task':result=await getTask(env,owner,args.task_id);break;
  case 'studio_claim_task':result=await claimTask(env,owner,args.task_id);break;
  case 'studio_report_progress':result=await reportProgress(env,owner,args.task_id,args.claim_token,args.message);break;
  case 'studio_read_resource':return reply({content:await readResource(env,owner,args.resource_id)});
  case 'studio_save_artifact':result=await saveArtifact(env,owner,args.task_id,args.claim_token,args);break;
  case 'studio_submit_result':result=await submitResult(env,owner,args.task_id,args.claim_token,args.output);break;
  case 'studio_fail_task':result=await closeTask(env,owner,args.task_id,args.claim_token,'error',args.message);break;
  }
  return reply({content:[{type:'text',text:JSON.stringify(result)}]});
 }catch(e){return reply({content:[{type:'text',text:e.status?e.message:'Không thể đồng bộ tác vụ. Thử lại sau.'}],isError:true});}
}

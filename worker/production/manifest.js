// Original production rules for this Studio. No provider SDK or model calls.
export const WORKFLOW_VERSION='rural-documentary/1.0';
export const CONTRACT_VERSION='1.0';
export const SKILL_VERSION='1.0.0';
const common=[
 {id:'grounding',label:'Nguồn và điều chưa biết',guide:'Dẫn nguồn đã đọc; tách quan sát, thông tin chủ dự án và giả định. Không nhận đã xem video từ URL.'},
 {id:'feasibility',label:'Khả năng quay thực tế',guide:'Đối chiếu nhân lực, thiết bị, hiện trạng và thời gian lao động; đánh dấu phần cần khảo sát.'},
 {id:'continuity',label:'Liên tục giữa các cảnh',guide:'Kiểm tra nhân vật, trang phục, đạo cụ, ánh sáng và trạng thái trước/sau hành động.'}
];
export const PRODUCTION_STAGES=[
 {id:'direction',role:'ceo',title:'Định hướng',inputs:['project','brief','resources'],produces:'direction',check:{id:'scope',label:'Phạm vi và tiêu chí bàn giao',guide:'Chốt thời lượng, phạm vi công việc, điều thiếu và tiêu chí hoàn thành quan sát được.'}},
 {id:'concept',role:'creative',title:'Concept',inputs:['direction','resources'],produces:'concept',check:{id:'differentiation',label:'Concept và ngôn ngữ hình ảnh',guide:'Có 2–3 phương án khác nhau thực chất; chọn một phương án có lý do, bám dữ kiện và khác reference.'}},
 {id:'script',role:'writer',title:'Kịch bản',inputs:['direction','concept','resources'],produces:'script',check:{id:'story_progression',label:'Hành động, nhịp kể và thời lượng',guide:'Có tiến triển và thành quả; tổng thời lượng shot trong ±5% mục tiêu, không kéo shot để đủ phút.'}},
 {id:'camera',role:'camera',title:'Shot list',inputs:['script','resources'],produces:'camera',check:{id:'coverage',label:'Đủ cảnh để dựng và âm thanh để nối',guide:'Mỗi shot có mục đích, bố cục và continuity; đủ cảnh nối, hành động và âm thanh cần thu.'}},
 {id:'design',role:'designer',title:'Hồ sơ quay',inputs:['script','camera','resources'],produces:'design',check:{id:'document_integrity',label:'Hình, shot và file bàn giao',guide:'Đúng ID, đúng ảnh và phiên bản; file đã đồng bộ thật, nhãn AI/reference rõ và nêu phần còn thiếu.'}}
].map((s,index)=>Object.freeze({...s,index,skillVersion:SKILL_VERSION,checks:[...common,s.check]}));
export const WORKFLOW=Object.freeze({id:WORKFLOW_VERSION,title:'Phim nông thôn · quay thực tế',contractVersion:CONTRACT_VERSION,skillVersion:SKILL_VERSION,maxRepairRounds:2,execution:'current_codex_session',externalModelCalls:false,stages:PRODUCTION_STAGES});
export function productionPolicy(){return {workflowVersion:WORKFLOW_VERSION,contractVersion:CONTRACT_VERSION,skillVersion:SKILL_VERSION,required:true,maxRepairRounds:WORKFLOW.maxRepairRounds};}

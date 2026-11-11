import {esc} from './ui.js';

export const panelNames=['Trên trái','Trên phải','Dưới trái','Dưới phải'];
export function storyboardBatches(ep){
 const list=ep.scenes.flatMap(scene=>scene.shots.map(shot=>({scene,shot})));
 const groups=[];for(let i=0;i<list.length;i+=4)groups.push(list.slice(i,i+4));return groups;
}
export function storyboardPrompt(project,ep,batch){
 return `Dùng tính năng tạo ảnh của ChatGPT để tạo storyboard cho ${ep.title}.\nMột ảnh contact sheet 2×2, kích thước tổng 16:9, bốn ô bằng nhau, mỗi ô 16:9. Không viền, không rãnh, không chữ hoặc số trên ảnh. Đọc lần lượt: trên trái, trên phải, dưới trái, dưới phải. Giữ nhân vật, trang phục, đạo cụ, màu sắc và hướng sáng nhất quán. Đây là storyboard AI để dự kiến quay.\nProject bible: ${project.bible}\nChỉ dùng ảnh bối cảnh/nhân vật đã thật sự đọc làm tham chiếu; nêu thông tin còn thiếu.\n${batch.map(({scene,shot},i)=>`Ô ${i+1} (${panelNames[i]}) — ${scene.id}/${shot.id}: ${scene.location}, ${scene.time}. ${shot.size}, ${shot.lens}, ${shot.move}. ${shot.action}. Ánh sáng: ${shot.light}.`).join('\n')}\n${batch.length<4?'Các ô còn lại để màu xám trơn, không tạo shot bổ sung.':''}\nSau khi tạo, nếu đang thực hiện đầu việc Designer đã nhận: lưu bằng studio_save_artifact với storyboard_shot_ids=${JSON.stringify(batch.map(x=>x.shot.id))}, encoding=base64, mime=image/jpeg hoặc image/png, tối đa 1 MB. Gọi tuần tự từng ảnh; nộp kết quả để tôi duyệt. Nếu file lớn hơn 1 MB hoặc công cụ không hỗ trợ trường này, tôi có thể tải ảnh lên mục “Nhập ảnh 4 shot” của Xưởng để cắt. Không gọi API mô hình ngoài.`;
}
export function boardAsset(state,ep,shot){
 const board=ep.storyboards?.[shot.id];
 if(board){const asset=state.assets.find(a=>a.id===board.assetId);if(asset?.mime.startsWith('image/'))return {asset,panel:board.panel,generated:board.generated!==false};}
 const asset=(shot.assetIds||[]).map(id=>state.assets.find(a=>a.id===id)).find(a=>a?.mime.startsWith('image/'));
 return asset?{asset,panel:null,generated:asset.category==='storyboard'}:null;
}
export function boardMarkup(board,source=board?.asset.url){
 if(!board||!source)return '';
 if(board.panel===null||board.panel===undefined)return `<img src="${esc(source)}" alt="${esc(board.asset.name)}" loading="lazy">`;
 const x=(board.panel%2)*1600,y=Math.floor(board.panel/2)*900;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} 1600 900" role="img" aria-label="${esc(board.asset.name+' · '+panelNames[board.panel])}"><image href="${esc(source)}" width="3200" height="1800" preserveAspectRatio="none"/></svg>`;
}
export function cropRects(width,height){
 const w=Math.floor(width/2),h=Math.floor(height/2);
 return [[0,0,w,h],[w,0,width-w,h],[0,h,w,height-h],[w,h,width-w,height-h]];
}
export async function splitStoryboard(file){
 if(!file?.type?.startsWith('image/'))throw new Error('Hãy chọn ảnh PNG, JPG hoặc WebP.');
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width<320||bitmap.height<180)throw new Error('Ảnh quá nhỏ để cắt 4 shot.');
  if(bitmap.width*bitmap.height>40000000)throw new Error('Ảnh vượt 40 megapixel. Hãy giảm kích thước trước khi cắt.');
  const output=[];
  for(const [x,y,w,h] of cropRects(bitmap.width,bitmap.height)){
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   canvas.getContext('2d').drawImage(bitmap,x,y,w,h,0,0,w,h);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));
   if(!blob)throw new Error('Trình duyệt chưa thể cắt ảnh này.');output.push(blob);
  }
  return output;
 }finally{bitmap.close();}
}

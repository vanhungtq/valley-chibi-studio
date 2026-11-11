export const esc=(s='')=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeUrl=(s='')=>{try{const u=new URL(s,location.origin);return ['https:','http:'].includes(u.protocol)?u.href:'#';}catch{return '#';}};
export const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.sparkles}</svg>`;
const ICONS={
 expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 leaf:'<path d="M20 3C9 2 3 8 5 15s15 5 15-12Z"/><path d="M4 21 15 10M9 15v-5m0 5h5"/>',
 mountain:'<path d="m2 20 8-15 5 9 3-6 5 12Z"/><path d="m7 11 3 3 3-3"/>',
 studio:'<path d="m3 9 9-6 9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-7h6v7M7 10h1m8 0h1"/>',
 film:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4m10 0h4M3 16h4m10 0h4M7 12h10"/>',
 folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/><path d="M3 11h18"/>',
 book:'<path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 2-3-2-6-3-9-2Z"/>',
 users:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-12a3 3 0 1 0-1-6m3 18v-3a6 6 0 0 0-3-5"/>',
 settings:'<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',down:'<path d="m6 9 6 6 6-6"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
 search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.7 2.7 0 0 1 5 1c0 2-2.5 2-2.5 4m0 3h.01"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
 edit:'<path d="m15 4 5 5-11 11-6 1 1-6ZM13 6l5 5"/>',pen:'<path d="m16 3 5 5-11 11-7 2 2-7ZM14 5l5 5M4 20l4-4"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',check:'<path d="m5 12 4 4L19 6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
 compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
 camera:'<path d="m8 6 1-3h6l1 3h4a1 1 0 0 1 1 1v13H3V7a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/>',
 layout:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
 message:'<path d="M21 4H3v14h5l4 4 4-4h5ZM7 9h10M7 13h6"/>',send:'<path d="m3 3 19 9-19 9 4-9Zm4 9h15"/>',paperclip:'<path d="m8 13 7-7a3 3 0 0 1 4 4L10 19a5 5 0 0 1-7-7L13 2m-7 13 9-9"/>',
 file:'<path d="M13 3H5v18h14V9Zm0 0v6h6M8 13h8M8 17h5"/>',image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 6"/>',
 board:'<rect x="2" y="4" width="20" height="15" rx="2"/><path d="M9 4v15M15 4v15M2 12h20"/>',play:'<path d="m8 4 13 8-13 8Z"/>',pause:'<path d="M8 4v16M16 4v16"/>',
 refresh:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/>',link:'<path d="m10 14 4-4m-7 6-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m4 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(2 -1)"/>',
 external:'<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 headphones:'<path d="M3 14V12a9 9 0 0 1 18 0v2M3 13h4v8H3Zm14 0h4v8h-4Z"/>',volume:'<path d="M3 9h4l5-5v16l-5-5H3Zm13-2a8 8 0 0 1 0 10m3-13a12 12 0 0 1 0 16"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
 cloud:'<path d="M7 19a5 5 0 1 1-1-10 7 7 0 0 1 13-1 5 5 0 0 1 0 11Z"/>',history:'<path d="M3 4v5h5M3 9a9 9 0 1 1 0 7M12 7v6l4 2"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
 print:'<path d="M6 8V3h12v5M6 17H3V8h18v9h-3M6 13h12v8H6Zm11-2h1"/>',list:'<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',mouse:'<rect x="5" y="2" width="14" height="20" rx="7"/><path d="M12 2v7"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 crop:'<path d="M6 2v16h16M2 6h16v16"/>',heart:'<path d="M20 4c-3-3-7-1-8 2-1-3-5-5-8-2s-1 8 8 16c9-8 11-13 8-16Z"/>',clipboard:'<path d="M8 5H4v16h16V5h-4M8 3h8v4H8Zm0 9h8m-8 4h5"/>'
};
export const avatar=(a,size='')=>`<span class="avatar ${size}" style="--accent:${a.color}"><span class="avatar-face"></span></span>`;
export const fmtTime=(date)=>{try{return new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'}).format(new Date(date));}catch{return '';}};
export const fmtDate=(date)=>{try{return new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(date));}catch{return '';}};
export const mmss=n=>Math.floor(n/60).toString().padStart(2,'0')+':'+Math.round(n%60).toString().padStart(2,'0');
export const bytes=n=>n>=1024*1024?(n/1024/1024).toFixed(1)+' MB':Math.round(n/1024)+' KB';
export function download(name,content,type='text/plain;charset=utf-8'){const a=document.createElement('a');a.href=URL.createObjectURL(content instanceof Blob?content:new Blob([content],{type}));a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000);}
export const button=(action,label,ico='',type='',extra='')=>`<button type="button" class="btn ${type}" data-action="${action}" ${extra}>${ico?icon(ico):''}${label}</button>`;

export function storyboardSvg(scene,shot){
 const number=parseInt(shot.id.replace(/\D/g,''))||1;
 const close=/cận|đặc tả/i.test(shot.size);
 const person=(x,y,scale=1)=>`<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-7 39-11 66M7 39l11 25M-10 15l-16 20M10 15l14 13"/><path d="M-11 10q11-7 22 0l3 30h-28Z" fill="#d7d5c6"/><circle cy="-3" r="11" fill="#f7f4e9"/><path d="M-10-7q10-16 20 0"/></g>`;
 const mountains='<path d="m-10 107 74-63 68 51 54-39 82 58 51-73 77 64" fill="#e4e5d7" stroke="#a3aa94"/><path d="m-8 123 82-38 92 43 85-44 120 50" fill="#d3d9c7" stroke="#a3aa94"/>';
 const house='<g><path d="m189 98 60-43 64 43Z" fill="#c9c6ae"/><path d="M199 98h104v68H199Z" fill="#e2ddc8"/><path d="M241 166v-45h28v45M210 113h22v24h-22ZM279 113h14v24h-14"/><path d="m189 98 126 0M205 148h96M205 154h96"/></g>';
 const tree=(x,y,s)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0v70"/><path d="m0 12-31 31h62Zm0-20-25 31h50Z" fill="#bdc8af" stroke="#929e83"/></g>`;
 let drawing='';
 if(scene.id==='SC01')drawing=mountains+house+tree(48,56,1)+tree(320,65,.7)+'<path d="M145 185q0-39 65-71" stroke="#b2ad96"/>'+person(125,116,.65)+person(157,120,.6);
 else if(scene.id==='SC02')drawing='<path d="M65 187V38h150v149M83 187V51h111v136M194 51l-63 12v124M239 65h68v65h-68ZM271 65v65M239 95h68" fill="#eee9d7"/><path d="M239 130 196 186h103l8-56" fill="#faf8e7" stroke="none"/>'+person(117,108,.7)+person(176,115,.65)+'<path d="M222 159h78m-68 0v26m56-26v26"/>';
 else if(scene.id==='SC03')drawing='<path d="M41 31h280v150H41ZM41 143h280M233 56h58v57h-58M262 56v57M233 84h58" fill="#ebe7d4"/>'+person(102,103,.85)+person(218,105,.8)+'<path d="m86 135-20 45m17-8-24 4m22-1-25 6M231 118l15-31m-3-9h13v11h-13"/>';
 else if(scene.id==='SC04')drawing=mountains+'<path d="m86 111 84-60 90 60M95 111v65m153-65v65M86 111h174" fill="#d6d7bd"/><path d="m119 89 36 24m-21-37 39 37m-18-51 40 51m-19-59 41 59m-20-44 43 44" stroke="#8b987a"/>'+person(112,119,.75)+person(237,118,.7)+'<path d="m135 157 57-16m-51 20 52-13m-49 16 55-10"/>';
 else if(scene.id==='SC05')drawing='<path d="M30 177h300M69 139h221v13H69Zm18 13v34m184-34v34M58 44h90v70H58ZM103 44v70M58 80h90" fill="#e2ddc8"/>'+person(208,92,.9)+'<path d="M105 138q-7-12-5-30h58q3 19-4 30M94 108h70M126 108V98m-12-5q-12-12 0-23m18 23q-12-12 0-23m18 23q-12-12 0-23"/><ellipse cx="265" cy="139" rx="27" ry="7" fill="#c8d2b6"/>';
 else drawing=mountains+house+'<path d="M41 151h139m-124 0v34m111-34v34" fill="#d7cfb7"/>'+person(64,98,.75)+person(145,101,.72)+'<ellipse cx="106" cy="147" rx="16" ry="4" fill="#eee8d4"/><circle cx="309" cy="36" r="14" fill="#e6d5a6" stroke="none"/>';
 if(close){drawing=`<g transform="translate(-${number%2?40:160} -${number%3?25:75}) scale(1.55)">${drawing}</g>`;}
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 202" role="img" aria-label="Sơ đồ bố cục minh họa ${esc(shot.id)}"><defs><pattern id="p${number}" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6 6 0" stroke="#e1dece" stroke-width=".4"/></pattern><clipPath id="c${number}"><rect width="360" height="202"/></clipPath></defs><rect width="360" height="202" fill="#f4f1e5"/><rect width="360" height="202" fill="url(#p${number})"/><g clip-path="url(#c${number})" fill="none" stroke="#8d927c" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${drawing}</g><path d="M120 0v202M240 0v202M0 67h360M0 135h360" stroke="#b1b59f" stroke-width=".5" opacity=".3" stroke-dasharray="3 5"/><path d="M12 25V12h13m310 0h13v13M12 177v13h13m310 0h13v-13" fill="none" stroke="#909980" stroke-width="1.4"/></svg>`;
}

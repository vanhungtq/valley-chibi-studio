const KEY='valley-theme';
let preference='system';
try{preference=window.localStorage?.getItem(KEY)||'system';}catch{}
if(!['light','dark','system'].includes(preference))preference='system';
const media=window.matchMedia?.('(prefers-color-scheme: dark)');
export const themePreference=()=>preference;
export const currentTheme=()=>preference==='system'?(media?.matches?'dark':'light'):preference;
export function applyTheme(){
 const theme=currentTheme();document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#111a19':'#294b3e');
 refreshThemeControls();window.dispatchEvent(new window.CustomEvent('valley-theme-change',{detail:{theme,preference}}));
}
export function setTheme(value){if(!['light','dark','system'].includes(value))return;preference=value;try{window.localStorage?.setItem(KEY,value);}catch{}applyTheme();}
export function toggleTheme(){setTheme(currentTheme()==='dark'?'light':'dark');}
export function refreshThemeControls(){const dark=currentTheme()==='dark';for(const button of document.querySelectorAll('[data-action="toggle-theme"]')){button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',dark?'Chuyển sang giao diện sáng':'Chuyển sang giao diện tối');button.title=dark?'Giao diện tối · Chuyển sang sáng':'Giao diện sáng · Chuyển sang tối';button.innerHTML=dark?'<span aria-hidden="true">☀</span>':'<span aria-hidden="true">☾</span>';}const select=document.querySelector('#theme-preference');if(select)select.value=preference;}
media?.addEventListener?.('change',()=>{if(preference==='system')applyTheme();});
applyTheme();

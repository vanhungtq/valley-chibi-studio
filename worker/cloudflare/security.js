export const SCOPE='studio:access';
export const SESSION_COOKIE='__Host-valley-session';
export const LOGIN_COOKIE='__Host-valley-login';
export const esc=(value='')=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
export async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');}
export function publicOrigin(env){const value=String(env.PUBLIC_ORIGIN||'').trim();let url;try{url=new URL(value);}catch{throw Object.assign(new Error('Thiết lập PUBLIC_ORIGIN bằng URL HTTPS chính thức của Worker.'),{status:503});}if(url.protocol!=='https:'||url.origin!==value||url.username||url.password)throw Object.assign(new Error('PUBLIC_ORIGIN phải là một HTTPS origin, không có dấu / cuối hoặc đường dẫn.'),{status:503});return value;}
export function allowedUser(user,env){const ids=String(env.GITHUB_ALLOWED_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);const logins=String(env.GITHUB_ALLOWED_LOGINS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);return !!user&&/^github:\d+$/.test(user.id||'')&&(ids.includes(user.id.slice(7))||logins.includes(String(user.login||'').toLowerCase()));}
export function cookieValue(request,name){const pair=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));return pair?pair.slice(name.length+1):'';}
export const cookie=(name,value,maxAge)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
export async function createSession(user,env,headers){const token=randomToken();await env.OAUTH_KV.put('studio:session:'+await hash(token),JSON.stringify(user),{expirationTtl:7*86400});headers.append('Set-Cookie',cookie(SESSION_COOKIE,token,7*86400));}
export async function readSession(request,env){const token=cookieValue(request,SESSION_COOKIE);if(!/^[a-f0-9]{64}$/.test(token))return null;const value=await env.OAUTH_KV?.get('studio:session:'+await hash(token));if(!value)return null;try{const user=JSON.parse(value);return allowedUser(user,env)?user:null;}catch{return null;}}
export async function destroySession(request,env){const token=cookieValue(request,SESSION_COOKIE);if(/^[a-f0-9]{64}$/.test(token))await env.OAUTH_KV.delete('studio:session:'+await hash(token));return cookie(SESSION_COOKIE,'',0);}
export function requireSameOrigin(request,env){if(request.headers.get('origin')!==publicOrigin(env))throw Object.assign(new Error('Yêu cầu thay đổi dữ liệu phải đến từ chính giao diện Xưởng.'),{status:403});}
export function identityRequest(request,user){const headers=new Headers(request.headers);for(const key of [...headers.keys()])if(key.startsWith('oai-authenticated-'))headers.delete(key);headers.set('oai-authenticated-user-id',user.id);headers.set('oai-authenticated-user-full-name',encodeURIComponent(user.name||user.login));return new Request(request,{headers});}
export function safeReturnPath(value){return typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')&&!/[\\\r\n]/.test(value)?value:'/';}
// Preserve same-origin form Origin; no-referrer makes HTML POST send Origin: null.
// same-origin still omits the Referer when navigating to another origin.
export function secureResponse(response,{html=false,formActionOrigins=[]}={}){
 const headers=new Headers(response.headers);
 headers.set('X-Content-Type-Options','nosniff');
 headers.set('Referrer-Policy','same-origin');
 if(html){
  // Only the consent page supplies extra origins, from the OAuth request that
  // the provider has already validated. Other application forms stay on self.
  const formSources=[...new Set(["'self'",...formActionOrigins.flatMap(value=>{
   try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?[url.origin]:[];}
   catch{return [];}
  })])].join(' ');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action "+formSources);
  headers.set('X-Frame-Options','DENY');
 }
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export function authPage(title,content,status=200,headers={},responseOptions={}){const all=new Headers(headers);all.set('Content-Type','text/html; charset=utf-8');all.set('Cache-Control','no-store');return secureResponse(new Response(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Valley Studio</title><link rel="stylesheet" href="/style.css"></head><body><main style="max-width:660px;margin:8vh auto;padding:30px"><h1>${esc(title)}</h1>${content}</main></body></html>`,{status,headers:all}),{...responseOptions,html:true});}

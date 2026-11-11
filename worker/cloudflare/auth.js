import {AuthorizationError,CimdFetchError,authorizationErrorRedirect} from '@cloudflare/workers-oauth-provider';
import {SCOPE,LOGIN_COOKIE,esc,randomToken,hash,cookie,cookieValue,publicOrigin,safeReturnPath,readSession,createSession,destroySession,requireSameOrigin,authPage} from './security.js';
import {githubAuthorize,githubIdentity} from './github.js';

async function complete(oauth,authRequest,user,headers,env){if(!authRequest.scope.includes(SCOPE))throw Object.assign(new Error('Kết nối cần quyền studio:access.'),{status:400});const {redirectTo}=await oauth.completeAuthorization({request:authRequest,userId:encodeURIComponent(user.id),metadata:{label:user.login},scope:authRequest.scope,props:user});await createSession(user,env,headers);headers.set('Location',redirectTo);return new Response(null,{status:302,headers});}
export async function handleAuth(request,env){const url=new URL(request.url),oauth=env.OAUTH_PROVIDER;
 try{
  if(url.pathname==='/signin-with-chatgpt')return Response.redirect(publicOrigin(env)+'/auth/login?return_to='+encodeURIComponent(safeReturnPath(url.searchParams.get('return_to'))),302);
  if(url.pathname==='/auth/login'&&request.method==='GET'){
   const state=randomToken(),verifier=randomToken()+randomToken(),location=await githubAuthorize(env,state,verifier);
   await env.OAUTH_KV.put('studio:login:'+await hash(state),JSON.stringify({verifier,returnTo:safeReturnPath(url.searchParams.get('return_to'))}),{expirationTtl:600});
   return new Response(null,{status:302,headers:{Location:location,'Set-Cookie':cookie(LOGIN_COOKIE,state,600),'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/auth/logout'&&request.method==='POST'){requireSameOrigin(request,env);return Response.json({ok:true},{headers:{'Set-Cookie':await destroySession(request,env),'Cache-Control':'no-store'}});}
  if(url.pathname==='/authorize'&&request.method==='GET'){
   const authRequest=await oauth.parseAuthRequest(request),details=await oauth.describeConsent(authRequest),consent=await oauth.beginConsent(authRequest);
   const publisher=details.clientDomain?`Được công bố bởi <strong>${esc(details.clientDomain)}</strong>.`:'Tên ứng dụng do bên đăng ký tự khai báo.';
   return authPage('Cho phép kết nối với Xưởng?',`<p><strong>${esc(details.clientName)}</strong> muốn truy cập Valley Chibi Studio.</p><p>${publisher}</p><p>Nơi nhận kết nối: <strong>${esc(details.redirectHost)}</strong>.</p>${details.redirectIsLoopback?'<p>Đây là ứng dụng chạy trên máy của bạn. Chỉ tiếp tục khi bạn vừa bắt đầu kết nối.</p>':''}<p>Quyền studio:access cho phép đọc tư liệu, nhận đầu việc, báo tiến độ và nộp kết quả. Kết quả vẫn chờ bạn duyệt trong Xưởng.</p><ul>${authRequest.scope.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><form method="post" action="/authorize"><input type="hidden" name="handle" value="${esc(consent.handle)}"><button class="btn primary" name="decision" value="approve">Cho phép & đăng nhập GitHub</button> <button class="btn" name="decision" value="deny">Từ chối</button></form>`,200,consent.headers,{formActionOrigins:['https://github.com',new URL(authRequest.redirectUri).origin]});
  }
  if(url.pathname==='/authorize'&&request.method==='POST'){
   requireSameOrigin(request,env);const form=await request.formData(),handle=String(form.get('handle')||'');
   if(form.get('decision')!=='approve'){const denied=await oauth.denyConsent(request,handle);return new Response(null,{status:302,headers:denied.headers});}
   const approved=await oauth.approveConsent(request,handle);const user=await readSession(request,env);
   if(user)return complete(oauth,approved.request,user,approved.headers,env);
   const verifier=randomToken()+randomToken();const upstream=await oauth.beginUpstream(approved.request,{data:{verifier},headers:approved.headers});upstream.headers.set('Location',await githubAuthorize(env,upstream.state,verifier));return new Response(null,{status:302,headers:upstream.headers});
  }
  if(url.pathname==='/auth/callback'&&request.method==='GET'){
   const state=url.searchParams.get('state')||'',browserState=cookieValue(request,LOGIN_COOKIE);
   if(state&&state===browserState&&/^[a-f0-9]{64}$/.test(state)){
    const key='studio:login:'+await hash(state),record=await env.OAUTH_KV.get(key);if(!record)throw Object.assign(new Error('Phiên đăng nhập hết hạn. Hãy bắt đầu lại.'),{status:400});await env.OAUTH_KV.delete(key);
    if(url.searchParams.has('error'))throw Object.assign(new Error('Bạn chưa cho phép đăng nhập GitHub.'),{status:400});const data=JSON.parse(record),user=await githubIdentity(env,url.searchParams.get('code'),data.verifier),headers=new Headers({'Cache-Control':'no-store'});headers.append('Set-Cookie',cookie(LOGIN_COOKIE,'',0));await createSession(user,env,headers);headers.set('Location',publicOrigin(env)+safeReturnPath(data.returnTo));return new Response(null,{status:302,headers});
   }
   const upstream=await oauth.finishUpstream(request);if(url.searchParams.has('error')){upstream.headers.set('Location',authorizationErrorRedirect(upstream.request,'access_denied'));return new Response(null,{status:302,headers:upstream.headers});}
   const user=await githubIdentity(env,url.searchParams.get('code'),upstream.data.verifier);return complete(oauth,upstream.request,user,upstream.headers,env);
  }
  return null;
 }catch(error){if(error instanceof AuthorizationError&&error.redirectTo)return Response.redirect(error.redirectTo,302);if(error instanceof AuthorizationError||error instanceof CimdFetchError)return authPage('Kết nối chưa hoàn tất','<p>Yêu cầu kết nối không hợp lệ hoặc đã hết hạn. Hãy bắt đầu lại từ ChatGPT/Codex.</p>',400);if(error.status)return authPage('Chưa thể đăng nhập',`<p>${esc(error.message)}</p><p><a href="/">Về Xưởng</a></p>`,error.status);throw error;}
}

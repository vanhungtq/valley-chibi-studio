import OAuthProvider from '@cloudflare/workers-oauth-provider';
import {handleApi} from './api.js';
import {handleMcp} from './mcp.js';
import {handleAuth} from './cloudflare/auth.js';
import {fileStorageEnv} from './cloudflare/file-storage.js';
import {receiveLibraryUpload} from './library-uploads.js';
import {SCOPE,publicOrigin,allowedUser,readSession,identityRequest,requireSameOrigin,secureResponse} from './cloudflare/security.js';

export async function appHandler(request,env,ctx){
 const url=new URL(request.url),path=url.pathname;
 if(path.startsWith('/api/library-uploads/'))return receiveLibraryUpload(request,env,user=>allowedUser(user,env));
 const auth=await handleAuth(request,env);if(auth)return auth;
 if(path==='/api/config'){
  const user=await readSession(request,env);return Response.json({executionMode:'codex',externalModelCalls:false,authProvider:'github',mcpUrl:publicOrigin(env)+'/mcp',loginUrl:'/auth/login',logoutUrl:'/auth/logout',signedIn:!!user,displayName:user?.name||'Nhà sáng tạo',bridgeReady:!!env.DB&&!!env.BUCKET&&!!env.OAUTH_KV,storageReady:!!env.DB&&!!env.BUCKET,storageProvider:env.FILE_STORAGE_DRIVER,maxUploadBytes:env.FILE_MAX_BYTES},{headers:{'Cache-Control':'no-store'}});
 }
 if(path.startsWith('/api/')){
  const user=await readSession(request,env);if(!user)return Response.json({error:'Đăng nhập GitHub để mở dữ liệu Xưởng.'},{status:401,headers:{'Cache-Control':'no-store'}});
  if(!['GET','HEAD'].includes(request.method))requireSameOrigin(request,env);
  return handleApi(identityRequest(request,user),env);
 }
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 const target=new URL(request.url);if(path==='/install.html')target.pathname='/cloudflare.html';if(path==='/install-prompt.txt')target.pathname='/cloudflare-install-prompt.txt';
 const response=await env.ASSETS.fetch(new Request(target,request));return secureResponse(response,{html:(response.headers.get('content-type')||'').includes('text/html')});
}
export const mcpHandler={async fetch(request,env,ctx){
 if(!allowedUser(ctx.props,env))return Response.json({error:'Tài khoản không còn được cấp quyền.'},{status:403});
 if(!ctx.auth?.scope?.includes(SCOPE))return new Response('Missing studio:access scope',{status:403,headers:{'WWW-Authenticate':`Bearer error="insufficient_scope", scope="${SCOPE}"`}});
 const origin=request.headers.get('origin');if(origin&&origin!==publicOrigin(env))return new Response('Origin not allowed',{status:403});
 return handleMcp(identityRequest(request,ctx.props),{...env,MCP_OAUTH:true,MCP_IDENTITY:ctx.props});
}};
function provider(env){const origin=publicOrigin(env);return new OAuthProvider({apiRoute:origin+'/mcp',apiHandler:mcpHandler,defaultHandler:{fetch:appHandler},authorizeEndpoint:origin+'/authorize',tokenEndpoint:origin+'/oauth/token',clientRegistrationEndpoint:origin+'/oauth/register',scopesSupported:[SCOPE,'offline_access'],requiredScopes:[SCOPE],resourceMetadata:{resource:origin+'/mcp',authorization_servers:[origin]},clientIdMetadataDocumentEnabled:true,accessTokenTTL:3600,refreshTokenTTL:30*86400});}
export default {async fetch(request,env,ctx){
 env=fileStorageEnv(env);
 try{
  const path=new URL(request.url).pathname;
  if(path==='/healthz'){
   let databaseReady=false,libraryUploadsReady=false;try{databaseReady=!!(await env.DB?.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='codex_tasks'").first());if(databaseReady)await env.DB.prepare('SELECT review, review_attempts FROM codex_tasks LIMIT 1').all();libraryUploadsReady=!!(await env.DB?.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='library_uploads'").first());}catch{databaseReady=false;}
   const authConfigured=!!env.PUBLIC_ORIGIN&&!!env.GITHUB_CLIENT_ID&&!!env.GITHUB_CLIENT_SECRET&&!!(env.GITHUB_ALLOWED_IDS||env.GITHUB_ALLOWED_LOGINS);
   return Response.json({service:'valley-chibi-studio',version:'2.1.2',transport:'streamable-http',mcpPath:'/mcp',databaseReady,libraryUploadsReady,filesReady:!!env.BUCKET,storageProvider:env.FILE_STORAGE_DRIVER,maxUploadBytes:env.FILE_MAX_BYTES,oauthStorageReady:!!env.OAUTH_KV,authConfigured},{status:databaseReady&&libraryUploadsReady&&authConfigured&&!!env.BUCKET&&!!env.OAUTH_KV?200:503,headers:{'Cache-Control':'no-store'}});
  }
  // Without setup, static UI/help remains available; identity APIs fail closed.
  if(!env.PUBLIC_ORIGIN){if(!path.startsWith('/api/')&&!path.startsWith('/auth/')&&!path.startsWith('/oauth/')&&!['/mcp','/authorize'].includes(path)&&!path.startsWith('/.well-known/'))return appHandler(request,env,ctx);return Response.json({error:'Thiết lập PUBLIC_ORIGIN trong Worker Settings → Variables and Secrets. Xem /cloudflare.html.'},{status:503});}
  const origin=publicOrigin(env);if(new URL(request.url).origin!==origin)return new Response('Use the configured PUBLIC_ORIGIN',{status:421});
  if(!env.OAUTH_KV)return Response.json({error:'Thiếu KV binding OAUTH_KV.'},{status:503});
  return secureResponse(await provider(env).fetch(request,env,ctx));
 }catch(error){if(error.status)return Response.json({error:error.message},{status:error.status});console.error('studio_request_failed',error.name,String(error.stack||'').split('\n').slice(1,5).join('\n'));return Response.json({error:'Xưởng chưa thể xử lý yêu cầu. Kiểm tra cấu hình và migration trong hướng dẫn Cloudflare.'},{status:500});}
}};

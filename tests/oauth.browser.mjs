import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import mfPackage from 'miniflare';
import {s256} from '../worker/cloudflare/github.js';
import {esc} from '../worker/cloudflare/security.js';

const {Miniflare,convertV4MiniflareOptions}=mfPackage;
const ORIGIN='https://studio.test',CLIENT='https://client.test/callback',ATTACKER='https://attacker.test';

test('real browser OAuth consent submits its own Origin and rejects foreign/opaque origins',async t=>{
 let mf,browser;
 t.after(async()=>{await browser?.close();await mf?.dispose();});
 mf=new Miniflare(convertV4MiniflareOptions({workers:[{
  name:'studio',modules:true,scriptPath:'.cloudflare-build/cloudflare.js',compatibilityDate:'2026-11-11',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],
  kvNamespaces:['OAUTH_KV','FILES_KV'],d1Databases:['DB'],
  bindings:{PUBLIC_ORIGIN:ORIGIN,GITHUB_ALLOWED_IDS:'123',GITHUB_CLIENT_ID:'browser-fixture',GITHUB_CLIENT_SECRET:'browser-fixture-secret'},
  serviceBindings:{ASSETS:request=>new Response('',{headers:{'content-type':new URL(request.url).pathname.endsWith('.css')?'text/css':'text/html'}})},
  outboundService:async request=>{
   const url=new URL(request.url);
   if(url.origin==='https://github.com'&&url.pathname==='/login/oauth/access_token'){
    const form=new URLSearchParams(await request.text());assert.equal(form.get('client_secret'),'browser-fixture-secret');assert.ok(form.get('code_verifier').length>=43);
    return Response.json({access_token:'fixture-token'});
   }
   if(url.origin==='https://api.github.com'&&url.pathname==='/user')return Response.json({id:123,login:'alice',name:'Alice'});
   throw new Error('Unexpected browser-test upstream');
  }
 }]}));
 const db=await mf.getD1Database('DB','studio');
 for(const name of ['0000_studio.sql','0001_codex_tasks.sql']){
  const sql=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8');
  for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 }
 const dispatch=(path,options={})=>mf.dispatchFetch(new URL(path,ORIGIN),{...options,redirect:'manual'});
 const registered=await dispatch('/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Browser regression',redirect_uris:[CLIENT],grant_types:['authorization_code'],response_types:['code'],token_endpoint_auth_method:'none'})});
 assert.equal(registered.status,201);const client=await registered.json(),verifier='v'.repeat(64),challenge=await s256(verifier);
 const authorize=state=>ORIGIN+'/authorize?'+new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:CLIENT,scope:'studio:access',state,code_challenge:challenge,code_challenge_method:'S256',resource:ORIGIN+'/mcp'});
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}: {})});
 const context=await browser.newContext(),posts=[];
 const freshPage=async()=>{
  const page=await context.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(10000);
  if(process.env.OAUTH_BROWSER_DEBUG){
   page.on('console',message=>{if(message.type()==='error')console.log('browser error:',message.text().replace(/https?:\/\/[^\s"']+/g,'[URL]'));});
   page.on('requestfailed',request=>console.log('request failed:',request.method(),new URL(request.url()).pathname,request.failure()?.errorText));
  }
  return page;
 };
 let page=await freshPage();
 // Chromium does not re-route every hop of a fulfilled redirect chain. Keep
 // it offline so OAuth redirects cannot contact a real external service.
 // Local Worker requests are still fulfilled through Miniflare below.
 await context.setOffline(true);
 await context.route(ORIGIN+'/**',async route=>{
  const request=route.request(),headers=await request.allHeaders();
  if(new URL(request.url()).pathname==='/authorize'&&request.method()==='POST')posts.push({origin:headers.origin});
  const response=await mf.dispatchFetch(request.url(),{method:request.method(),headers,body:request.postDataBuffer()||undefined,redirect:'manual'});
  if(process.env.OAUTH_BROWSER_DEBUG)console.log('worker response:',request.method(),new URL(request.url()).pathname,response.status,'cookies:',response.headers.getSetCookie().length);
  const outgoing=Object.fromEntries([...response.headers].filter(([name])=>name!=='set-cookie'));
  const cookies=response.headers.getSetCookie();if(cookies.length)outgoing['set-cookie']=cookies.join('\n');
  await route.fulfill({status:response.status,headers:outgoing,body:Buffer.from(await response.arrayBuffer())});
 });
 const pressConsent=async(label,destination)=>{
  const failed=page.waitForEvent('requestfailed',{predicate:request=>new URL(request.url()).origin===destination});failed.catch(()=>{});
  const response=page.waitForResponse(response=>response.url()===ORIGIN+'/authorize'&&response.request().method()==='POST');
  await page.getByRole('button',{name:label,exact:true}).click({noWaitAfter:true});
  const submitted=await response;
  assert.equal(posts.at(-1).origin,ORIGIN,'same-origin HTML consent must not submit Origin: null');assert.equal(submitted.status(),302);
  const redirected=await failed;
  assert.equal(redirected.failure().errorText,'net::ERR_INTERNET_DISCONNECTED','redirect must pass CSP and reach the intended external origin');
  assert.equal(redirected.headers().referer,undefined,'cross-origin navigation must not leak the consent URL');
  // Avoid a pending Chromium offline error-page navigation racing the next
  // scenario. Cookies remain in the shared browser context.
  await page.close();page=await freshPage();
  return submitted;
 };
 await page.goto(authorize('browser-state'));
 const submitted=await pressConsent('Cho phép & đăng nhập GitHub','https://github.com');
 const github=new URL(submitted.headers().location);assert.equal(github.searchParams.get('code_challenge_method'),'S256');
 // Simulate the external GitHub login, then let the browser process the real
 // callback response and cookies. Its final client redirect stays offline.
 const callbackResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/auth/callback');
 await assert.rejects(page.goto(ORIGIN+'/auth/callback?'+new URLSearchParams({state:github.searchParams.get('state'),code:'fixture-code'})),/ERR_INTERNET_DISCONNECTED/);
 const completed=await callbackResponse;assert.equal(completed.status(),302);
 await page.close();page=await freshPage();
 const callback=new URL(completed.headers().location);assert.equal(callback.searchParams.get('state'),'browser-state');assert.ok(callback.searchParams.get('code'));
 const exchanged=await dispatch('/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,code:callback.searchParams.get('code'),redirect_uri:CLIENT,code_verifier:verifier,resource:ORIGIN+'/mcp'}).toString()});
 assert.equal(exchanged.status,200);
 const token=await exchanged.json(),project=await dispatch('/mcp',{method:'POST',headers:{authorization:'Bearer '+token.access_token,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'studio_get_project',arguments:{}}})});
 assert.equal(project.status,200);assert.equal((await project.json()).result.isError,undefined);

 // A user already signed in to the Studio redirects straight to the client.
 await page.goto(authorize('already-signed-in'));
 const signedIn=await pressConsent('Cho phép & đăng nhập GitHub',new URL(CLIENT).origin);
 assert.ok(new URL(signedIn.headers().location).searchParams.get('code'));
 await page.goto(authorize('denied-by-user'));
 const deniedByUser=await pressConsent('Từ chối',new URL(CLIENT).origin);
 assert.equal(new URL(deniedByUser.headers().location).searchParams.get('error'),'access_denied');

 // The consent page must not permit form destinations beyond its own client.
 await page.goto(authorize('blocked-destination'));
 let escaped=false;
 await context.route('https://unapproved.test/**',route=>{escaped=true;return route.fulfill({body:'Unexpected destination'});});
 await page.locator('form').evaluate(form=>{form.action='https://unapproved.test/steal';});
 const cspBlocked=page.waitForEvent('console',{predicate:message=>message.type()==='error'&&message.text().includes('form-action')});
 await page.getByRole('button',{name:'Cho phép & đăng nhập GitHub'}).click({noWaitAfter:true});await cspBlocked;
 assert.equal(escaped,false);assert.equal(new URL(page.url()).origin,ORIGIN);
 await page.close();page=await freshPage();

 // An attack must fail even if it somehow knows a real pending consent handle.
 for(const policy of ['strict-origin-when-cross-origin','no-referrer']){
  await page.goto(authorize('attack-'+policy));
  const handle=await page.locator('[name="handle"]').inputValue();
  await context.route(ATTACKER+'/**',route=>route.fulfill({headers:{'content-type':'text/html','referrer-policy':policy},body:`<form method="post" action="${ORIGIN}/authorize"><input name="handle" value="${esc(handle)}"><button name="decision" value="approve">Attack</button></form>`}));
  await page.goto(ATTACKER+'/attack');
  const denied=page.waitForResponse(response=>response.url()===ORIGIN+'/authorize'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Attack',exact:true}).click({noWaitAfter:true});
  assert.equal((await denied).status(),403);assert.equal(posts.at(-1).origin,policy==='no-referrer'?'null':ATTACKER);
  await context.unroute(ATTACKER+'/**');
  await page.close();page=await freshPage();
 }
});

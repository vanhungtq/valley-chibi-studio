import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import mfPackage from 'miniflare';
import {s256} from '../worker/cloudflare/github.js';
import {sampleOutput} from '../worker/api.js';
import {reviewedOutput} from './production-fixtures.mjs';
import {seedEpisode} from '../public/data.js';
const {Miniflare,convertV4MiniflareOptions}=mfPackage;
const ORIGIN='https://studio.test';let mf;
class CookieJar{values=new Map();take(response){const list=response.headers.getSetCookie?.()||[response.headers.get('set-cookie')].filter(Boolean);for(const value of list){const pair=value.split(';')[0],i=pair.indexOf('=');if(/Max-Age=0(?:;|$)/i.test(value))this.values.delete(pair.slice(0,i));else this.values.set(pair.slice(0,i),pair.slice(i+1));}}header(){return [...this.values].map(([k,v])=>k+'='+v).join('; ');}}
async function request(path,options={},jar){const headers=new Headers(options.headers);if(jar)headers.set('cookie',jar.header());if(options.body instanceof FormData){const encoded=new Request(new URL(path,ORIGIN),{...options,headers});headers.set('content-type',encoded.headers.get('content-type'));options={...options,body:await encoded.arrayBuffer()};}const response=await mf.dispatchFetch(new URL(path,ORIGIN),{...options,headers,redirect:'manual'});jar?.take(response);return response;}
async function githubLogin(jar,code='alice'){const login=await request('/auth/login',{},jar);assert.equal(login.status,302);const target=new URL(login.headers.get('location'));assert.equal(target.origin,'https://github.com');assert.equal(target.searchParams.get('code_challenge_method'),'S256');return request('/auth/callback?'+new URLSearchParams({state:target.searchParams.get('state'),code}),{},jar);}
before(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'studio',modules:true,scriptPath:'.cloudflare-build/cloudflare.js',compatibilityDate:'2026-11-11',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],kvNamespaces:['OAUTH_KV','FILES_KV'],d1Databases:['DB'],bindings:{PUBLIC_ORIGIN:ORIGIN,GITHUB_ALLOWED_LOGINS:'alice',GITHUB_CLIENT_ID:'test-client',GITHUB_CLIENT_SECRET:'test-secret'},serviceBindings:{ASSETS:()=>new Response('<html>app</html>',{headers:{'content-type':'text/html'}})},outboundService:async request=>{const url=new URL(request.url);if(url.origin==='https://github.com'&&url.pathname==='/login/oauth/access_token'){const data=new URLSearchParams(await request.text());assert.equal(data.get('client_secret'),'test-secret');assert.ok(data.get('code_verifier').length>=43);return Response.json({access_token:'mock-'+data.get('code')});}if(url.origin==='https://api.github.com'&&url.pathname==='/user'){const alice=request.headers.get('authorization')==='Bearer mock-alice';return Response.json({id:alice?123:456,login:alice?'alice':'mallory',name:alice?'Alice':'Mallory'});}throw new Error('Unexpected outbound request '+url.origin+url.pathname);}}]}));
 const db=await mf.getD1Database('DB','studio');for(const file of ['0000_studio.sql','0001_codex_tasks.sql','0002_production_review.sql','0003_library_uploads.sql']){const sql=await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8');for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();}
});
after(async()=>{await mf?.dispose();});
test('Cloudflare entry protects API/MCP, publishes OAuth discovery and serves the app with CSP',async()=>{const response=await request('/api/state',{headers:{'oai-authenticated-user-id':'victim'}});assert.equal(response.status,401);const mcp=await request('/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}),headers:{'content-type':'application/json','oai-authenticated-user-id':'victim'}});assert.equal(mcp.status,401);assert.match(mcp.headers.get('www-authenticate'),/oauth-protected-resource/);const metadata=await(await request('/.well-known/oauth-authorization-server')).json();assert.ok(metadata.code_challenge_methods_supported.includes('S256'));assert.equal(metadata.registration_endpoint,ORIGIN+'/oauth/register');assert.equal((await(await request('/healthz')).json()).databaseReady,true);assert.match((await request('/')).headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal((await mf.dispatchFetch('https://wrong.test/api/config')).status,421);});
test('browser login rejects callback theft and non-allowed GitHub users; API session is isolated and CSRF checked',async()=>{const jar=new CookieJar(),start=await request('/auth/login',{},jar),upstream=new URL(start.headers.get('location'));assert.equal((await request('/auth/callback?state='+upstream.searchParams.get('state')+'&code=alice')).status,400);assert.equal((await githubLogin(new CookieJar(),'mallory')).status,403);assert.equal((await githubLogin(jar)).status,302);assert.equal((await(await request('/api/config',{},jar)).json()).signedIn,true);const state=await(await request('/api/state',{},jar)).json();state.state.project.name='Cloudflare Alice';assert.equal((await request('/api/state',{method:'PUT',headers:{Origin:'https://evil.test','content-type':'application/json'},body:JSON.stringify(state)},jar)).status,403);assert.equal((await request('/api/state',{method:'PUT',headers:{Origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify(state)},jar)).status,200);assert.equal((await request('/api/state')).status,401);});
test('OAuth consent, GitHub login, PKCE token, refresh token and MCP tools share browser identity',async()=>{
 const registered=await request('/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Test client <script>',redirect_uris:['https://client.test/callback'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})});assert.equal(registered.status,201);const client=await registered.json();
 const verifier='a'.repeat(64),authorize='/authorize?'+new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:'https://client.test/callback',scope:'studio:access offline_access',state:'client-state',code_challenge:await s256(verifier),code_challenge_method:'S256',resource:ORIGIN+'/mcp'}),jar=new CookieJar();
 const page=await request(authorize,{},jar);assert.equal(page.status,200);const html=await page.text();assert.ok(html.includes('Test client &lt;script&gt;'));assert.ok(!html.includes('Test client <script>'));const handle=html.match(/name="handle" value="([^"]+)"/)[1];
 assert.equal((await request('/authorize',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',Origin:ORIGIN},body:new URLSearchParams({handle,decision:'approve'}).toString()})).status,400);
 const approve=await request('/authorize',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',Origin:ORIGIN},body:new URLSearchParams({handle,decision:'approve'}).toString()},jar);assert.equal(approve.status,302);const github=new URL(approve.headers.get('location'));assert.equal(github.origin,'https://github.com');
 const callback=await request('/auth/callback?'+new URLSearchParams({state:github.searchParams.get('state'),code:'alice'}),{},jar);assert.equal(callback.status,302,await callback.clone().text());const result=new URL(callback.headers.get('location'));assert.equal(result.searchParams.get('state'),'client-state');assert.equal(result.searchParams.get('iss'),ORIGIN);
 const exchange=await request('/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:result.searchParams.get('code'),client_id:client.client_id,redirect_uri:'https://client.test/callback',code_verifier:verifier,resource:ORIGIN+'/mcp'}).toString()});assert.equal(exchange.status,200,await exchange.clone().text());const token=await exchange.json();assert.ok(token.refresh_token);
 const rpc=async(method,params={})=>{const response=await request('/mcp',{method:'POST',headers:{authorization:'Bearer '+token.access_token,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});assert.equal(response.status,200,await response.clone().text());return response.json();};
 assert.equal((await rpc('initialize',{protocolVersion:'2025-03-26'})).result.protocolVersion,'2025-03-26');assert.equal((await rpc('tools/list')).result.tools.length,11);const project=await rpc('tools/call',{name:'studio_get_project',arguments:{}});assert.equal(JSON.parse(project.result.content[0].text).state.project.name,'Cloudflare Alice');
 assert.equal((await request('/mcp',{method:'POST',headers:{'content-type':'application/json'},body:'{}'},jar)).status,401);
 const queued=await request('/api/tasks',{method:'POST',headers:{Origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({episodeId:'ep-01'})},jar);assert.equal(queued.status,201);const task=(await queued.json()).task;
 const claim=await rpc('tools/call',{name:'studio_claim_task',arguments:{task_id:task.id}}),claimData=JSON.parse(claim.result.content[0].text);assert.ok(claimData.claimToken);
 const progress=await rpc('tools/call',{name:'studio_report_progress',arguments:{task_id:task.id,claim_token:claimData.claimToken,message:'Đã đọc brief. Đang chuẩn bị bản bàn giao.'}});assert.equal(progress.result.isError,undefined);
 const polled=(await(await request('/api/tasks',{},jar)).json()).tasks.find(t=>t.id===task.id);assert.equal(polled.status,'running');assert.match(polled.progress,/Đã đọc brief/);
 const saved=await rpc('tools/call',{name:'studio_save_artifact',arguments:{task_id:task.id,claim_token:claimData.claimToken,filename:'brief.txt',mime:'text/plain',encoding:'utf8',content:'Brief lưu bằng KV'}});const artifact=JSON.parse(saved.result.content[0].text);assert.ok(artifact.id);assert.equal(await(await request(artifact.url,{},jar)).text(),'Brief lưu bằng KV');const read=await rpc('tools/call',{name:'studio_read_resource',arguments:{resource_id:artifact.id}});assert.match(read.result.content[0].text,/Brief lưu bằng KV/);
 const submitted=await rpc('tools/call',{name:'studio_submit_result',arguments:{task_id:task.id,claim_token:claimData.claimToken,output:reviewedOutput(sampleOutput(0),0)}});assert.equal(JSON.parse(submitted.result.content[0].text).awaitingHumanReview,true);assert.equal((await(await request('/api/tasks',{},jar)).json()).tasks.find(t=>t.id===task.id).status,'awaiting_review');
 const refresh=await request('/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:token.refresh_token,client_id:client.client_id,resource:ORIGIN+'/mcp'}).toString()});assert.equal(refresh.status,200,await refresh.clone().text());
 assert.equal((await request('/auth/logout',{method:'POST',headers:{Origin:ORIGIN}},jar)).status,200);assert.equal((await(await request('/api/config',{},jar)).json()).signedIn,false);
});

test('Cloudflare Free uploads and serves private files using KV with range support and no R2 binding',async()=>{const jar=new CookieJar();await githubLogin(jar);const config=await(await request('/api/config',{},jar)).json();assert.equal(config.storageProvider,'kv');assert.equal(config.maxUploadBytes,20*1024*1024);const health=await(await request('/healthz')).json();assert.equal(health.filesReady,true);assert.equal(health.storageProvider,'kv');const form=new FormData();form.set('file',new File(['0123456789'],'notes.txt',{type:'text/plain'}));const uploaded=await request('/api/files',{method:'POST',headers:{Origin:ORIGIN},body:form},jar);assert.equal(uploaded.status,201,await uploaded.clone().text());const file=await uploaded.json();const partial=await request(file.url,{headers:{Range:'bytes=2-5'}},jar);assert.equal(partial.status,206);assert.equal(await partial.text(),'2345');assert.equal(partial.headers.get('content-range'),'bytes 2-5/10');assert.equal((await request(file.url)).status,401);const invalid=await request(file.url,{headers:{Range:'bytes=99-'}},jar);assert.equal(invalid.status,416);assert.equal(invalid.headers.get('content-range'),'bytes */10');const kv=await mf.getKVNamespace('FILES_KV','studio');assert.equal(await kv.get(file.key),'0123456789');});

async function codexClient(name){
 const jar=new CookieJar();assert.equal((await githubLogin(jar)).status,302);
 const redirect='https://'+name+'.test/callback';
 const registered=await request('/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:name,redirect_uris:[redirect],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})});
 assert.equal(registered.status,201);const client=await registered.json(),verifier=name.padEnd(64,'x');
 const authorize='/authorize?'+new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:redirect,scope:'studio:access offline_access',state:name,code_challenge:await s256(verifier),code_challenge_method:'S256',resource:ORIGIN+'/mcp'});
 const consent=await request(authorize,{},jar);assert.equal(consent.status,200);
 const handle=(await consent.text()).match(/name="handle" value="([^"]+)"/)[1];
 const approval=await request('/authorize',{method:'POST',headers:{Origin:ORIGIN,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({handle,decision:'approve'}).toString()},jar);
 assert.equal(approval.status,302);const callback=new URL(approval.headers.get('location'));assert.equal(callback.origin,new URL(redirect).origin);
 const exchanged=await request('/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:callback.searchParams.get('code'),client_id:client.client_id,redirect_uri:redirect,code_verifier:verifier,resource:ORIGIN+'/mcp'}).toString()});
 assert.equal(exchanged.status,200);const token=await exchanged.json();
 const tool=async(name,args={})=>{const response=await request('/mcp',{method:'POST',headers:{authorization:'Bearer '+token.access_token,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});assert.equal(response.status,200);return (await response.json()).result;};
 return {jar,client,token,tool};
}

test('OAuth owner starts a thirty-minute production and cached MCP output gains the new contract',async()=>{
 const client=await codexClient('codex-production'),current=JSON.parse((await client.tool('studio_get_project')).content[0].text);
 const episode={...seedEpisode(),id:crypto.randomUUID(),title:'Quy trình chuyên môn',sample:false};current.state.episodes.push(episode);
 const saved=await request('/api/state',{method:'PUT',headers:{Origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({state:current.state,revision:current.revision})},client.jar);assert.equal(saved.status,200);
 const revision=(await saved.json()).revision;
 const started=await client.tool('studio_start_episode',{episode_id:episode.id,target_minutes:30,auto_approve:true,expected_revision:revision});assert.equal(started.isError,undefined);
 const start=JSON.parse(started.content[0].text);assert.equal(start.episode.targetMinutes,30);assert.equal(start.episode.autoApprove,true);
 const packet=JSON.parse((await client.tool('studio_get_task',{task_id:start.task.id})).content[0].text);assert.equal(packet.productionPolicy.required,true);assert.equal(packet.skills.length,3);
 const claim=JSON.parse((await client.tool('studio_claim_task',{task_id:start.task.id})).content[0].text).claimToken;
 const output=reviewedOutput(sampleOutput(0),0,{targetMinutes:30}),production=output.production;delete output.production;output.content+='\n```valley-production\n'+JSON.stringify(production)+'\n```';
 const submitted=await client.tool('studio_submit_result',{task_id:start.task.id,claim_token:claim,output});assert.equal(submitted.isError,undefined);
 const result=JSON.parse(submitted.content[0].text);assert.equal(result.task.status,'approved');assert.equal(result.nextTask.stage,1);
 const after=JSON.parse((await client.tool('studio_get_project')).content[0].text).state.episodes.find(e=>e.id===episode.id);
 assert.equal(after.outputs[0].quality.verdict,'passed');assert.equal(after.outputs[0].production.data.targetMinutes,30);assert.ok(!after.outputs[0].content.includes('valley-production'));
});

test('Cloudflare owner enables automatic MCP handoff then switches a running role back to manual',async()=>{
 const client=await codexClient('codex-automatic'),current=await(await request('/api/state',{},client.jar)).json();
 const episode={...seedEpisode(),id:crypto.randomUUID(),title:'Tập 30 phút',sample:false,targetMinutes:30};
 current.state.episodes.push(episode);current.state.activeEpisode=episode.id;
 const post=(path,value,origin=ORIGIN)=>request(path,{method:'POST',headers:{Origin:origin,'content-type':'application/json'},body:JSON.stringify(value)},client.jar);
 assert.equal((await request('/api/state',{method:'PUT',headers:{Origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify(current)},client.jar)).status,200);
 assert.equal((await post('/api/workflow',{episodeId:episode.id,autoApprove:true},'https://foreign.test')).status,403);
 const enabled=await post('/api/workflow',{episodeId:episode.id,autoApprove:true});assert.equal(enabled.status,200);
 const first=(await enabled.json()).nextTask,packet=JSON.parse((await client.tool('studio_get_task',{task_id:first.id})).content[0].text);
 assert.equal(packet.context.episode.targetMinutes,30);assert.equal(packet.workflow.autoApprove,true);
 const token=JSON.parse((await client.tool('studio_claim_task',{task_id:first.id})).content[0].text).claimToken;
 const submitted=await client.tool('studio_submit_result',{task_id:first.id,claim_token:token,output:reviewedOutput(sampleOutput(0),0,{targetMinutes:30})});
 assert.equal(submitted.isError,undefined);const result=JSON.parse(submitted.content[0].text);
 assert.equal(result.task.status,'approved');assert.equal(result.nextTask.stage,1);assert.equal(result.awaitingHumanReview,false);
 const next=result.nextTask,nextToken=JSON.parse((await client.tool('studio_claim_task',{task_id:next.id})).content[0].text).claimToken;
 assert.equal((await post('/api/workflow',{episodeId:episode.id,autoApprove:false})).status,200);
 const manual=await client.tool('studio_submit_result',{task_id:next.id,claim_token:nextToken,output:reviewedOutput(sampleOutput(1),1)});
 assert.equal(manual.isError,undefined);assert.equal(JSON.parse(manual.content[0].text).awaitingHumanReview,true);
 const final=(await(await request('/api/state',{},client.jar)).json()).state.episodes.find(e=>e.id===episode.id);
 assert.equal(final.stage,1);assert.deepEqual(final.approved,[0]);assert.equal(final.outputs[0].approval.mode,'automatic');assert.equal(final.autoApprove,false);
});

test('two independently authorized Codex clients continue the same Cloudflare project and task',async()=>{
 const first=await codexClient('codex-first'),second=await codexClient('codex-second');
 assert.notEqual(first.client.client_id,second.client.client_id);assert.notEqual(first.token.access_token,second.token.access_token);
 assert.equal((await(await request('/api/config',{},second.jar)).json()).mcpUrl,ORIGIN+'/mcp');
 const current=await(await request('/api/state',{},first.jar)).json(),episode={...seedEpisode(),id:crypto.randomUUID(),title:'Chuyển tài khoản Codex',sample:false};
 current.state.episodes.push(episode);current.state.activeEpisode=episode.id;
 assert.equal((await request('/api/state',{method:'PUT',headers:{Origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify(current)},first.jar)).status,200);
 const project=JSON.parse((await second.tool('studio_get_project')).content[0].text);
 assert.equal(project.state.activeEpisode,episode.id);assert.equal(project.state.project.name,current.state.project.name);
 const queued=await request('/api/tasks',{method:'POST',headers:{Origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({episodeId:episode.id})},first.jar);
 assert.equal(queued.status,201);const task=(await queued.json()).task;
 const oldClaim=JSON.parse((await first.tool('studio_claim_task',{task_id:task.id})).content[0].text).claimToken;
 await first.tool('studio_report_progress',{task_id:task.id,claim_token:oldClaim,message:'Đã lập dàn ý, cần bổ sung lịch quay.'});
 const artifact=JSON.parse((await first.tool('studio_save_artifact',{task_id:task.id,claim_token:oldClaim,filename:'resume.md',mime:'text/markdown',encoding:'utf8',content:'Dàn ý đã lưu từ Codex thứ nhất.'})).content[0].text);
 assert.equal((await request('/api/tasks/'+task.id+'/handoff',{method:'POST',headers:{Origin:'https://wrong.test'}},first.jar)).status,403);
 assert.equal((await request('/api/tasks/'+task.id+'/handoff',{method:'POST',headers:{Origin:ORIGIN}},first.jar)).status,200);
 assert.equal((await first.tool('studio_submit_result',{task_id:task.id,claim_token:oldClaim,output:reviewedOutput(sampleOutput(0),0)})).isError,true);
 const packet=JSON.parse((await second.tool('studio_get_task',{task_id:task.id})).content[0].text);
 assert.match(packet.task.progress,/cần bổ sung lịch quay/);assert.equal(packet.task.artifacts[0].id,artifact.id);
 assert.match((await second.tool('studio_read_resource',{resource_id:artifact.id})).content[0].text,/Codex thứ nhất/);
 const claim=JSON.parse((await second.tool('studio_claim_task',{task_id:task.id})).content[0].text).claimToken;assert.notEqual(claim,oldClaim);
 const submitted=await second.tool('studio_submit_result',{task_id:task.id,claim_token:claim,output:reviewedOutput(sampleOutput(0),0)});
 assert.equal(submitted.isError,undefined);assert.equal(JSON.parse(submitted.content[0].text).awaitingHumanReview,true);
 const result=await(await request('/api/state',{},second.jar)).json();
 assert.equal(result.state.episodes.find(e=>e.id===episode.id).outputs[0].artifacts[0].id,artifact.id);
 const wrongClientRefresh=await request('/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:first.token.refresh_token,client_id:second.client.client_id,resource:ORIGIN+'/mcp'}).toString()});
 assert.notEqual(wrongClientRefresh.status,200);
});

test('OAuth owner imports a large ZIP through the cached MCP catalog into the Library without reopening production',async()=>{
 const client=await codexClient('codex-library'),before=JSON.parse((await client.tool('studio_get_project')).content[0].text);
 assert.equal(before.libraryUpload.protocol,'valley-library-upload/1');
 const bytes=new Uint8Array(4*1024*1024+25).fill(81);bytes.set([80,75,3,4]);
 const sha=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',value)).toString('hex');
 const descriptor={protocol:'valley-library-upload/1',mime:'application/zip',size:bytes.length,sha256:await sha(bytes),category:'knowledge',description:'Existing crew files',tags:'library-transfer'};
 const prepared=await client.tool('studio_save_artifact',{task_id:'library:project',claim_token:'',filename:'crew-files.zip',mime:'application/json',encoding:'utf8',content:JSON.stringify(descriptor)});
 assert.equal(prepared.isError,undefined,prepared.content[0].text);const ticket=JSON.parse(prepared.content[0].text),path=new URL(ticket.uploadUrl).pathname;
 // A rejected request need not stream a multi-megabyte body after the server
 // has already returned 401; use a small body for this identity-spoof check.
 assert.equal((await request(path,{method:'PUT',headers:{'oai-authenticated-user-id':'github:123','content-type':'application/zip'},body:bytes.subarray(0,16)})).status,401);
 const response=await request(path,{method:'PUT',headers:{authorization:'Bearer '+ticket.uploadToken,'content-type':'application/zip'},body:bytes});
 assert.equal(response.status,201,await response.clone().text());const receipt=await response.json();
 const after=JSON.parse((await client.tool('studio_get_project')).content[0].text);
 assert.deepEqual(after.state.episodes,before.state.episodes);assert.equal(after.state.assets.length,before.state.assets.length+1);
 assert.ok(after.state.assets.some(a=>a.id===receipt.asset.id&&a.sha256===descriptor.sha256));
 assert.equal((await request(receipt.asset.url)).status,401);
 const original=await request(receipt.asset.url,{},client.jar);assert.equal(original.status,200);assert.match(original.headers.get('content-disposition'),/^attachment/);assert.equal(await sha(await original.arrayBuffer()),descriptor.sha256);
 const verified=await request(path,{headers:{authorization:'Bearer '+ticket.uploadToken}});assert.equal(verified.status,200);assert.equal(await sha(await verified.arrayBuffer()),descriptor.sha256);
 const duplicate=await client.tool('studio_prepare_library_upload',{filename:'crew-files.zip',mime:'application/zip',size:bytes.length,sha256:descriptor.sha256,category:'knowledge'});assert.equal(duplicate.isError,undefined);assert.equal(JSON.parse(duplicate.content[0].text).uploadRequired,false);
 const csv=new TextEncoder().encode('id,seconds\nS01,30\n'),preparedCsv=await client.tool('studio_prepare_library_upload',{filename:'crew.csv',mime:'text/csv',size:csv.length,sha256:await sha(csv),category:'knowledge'});assert.equal(preparedCsv.isError,undefined);
 const csvTicket=JSON.parse(preparedCsv.content[0].text),csvResponse=await request(new URL(csvTicket.uploadUrl).pathname,{method:'PUT',headers:{authorization:'Bearer '+csvTicket.uploadToken,'content-type':'text/csv'},body:csv});assert.equal(csvResponse.status,201);
 const current=await(await request('/api/state',{},client.jar)).json();assert.equal((await request('/api/state',{method:'PUT',headers:{Origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify(current)},client.jar)).status,200);
});

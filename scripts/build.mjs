import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {buildDocs} from './build-docs.mjs';
await buildDocs();
const assets={};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.json':'application/json'};
async function walk(dir){for(const name of await readdir(dir)){const file=join(dir,name);if((await stat(file)).isDirectory())await walk(file);else{const ext=name.slice(name.lastIndexOf('.')),binary=['.jpg','.png','.woff2'].includes(ext);assets['/'+relative('public',file)]={body:(await readFile(file)).toString(binary?'base64':'utf8'),type:types[ext]||'application/octet-stream',binary};}}}
await walk('public');
let data=await readFile('public/data.js','utf8');data=data.replace(/export /g,'');
let api=await readFile('worker/api.js','utf8');api=api.replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');
for(const file of ['worker/bridge.js','worker/mcp.js'])api+='\n'+(await readFile(file,'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');
const entry=`${data}\n${api}\nconst ASSETS=${JSON.stringify(assets)};\nexport default {async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname==='/mcp')return handleMcp(request,env);if(url.pathname.startsWith('/api/'))return handleApi(request,env);if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const asset=ASSETS[url.pathname==='/'?'/index.html':url.pathname];if(!asset)return new Response('Not found',{status:404});let body=asset.body;if(asset.binary)body=Uint8Array.from(atob(body),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:body,{headers:{'content-type':asset.type,'cache-control':url.pathname.includes('/vendor/')?'public, max-age=86400':'no-cache','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors *; base-uri 'self'; form-action 'self'"}});}};\n`;
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',entry);await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log('Built Worker with '+Object.keys(assets).length+' assets; '+Math.round(Buffer.byteLength(entry)/1024)+' KB.');

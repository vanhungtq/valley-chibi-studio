import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
import {seedState} from '../public/data.js';

test('browser opens an episode edition, filters shots, enlarges boards and preserves direct links on desktop/mobile',async()=>{
 const state=seedState(),episode=state.episodes[0],ids=Array.from({length:5},()=>crypto.randomUUID());
 const files=Object.fromEntries(['pdf','archive','shotlist','knowledge'].map((role,i)=>[role,ids[i]]));
 state.assets=ids.map((id,i)=>({id,url:'/api/files/'+id,name:['crew.pdf','crew.zip','shots.csv','knowledge.md','board.webp'][i],mime:['application/pdf','application/zip','text/csv','text/markdown','image/webp'][i],size:1500,category:'knowledge',episodeId:episode.id}));
 episode.dossiers=[{id:'v2-0',title:'Tập 1 v2.0',version:'2.0',summary:'Ngày đầu trở về căn nhà trong thung lũng. Hồ sơ quay cập nhật cho ekip.',targetMinutes:1,publishedAt:'2026-11-12T08:00:00Z',files,gallery:[{assetId:ids[4],page:1,shotIds:['S01','S02']}],shots:[1,2].map((n,i)=>({shotId:'S0'+n,sceneId:'SC0'+n,sceneTitle:n===1?'Đến căn nhà':'Mở một khởi đầu',seconds:30,start:i*30,end:n*30,page:1,panel:n,timecode:n===1?'00:00–00:30':'00:30–01:00',lensMm:18,size:'WS',angle:'Thấp qua tiền cảnh',move:'Tripod tĩnh',action:n===1?'Hai chị em bước vào lối mòn cạnh căn nhà.':'Mở cửa đón ánh sáng đầu ngày.',continuity:'Giữ hướng di chuyển trái sang phải.',sound:'Tiếng bước chân, chim xa.',lighting:'Ánh sáng mềm đầu ngày.',aperture:'F4',recording:'4K25p',techniqueRefs:'V03'}))}];
 const root=resolve('public'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.woff2':'font/woff2','.svg':'image/svg+xml'};
 const server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,'http://local.test').pathname;
   if(path==='/api/config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({signedIn:true,storageReady:true,bridgeReady:true,executionMode:'codex',storageProvider:'kv',authProvider:'github',maxUploadBytes:20971520}));return;}
   if(path==='/api/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({state,revision:1}));return;}
   if(path==='/api/tasks'){res.setHeader('Content-Type','application/json');res.end('{"tasks":[]}');return;}
   if(path==='/api/files/'+ids[4]){res.setHeader('Content-Type','image/jpeg');res.end(await readFile(resolve(root,'assets/valley.jpg')));return;}
   if(path==='/api/files/'+ids[0]){res.setHeader('Content-Type','application/pdf');res.end('%PDF-1.4\n%%EOF');return;}
   const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+'/')){res.statusCode=404;res.end();return;}
   res.setHeader('Content-Type',types[extname(file)]||'text/plain');res.end(await readFile(file));
  }catch{res.statusCode=404;res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin+'/#episodes');await page.waitForSelector('.dossier-card');
  assert.equal(await page.locator('.dossier-card h2').textContent(),'Tập 1 v2.0');
  await page.locator('.dossier-card .dossier-actions [data-action="open-dossier"]').click();await page.waitForSelector('.dossier-heading');assert.match(page.url(),/#episodes\/ep-01\/v2-0$/);
  await page.locator('[data-view="shots"]').click();assert.equal(await page.locator('.dossier-shot').count(),2);
  await page.selectOption('#dossier-scene-filter','SC02');assert.equal(await page.locator('.dossier-shot').count(),1);await page.locator('.dossier-shot summary').click();assert.match(await page.locator('.dossier-shot[open] dl').textContent(),/Continuity/);
  await page.locator('[data-view="storyboard"]').click();await page.locator('[data-action="dossier-image"]').click();await page.waitForSelector('.dossier-enlarged');await page.keyboard.press('Escape');await page.waitForSelector('.dossier-enlarged',{state:'detached'});
  await page.locator('[data-view="documents"]').click();assert.equal(await page.locator('.dossier-document').count(),4);assert.match(await page.locator('.dossier-pdf iframe').getAttribute('src'),new RegExp(ids[0]));
  await page.reload();await page.waitForSelector('.dossier-heading');assert.equal(await page.locator('.dossier-heading h1').textContent(),'Tập 1 v2.0');
  const screenshotDir=process.env.DOSSIER_SCREENSHOT_DIR;if(screenshotDir){await mkdir(screenshotDir,{recursive:true});await page.screenshot({path:resolve(screenshotDir,'episode-dossier-desktop.png'),fullPage:true});}
  for(const view of ['overview','storyboard','shots','documents']){
   await page.setViewportSize({width:390,height:844});await page.locator('[data-view="'+view+'"]').click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile '+view+' must not overflow');
  }
  if(screenshotDir)await page.screenshot({path:resolve(screenshotDir,'episode-dossier-mobile.png'),fullPage:true});
  await page.locator('[data-action="close-dossier"]').click();await page.waitForSelector('.dossier-card');assert.equal(new URL(page.url()).hash,'#episodes');assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});

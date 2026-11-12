import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
import {zipSync,strToU8} from 'fflate';
import {referenceFixture,referenceOwner,referenceAnalysisFixture} from './reference-fixture.mjs';
import {readState} from '../worker/api.js';
import {referenceAnalysisAction,readReferenceProfile} from '../worker/reference-profiles.js';
import {queueTask,getTask} from '../worker/bridge.js';

test('browser imports a nested ZIP, displays shot dossier, learns from a leased job, and applies chosen scene types',async()=>{
 const fixture=await referenceFixture(),root=resolve('public'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg','.svg':'image/svg+xml','.csv':'text/csv'};
 const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://local.test').pathname;
  if(path==='/api/config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({executionMode:'codex',authProvider:'github',signedIn:true,storageReady:true,bridgeReady:true,maxUploadBytes:20971520}));return;}
  if(path.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const result=await fixture.api(req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;}
  const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+'/')){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',types[extname(file)]||'text/plain');res.end(await readFile(file));
 }catch(error){res.statusCode=500;res.end(error.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const csv='scene_id,shot_id,timecode,image_path,description,scene_type\nC01,S01,00:00–00:05,frames/S01.jpg,Hands with vegetables,Hái rau\nC02,S02,00:05–00:09,frames/S02.jpg,Tools and soil,Cuốc đất';
  const bytes=zipSync({'video/shots.csv':strToU8(csv),'video/frames/S01.jpg':new Uint8Array(await readFile(root+'/assets/food.jpg')),'video/frames/S02.jpg':new Uint8Array(await readFile(root+'/assets/valley.jpg'))});
  await page.goto('http://127.0.0.1:'+server.address().port+'/#knowledge');await page.locator('[data-action="ref-import-zip"]').click();await page.locator('#reference-zip-file').setInputFiles({name:'reference.zip',mimeType:'application/zip',buffer:Buffer.from(bytes)});await page.waitForSelector('#reference-zip-form');
  assert.equal(await page.locator('.reference-import-table tbody tr').count(),2);assert.equal(await page.locator('.reference-preview-images img').count(),2);
  await page.locator('#reference-zip-form [name="title"]').fill('Cooking and garden study');await page.locator('#reference-zip-form [name="videoTypes"]').fill('Nấu ăn');await page.locator('#reference-zip-form [type="submit"]').click();await Promise.race([page.waitForSelector('.reference-profile',{timeout:12000}),page.waitForSelector('.toast.error',{timeout:12000}).then(async el=>{throw new Error('Import UI: '+await el.textContent());})]);assert.equal(await page.locator('.reference-shot-grid article').count(),2);await page.waitForFunction(()=>document.querySelector('[data-ref-job-status]')?.textContent.includes('Chờ Codex'));
  const row=fixture.sqlite.prepare('SELECT id,reference_id FROM reference_jobs').get(),claimed=await referenceAnalysisAction(fixture.env,referenceOwner,{action:'claim',job_id:row.id}),profile=(await readReferenceProfile(fixture.env,referenceOwner,row.reference_id)).profile;
  await referenceAnalysisAction(fixture.env,referenceOwner,{action:'submit',job_id:row.id,claim_token:claimed.claimToken,analysis:referenceAnalysisFixture(profile)});
  await page.locator('[data-action="ref-refresh-profile"]').click();await page.waitForSelector('.reference-learnings');assert.equal(await page.locator('.reference-observation').count(),2);
  await page.selectOption('#reference-profile-scene','C01');await page.waitForFunction(()=>document.querySelectorAll('.reference-shot-grid article').length===1);assert.equal(await page.locator('.reference-shot-grid article').count(),1);
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.modal')).opacity)>.99&&Number(getComputedStyle(document.querySelector('.modal-overlay')).opacity)>.99);
  if(process.env.REFERENCE_SCREENSHOT_DIR){await mkdir(process.env.REFERENCE_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.REFERENCE_SCREENSHOT_DIR,'reference-profile-desktop.png'),fullPage:true});}
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(process.env.REFERENCE_SCREENSHOT_DIR)await page.screenshot({path:resolve(process.env.REFERENCE_SCREENSHOT_DIR,'reference-profile-mobile.png'),fullPage:true});
  await page.keyboard.press('Escape');await page.locator('[data-action="ref-select-types"]').click();await page.locator('[name="ref-videoTypes"][value="Nấu ăn"]').check();await page.locator('[name="ref-sceneTypes"][value="Hái rau"]').check();await page.locator('#reference-steering-form [type="submit"]').click();await Promise.race([page.waitForSelector('#reference-steering-form',{state:'detached',timeout:12000}),page.waitForSelector('.toast.error',{timeout:12000}).then(async el=>{throw new Error('Steering UI: '+await el.textContent());})]);
  const saved=await readState(fixture.env,referenceOwner);assert.deepEqual(saved.state.episodes[0].referenceSelection.sceneTypes,['Hái rau']);const task=await queueTask(fixture.env,referenceOwner,'ep-01'),packet=await getTask(fixture.env,referenceOwner,task.id);assert.equal(packet.context.resources.references[0].shots.length,1);assert.equal(packet.context.resources.references[0].shots[0].id,'S01');
  await page.selectOption('#knowledge-video-type','Thủ công');assert.equal(await page.locator('.ref-card').count(),0);await page.selectOption('#knowledge-video-type','Nấu ăn');assert.equal(await page.locator('.ref-card').count(),1);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fixture.sqlite.close();}
});

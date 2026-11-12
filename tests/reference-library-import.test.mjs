import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceFixture,referenceOwner} from './reference-fixture.mjs';
import {prepareLibraryBatch,receiveLibraryUpload} from '../worker/library-uploads.js';
import {importLibraryReference} from '../worker/reference-profiles.js';
import {readState} from '../worker/api.js';
import {handleMcp} from '../worker/mcp.js';

const hash=async b=>Buffer.from(await crypto.subtle.digest('SHA-256',b)).toString('hex');
test('batch upload scopes each file, then owner imports a source-cited profile through cached MCP without changing episodes',async()=>{
 const f=await referenceFixture();f.env.PUBLIC_ORIGIN='https://studio.test';
 const before=await readState(f.env,referenceOwner),data=[new TextEncoder().encode('image-a'),new TextEncoder().encode('image-b')],files=[];
 for(let i=0;i<data.length;i++)files.push({filename:'reference-'+i+'.webp',mime:'image/webp',size:data[i].length,sha256:await hash(data[i]),category:'reference'});
 await assert.rejects(prepareLibraryBatch(f.env,'github:999',{files}),e=>e.status===403);
 await assert.rejects(prepareLibraryBatch(f.env,referenceOwner,{files:[files[0],files[0]]}),e=>e.status===400);
 const batch=await prepareLibraryBatch(f.env,referenceOwner,{files});assert.equal(batch.uploads.length,2);assert.notEqual(batch.uploads[0].uploadToken,batch.uploads[1].uploadToken);assert.equal((await readState(f.env,referenceOwner)).state.assets.length,before.state.assets.length);
 const upload=async(ticket,bytes)=>{const response=await receiveLibraryUpload(new Request(ticket.uploadUrl,{method:'PUT',headers:{authorization:'Bearer '+ticket.uploadToken,'content-type':ticket.asset.mime},body:bytes}),f.env,()=>true);assert.equal(response.status,201,await response.clone().text());return (await response.json()).asset;};
 const assets=[];for(let i=0;i<data.length;i++)assets.push(await upload(batch.uploads[i],data[i]));
 const profile={id:crypto.randomUUID(),title:'Reference fixture',source:'Fixture',url:'https://example.test/video',note:'Still-image study',tags:'reference',videoTypes:['Nấu ăn'],sourceCsv:'index,timecode\n1,00:01\n2,00:04',importHash:'e'.repeat(64),shots:assets.map((a,i)=>({id:'S'+(i+1),originalId:String(i+1),sceneId:'C1',sceneTitle:'Preparation',sceneTypes:['Sơ chế'],title:'Preparation '+i,timecode:'00:0'+(i+1),size:'CU',lens:'',move:'',note:'Snapshot timestamp, not duration',imageId:a.id}))};
 const bytes=new TextEncoder().encode(JSON.stringify({protocol:'valley-reference-profile/1',profile})),packet=await prepareLibraryBatch(f.env,referenceOwner,{files:[{filename:'profile.json',mime:'application/json',size:bytes.length,sha256:await hash(bytes),category:'knowledge'}]}),source=await upload(packet.uploads[0],bytes),loaded=await readState(f.env,referenceOwner);
 await assert.rejects(importLibraryReference(f.env,referenceOwner,{profile_resource_id:source.id,expected_revision:loaded.revision-1}),e=>e.status===409);
 await assert.rejects(importLibraryReference(f.env,'github:999',{profile_resource_id:source.id,expected_revision:loaded.revision}),e=>e.status===403);
 const rpc=await handleMcp(new Request('https://studio.test/mcp',{method:'POST',headers:{'oai-authenticated-user-id':referenceOwner,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'studio_save_artifact',arguments:{task_id:'reference-import:project',claim_token:'',filename:'import.json',mime:'application/json',encoding:'utf8',content:JSON.stringify({protocol:'valley-reference-import/1',profile_resource_id:source.id,expected_revision:loaded.revision})}}})}),f.env),result=(await rpc.json()).result;assert.equal(result.isError,undefined,result.content[0].text);const imported=JSON.parse(result.content[0].text);assert.equal(imported.reference.id,profile.id);assert.equal(imported.job.status,'queued');
 const after=await readState(f.env,referenceOwner);assert.deepEqual(after.state.episodes,before.state.episodes);assert.equal(after.state.assets.length,before.state.assets.length+3);
 const retry=await importLibraryReference(f.env,referenceOwner,{profile_resource_id:source.id,expected_revision:after.revision});assert.equal(retry.alreadyImported,true);assert.equal(retry.job.id,imported.job.id);assert.equal((await readState(f.env,referenceOwner)).revision,after.revision);
 const duplicate=await prepareLibraryBatch(f.env,referenceOwner,{files});assert.ok(duplicate.uploads.every(t=>t.uploadRequired===false));
});

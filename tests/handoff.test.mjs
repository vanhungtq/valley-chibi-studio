import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('portable handoff includes source and guide while removing Site identity and runtime data',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'valley-handoff-'));
 try{const target=join(temp,'source');execFileSync(process.execPath,['scripts/export-handoff.mjs',target],{cwd:process.cwd()});const manifest=JSON.parse(await readFile(join(target,'.openai/hosting.json'),'utf8'));assert.equal(manifest.project_id,undefined);assert.equal(manifest.d1,'DB');assert.equal(manifest.r2,'BUCKET');assert.deepEqual(manifest.capabilities,['mcp']);assert.match(await readFile(join(target,'docs/INSTALL.vi.md'),'utf8'),/Không cần API key/);assert.match(await readFile(join(target,'AGENTS.md'),'utf8'),/Do not add or call an external model API/);for(const name of ['.git','node_modules','dist','.env','.dev.vars','.sites-runtime'])await assert.rejects(stat(join(target,name)),{code:'ENOENT'});assert.ok((await stat(join(target,'worker/mcp.js'))).isFile());}finally{await rm(temp,{recursive:true,force:true});}
});

import {cp,mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=process.cwd(),destination=process.argv[2];
if(!destination)throw new Error('Usage: node scripts/export-handoff.mjs <new-empty-directory>');
const target=resolve(destination);if(target===root||target.startsWith(root+'/'))throw new Error('Export outside the live source checkout.');
try{await stat(target);throw new Error('Destination must not already exist.');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(target,{recursive:true});
for(const name of ['public','worker','scripts','tests','drizzle','docs','package.json','package-lock.json','README.md','AGENTS.md','.gitignore','.env.example'])await cp(join(root,name),join(target,name),{recursive:true});
const manifest=JSON.parse(await readFile(join(root,'.openai/hosting.json'),'utf8'));delete manifest.project_id;
await mkdir(join(target,'.openai'),{recursive:true});await writeFile(join(target,'.openai/hosting.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Exported portable source without Site identity, Git metadata, secrets or runtime data: '+target);

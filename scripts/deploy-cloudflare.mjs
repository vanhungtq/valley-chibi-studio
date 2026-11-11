import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {experimental_readRawConfig,experimental_patchConfig} from 'wrangler';

const wrangler=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
function runWrangler(args,{capture=false}={}){
 const result=spawnSync(process.execPath,[wrangler,...args],{
  stdio:capture?['ignore','pipe','inherit']:'inherit',encoding:'utf8',env:process.env,maxBuffer:8*1024*1024
 });
 if(result.error)throw result.error;
 if(result.status!==0){const error=new Error(`Wrangler ${args.slice(0,3).join(' ')} failed.`);error.exitCode=result.status||1;throw error;}
 return result.stdout;
}

function inventory(output,label){
 let items;
 try{items=JSON.parse(output);}catch{throw new Error(`Cannot read ${label} inventory from Wrangler; deployment stopped before provisioning.`);}
 if(!Array.isArray(items)||items.some(item=>!item||typeof item!=='object'))throw new Error(`Invalid ${label} inventory; deployment stopped before provisioning.`);
 return items;
}

function existingId(items,name,nameKey,idKey,pattern){
 const matches=items.filter(item=>item[nameKey]===name);
 if(matches.length>1)throw new Error(`Multiple resources match ${name}; pin the intended resource ID in wrangler.jsonc.`);
 if(!matches.length)return;
 const id=matches[0][idKey];
 if(typeof id!=='string'||!pattern.test(id))throw new Error(`Invalid resource ID for ${name}; deployment stopped.`);
 return id;
}

// Failed first deployments can leave resources without ever binding them to a Worker.
// Reattach exact default names in the authenticated account before Wrangler tries to
// create them again (KV API error 10014). Explicit IDs always take precedence.
function resolveExistingResources(configPath,run,log){
 const {rawConfig:config}=experimental_readRawConfig({config:configPath});
 const patch={};
 if(config.kv_namespaces?.some(binding=>!binding.id)){
  if(!config.name)throw new Error('Set the Worker name in wrangler.jsonc before resolving KV namespaces.');
  const items=inventory(run(['kv','namespace','list','--config',configPath],{capture:true}),'KV');
  const bindings=config.kv_namespaces.map(binding=>{
   if(binding.id)return binding;
   const title=`${config.name}-${binding.binding.toLowerCase().replaceAll('_','-')}`;
   const id=existingId(items,title,'title','id',/^[a-f0-9]{32}$/i);
   if(!id)return binding;
   log(`Reusing KV namespace ${title} for ${binding.binding}.`);
   return {...binding,id};
  });
  if(bindings.some((binding,index)=>binding.id!==config.kv_namespaces[index].id))patch.kv_namespaces=bindings;
 }
 if(config.d1_databases?.some(binding=>!binding.database_id)){
  const items=inventory(run(['d1','list','--json','--config',configPath],{capture:true}),'D1');
  const bindings=config.d1_databases.map(binding=>{
   if(binding.database_id||!binding.database_name)return binding;
   const database_id=existingId(items,binding.database_name,'name','uuid',/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
   if(!database_id)return binding;
   log(`Reusing D1 database ${binding.database_name} for ${binding.binding}.`);
   return {...binding,database_id};
  });
  if(bindings.some((binding,index)=>binding.database_id!==config.d1_databases[index].database_id))patch.d1_databases=bindings;
 }
 if(Object.keys(patch).length)experimental_patchConfig(configPath,patch,false);
 return {...config,...patch};
}

export function deployCloudflare({configPath=resolve('wrangler.jsonc'),run=runWrangler,log=console.log}={}){
 configPath=resolve(configPath);
 const config=resolveExistingResources(configPath,run,log);
 const database=config.d1_databases?.find(binding=>binding.binding==='DB');
 if(!database)throw new Error('Missing D1 binding DB in wrangler.jsonc.');
 const migrate=()=>run(['d1','migrations','apply','DB','--remote','--config',configPath]);
 const deploy=()=>run(['deploy','--config',configPath]);
 if(database.database_id){migrate();deploy();}
 else{
  // Only a genuinely new database needs deployment/provisioning before migration.
  deploy();
  const provisioned=resolveExistingResources(configPath,run,log);
  if(!provisioned.d1_databases?.find(binding=>binding.binding==='DB')?.database_id)throw new Error('Cannot resolve the provisioned D1 database. Check Cloudflare resources before retrying.');
  migrate();
 }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{deployCloudflare();}catch(error){console.error(error.message);process.exitCode=error.exitCode||1;}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {experimental_readRawConfig} from 'wrangler';
import {deployCloudflare} from '../scripts/deploy-cloudflare.mjs';

const oauthId='a'.repeat(32),filesId='b'.repeat(32),dbId='12345678-1234-1234-1234-123456789abc';
const kv=[{title:'valley-chibi-studio-oauth-kv',id:oauthId},{title:'valley-chibi-studio-files-kv',id:filesId}];
const d1=[{name:'valley-chibi-studio',uuid:dbId}];
const base={name:'valley-chibi-studio',main:'worker/cloudflare.js',assets:{directory:'./public',binding:'ASSETS'},
 vars:{PUBLIC_ORIGIN:'https://studio.example',GITHUB_ALLOWED_LOGINS:'owner'},
 kv_namespaces:[{binding:'OAUTH_KV'},{binding:'FILES_KV'}],
 d1_databases:[{binding:'DB',database_name:'valley-chibi-studio',migrations_dir:'drizzle'}]};

function fixture(t,overrides={}){
 const dir=mkdtempSync(join(tmpdir(),'valley-deploy-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const configPath=join(dir,'wrangler.jsonc');
 writeFileSync(configPath,'// Keep deployment comments and URLs.\n'+JSON.stringify({...base,...overrides},null,2));
 return {configPath,read:()=>experimental_readRawConfig({config:configPath}).rawConfig};
}
function driver(configPath,{namespaces=kv,databases=d1,onDeploy=()=>{},onMigrate=()=>{}}={}){
 const calls=[];
 const run=(args,options)=>{
  assert.deepEqual(args.slice(-2),['--config',configPath]);
  const command=args.slice(0,-2).join(' ');
  calls.push(command);
  if(command==='kv namespace list'){assert.equal(options.capture,true);return JSON.stringify(namespaces);}
  if(command==='d1 list --json'){assert.equal(options.capture,true);return JSON.stringify(databases);}
  if(command==='deploy')return onDeploy();
  if(command==='d1 migrations apply DB --remote')return onMigrate();
  assert.fail(`Unexpected command: ${command}`);
 };
 return {run,calls};
}

test('redeploy reuses resources left by a failed first deployment before provisioning',t=>{
 const {configPath,read}=fixture(t);
 const {run,calls}=driver(configPath,{onDeploy(){
  const config=read();
  assert.deepEqual(config.kv_namespaces,[{binding:'OAUTH_KV',id:oauthId},{binding:'FILES_KV',id:filesId}]);
  assert.equal(config.d1_databases[0].database_id,dbId);
 }});
 deployCloudflare({configPath,run,log:()=>{}});
 assert.deepEqual(calls,['kv namespace list','d1 list --json','d1 migrations apply DB --remote','deploy']);
 assert.deepEqual(read().vars,base.vars);
 assert.deepEqual(read().assets,base.assets);
 assert.equal(read().d1_databases[0].migrations_dir,'drizzle');
 assert.match(readFileSync(configPath,'utf8'),/^\/\/ Keep deployment comments and URLs\./);
});

test('pinned IDs take precedence and require no account inventory lookup',t=>{
 const {configPath,read}=fixture(t,{kv_namespaces:[{binding:'OAUTH_KV',id:'c'.repeat(32)},{binding:'FILES_KV',id:filesId}],d1_databases:[{...base.d1_databases[0],database_id:dbId}]});
 const {run,calls}=driver(configPath);
 deployCloudflare({configPath,run,log:()=>{}});
 assert.deepEqual(calls,['d1 migrations apply DB --remote','deploy']);
 assert.equal(read().kv_namespaces[0].id,'c'.repeat(32));
});

test('an existing OAuth namespace is retained while a missing file namespace can be provisioned',t=>{
 const {configPath,read}=fixture(t,{d1_databases:[{...base.d1_databases[0],database_id:dbId}]});
 const {run,calls}=driver(configPath,{namespaces:[kv[0],{title:'other-studio-files-kv',id:'c'.repeat(32)}],onDeploy(){
  assert.equal(read().kv_namespaces[0].id,oauthId);
  assert.equal(read().kv_namespaces[1].id,undefined);
 }});
 deployCloudflare({configPath,run,log:()=>{}});
 assert.deepEqual(calls,['kv namespace list','d1 migrations apply DB --remote','deploy']);
});

test('a new install resolves provisioned IDs before migrating and a fresh checkout can reuse them',t=>{
 const {configPath,read}=fixture(t);
 let deployed=false;
 const calls=[];
 const run=args=>{
  const command=args.slice(0,-2).join(' ');calls.push(command);
  if(command==='kv namespace list')return JSON.stringify(deployed?kv:[]);
  if(command==='d1 list --json')return JSON.stringify(deployed?d1:[]);
  if(command==='deploy'){deployed=true;return;}
  if(command==='d1 migrations apply DB --remote'){assert.equal(read().d1_databases[0].database_id,dbId);return;}
  assert.fail(command);
 };
 deployCloudflare({configPath,run,log:()=>{}});
 assert.deepEqual(calls,['kv namespace list','d1 list --json','deploy','kv namespace list','d1 list --json','d1 migrations apply DB --remote']);
 const fresh=fixture(t);
 const next=driver(fresh.configPath);
 deployCloudflare({configPath:fresh.configPath,run:next.run,log:()=>{}});
 assert.equal(fresh.read().kv_namespaces[0].id,oauthId);
 assert.equal(next.calls.at(-2),'d1 migrations apply DB --remote');
});

test('inventory authorization failure stops deployment without changing source config',t=>{
 const {configPath}=fixture(t);
 const original=readFileSync(configPath,'utf8');
 let calls=0;
 assert.throws(()=>deployCloudflare({configPath,run(){calls++;throw new Error('KV inventory forbidden');},log:()=>{}}),/KV inventory forbidden/);
 assert.equal(calls,1);
 assert.equal(readFileSync(configPath,'utf8'),original);
});

test('invalid or ambiguous inventory never falls back to creating a namespace',t=>{
 for(const output of ['not JSON','{}',JSON.stringify([kv[0],kv[0]]),JSON.stringify([{...kv[0],id:'invalid'}])]){
  const {configPath}=fixture(t);
  let calls=0;
  assert.throws(()=>deployCloudflare({configPath,run(){calls++;return output;},log:()=>{}}),/inventory|Multiple resources|Invalid resource ID/);
  assert.equal(calls,1);
 }
});

test('migration failure prevents deploying new Worker code to an existing database',t=>{
 const {configPath}=fixture(t);
 const {run,calls}=driver(configPath,{onMigrate(){throw new Error('SQL migration failed');}});
 assert.throws(()=>deployCloudflare({configPath,run,log:()=>{}}),/SQL migration failed/);
 assert.equal(calls.includes('deploy'),false);
});

test('failed Worker provisioning stops before migrations; unresolved new D1 also stops',t=>{
 const first=fixture(t);
 const failed=driver(first.configPath,{namespaces:[],databases:[],onDeploy(){throw new Error('Provision failed');}});
 assert.throws(()=>deployCloudflare({configPath:first.configPath,run:failed.run,log:()=>{}}),/Provision failed/);
 assert.equal(failed.calls.includes('d1 migrations apply DB --remote'),false);
 const second=fixture(t);
 const unresolved=driver(second.configPath,{namespaces:[],databases:[]});
 assert.throws(()=>deployCloudflare({configPath:second.configPath,run:unresolved.run,log:()=>{}}),/Cannot resolve the provisioned D1/);
 assert.equal(unresolved.calls.includes('d1 migrations apply DB --remote'),false);
});

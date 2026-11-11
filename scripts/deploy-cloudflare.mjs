import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const wrangler=new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url).pathname;
function run(args){const result=spawnSync(process.execPath,[wrangler,...args],{stdio:'inherit',env:process.env});if(result.status!==0)process.exit(result.status||1);}
const text=readFileSync('wrangler.jsonc','utf8');
// Once resource IDs have been written, migrate before deploying updated code.
// On the first install Wrangler must provision the bindings first.
if(/"database_id"\s*:\s*"[a-f0-9-]{36}"/i.test(text)){run(['d1','migrations','apply','DB','--remote']);run(['deploy']);}
else{run(['deploy']);run(['d1','migrations','apply','DB','--remote']);}

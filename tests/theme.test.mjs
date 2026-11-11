import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('display theme follows the system, saves an override, and can return to system mode',async()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 const {window}=parseHTML('<html><head><meta name="theme-color"></head><body><button data-action="toggle-theme"></button><select id="theme-preference"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></body></html>');
 documentPrototype(window);const storage=new Map();let changed;
 window.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};const media={matches:true,addEventListener(type,fn){changed=fn;}};window.matchMedia=()=>media;
 Object.assign(globalThis,{window,document:window.document});
 try{const theme=await import('../public/theme.js?theme-test');assert.equal(theme.currentTheme(),'dark');assert.equal(document.documentElement.dataset.theme,'dark');assert.equal(document.querySelector('[data-action="toggle-theme"]').getAttribute('aria-pressed'),'true');theme.setTheme('light');assert.equal(storage.get('valley-theme'),'light');media.matches=false;changed();assert.equal(theme.currentTheme(),'light');media.matches=true;changed();assert.equal(theme.currentTheme(),'light');theme.setTheme('system');assert.equal(theme.currentTheme(),'dark');assert.equal(document.querySelector('#theme-preference').value,'system');assert.equal(document.querySelector('meta').getAttribute('content'),'#111a19');theme.setTheme('invalid');assert.equal(theme.themePreference(),'system');}
 finally{Object.assign(globalThis,{window:previousWindow,document:previousDocument});}
});
function documentPrototype(window){const proto=Object.getPrototypeOf(window.document.createElement('select')),descriptor=Object.getOwnPropertyDescriptor(proto,'value');if(!descriptor.set)Object.defineProperty(proto,'value',{...descriptor,set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===value);}});}
test('early theme bootstrap handles unavailable storage and a saved dark preference before paint',async()=>{
 const source=await readFile(new URL('../public/theme-init.js',import.meta.url),'utf8');
 for(const saved of ['dark','light','invalid']){const document={documentElement:{dataset:{},style:{}}};vm.runInNewContext(source,{document,localStorage:{getItem:()=>saved},window:{matchMedia:()=>({matches:false})}});assert.equal(document.documentElement.dataset.theme,saved==='dark'?'dark':'light');}
 const document={documentElement:{dataset:{},style:{}}};vm.runInNewContext(source,{document,localStorage:{getItem(){throw Error('storage denied');}},window:{matchMedia:()=>({matches:true})}});assert.equal(document.documentElement.dataset.theme,'dark');
});

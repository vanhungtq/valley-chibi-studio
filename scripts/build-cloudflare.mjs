import {readFile,writeFile} from 'node:fs/promises';
import {buildDocs} from './build-docs.mjs';
await buildDocs();
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const [source,target,title] of [['CLOUDFLARE.vi.md','cloudflare.html','Cài Cloudflare'],['RESUME_CODEX.vi.md','resume.html','Đổi tài khoản Codex']]){
 const guide=await readFile('docs/'+source,'utf8');
 const page=`<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Valley Studio</title><link rel="stylesheet" href="/assets/fonts.css"><style>body{margin:0;background:#f7f8f4;color:#263a31;font:14px/1.8 'Studio Sans',Arial}main{max-width:960px;margin:auto;padding:40px 24px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}a{color:#294b3e}</style></head><body><main><p><a href="/">← Về Xưởng</a> · <a href="/resume.html">Đổi Codex</a> · <a href="/codex-resume-prompt.txt" download>Prompt tiếp tục</a> · <a href="https://github.com/vanhungtq/valley-chibi-studio">GitHub</a></p><pre>${escape(guide)}</pre></main></body></html>`;
 await writeFile('public/'+target,page);
}
await writeFile('public/cloudflare-install-prompt.txt',await readFile('docs/CLOUDFLARE_INSTALL_PROMPT.vi.md'));
await writeFile('public/codex-resume-prompt.txt',await readFile('docs/CODEX_RESUME_PROMPT.vi.md'));
console.log('Prepared Cloudflare static assets and setup guide. Wrangler bundles worker/cloudflare.js.');

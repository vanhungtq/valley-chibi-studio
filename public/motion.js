const GSAP_CDN='https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js';
let pending;
// A pinned CDN release with a bundled fallback for restricted/offline networks.
export function loadGsap(){
 if(window.gsap)return Promise.resolve(window.gsap);
 if(pending)return pending;
 const script=(src)=>new Promise((resolve,reject)=>{const node=document.createElement('script');node.src=src;node.async=true;const timer=setTimeout(()=>{node.remove();reject(new Error('Animation library timed out'));},6000);node.onload=()=>{clearTimeout(timer);window.gsap?resolve(window.gsap):reject(new Error('Animation library unavailable'));};node.onerror=()=>{clearTimeout(timer);node.remove();reject(new Error('Animation library unavailable'));};document.head.append(node);});
 pending=script(GSAP_CDN).catch(()=>script('/vendor/gsap.min.js')).catch(()=>null);return pending;
}

const CACHE='borion-cnpj-v1.0.8';
const CORE=['./','./index.html','./manifest.webmanifest?v=1.0.8','./css/borion-7.6.2.css?v=1.0.8','./css/cnpj.css?v=1.0.8','./js/config.js?v=1.0.8','./js/app.js?v=1.0.8','./borion-cnpj-v108-emblem.png','./borion-cnpj-v108-watermark.png','./borion-cnpj-v108-icon-192.png','./borion-cnpj-v108-icon-512.png','./borion-cnpj-v108-favicon-32.png','./borion-cnpj-v108-apple-touch-icon.png','./borion-cnpj-v108.ico'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET')return;
  if(url.hostname.includes('googleapis.com')||url.hostname.includes('accounts.google.com'))return;
  const isFreshAsset=url.origin===location.origin && (/\/(js|css)\//.test(url.pathname)||url.pathname.endsWith('manifest.webmanifest'));
  if(req.mode==='navigate'||isFreshAsset){
    event.respondWith(fetch(req).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(req.mode==='navigate'?'./index.html':req,c))}return r}).catch(()=>caches.match(req.mode==='navigate'?'./index.html':req)));
    return;
  }
  if(url.origin===location.origin){event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c))}return r})));}
});

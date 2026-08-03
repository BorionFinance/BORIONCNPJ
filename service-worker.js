const CACHE='borion-cnpj-v1.0.7';
const CORE=['./','./index.html','./manifest.webmanifest','./css/borion-7.6.2.css?v=1.0.7','./css/cnpj.css?v=1.0.7','./js/config.js?v=1.0.7','./js/app.js?v=1.0.7','./borion-emblem.png','./borion-watermark.png','./borion-cnpj-icon-192.png','./borion-cnpj-icon-512.png','./borion-cnpj-favicon-32.png'];
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

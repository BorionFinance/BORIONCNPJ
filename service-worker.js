const CACHE='borion-cnpj-v1.0.5';
const CORE=['./','./index.html','./manifest.webmanifest','./css/borion-7.6.2.css?v=1.0.5','./css/cnpj.css?v=1.0.5','./js/config.js?v=1.0.5','./js/app.js?v=1.0.5','./borion-emblem.png','./borion-watermark.png','./icon-192.png','./icon-512.png','./favicon-32.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET')return;
  if(url.hostname.includes('googleapis.com')||url.hostname.includes('accounts.google.com'))return;
  if(req.mode==='navigate'){event.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put('./index.html',c));return r}).catch(()=>caches.match('./index.html')));return;}
  if(url.origin===location.origin){event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c))}return r})));}
});

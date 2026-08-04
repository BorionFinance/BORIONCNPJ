const CACHE='borion-cnpj-v1.0.9';
const CORE=['./','./index.html','./manifest.webmanifest?v=1.0.9','./css/borion-7.6.2.css?v=1.0.9','./css/cnpj.css?v=1.0.9','./js/config.js?v=1.0.9','./js/app.js?v=1.0.9','./borion-cnpj-v109-emblem.png','./borion-cnpj-v109-watermark.png','./borion-cnpj-v109-icon-192.png','./borion-cnpj-v109-icon-512.png','./borion-cnpj-v109-favicon-32.png','./borion-cnpj-v109-apple-touch-icon.png','./borion-cnpj-v109.ico'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);if(req.method!=='GET')return;
  if(url.hostname.includes('googleapis.com')||url.hostname.includes('accounts.google.com'))return;
  const same=url.origin===self.location.origin;
  const shell=req.mode==='navigate'||(same&&(/\/(js|css)\//.test(url.pathname)||url.pathname.endsWith('manifest.webmanifest')));
  if(shell){event.respondWith(fetch(req,{cache:'no-store'}).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(req.mode==='navigate'?'./index.html':req,r.clone()));return r}).catch(()=>caches.match(req.mode==='navigate'?'./index.html':req)));return}
  if(same)event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(req,r.clone()));return r})));
});

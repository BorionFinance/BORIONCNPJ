const VERSION='1.0.26';
const CACHE='borion-cnpj-v1.0.26';
const CORE=[
  './','./index.html',
  `./manifest.webmanifest?v=${VERSION}`,
  `./css/borion-7.6.2.css?v=${VERSION}`,
  `./css/cnpj.css?v=${VERSION}`,
  `./js/config.js?v=${VERSION}`,
  `./js/app.js?v=${VERSION}`,
  './borion-cnpj-v111-emblem.png','./borion-cnpj-v111-watermark.png',
  './borion-cnpj-v111-icon-192.png','./borion-cnpj-v111-icon-512.png',
  './borion-cnpj-v111-favicon-32.png','./borion-cnpj-v111-apple-touch-icon.png','./borion-cnpj-v111.ico'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    clients.forEach(client=>client.postMessage({type:'BORION_SW_ACTIVATED',version:VERSION}));
  })());
});

self.addEventListener('message',event=>{
  if(event.data==='SKIP_WAITING'||event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

async function networkFirst(request,fallback){
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response?.ok){const cache=await caches.open(CACHE);cache.put(request,response.clone());}
    return response;
  }catch(error){
    return (await caches.match(request))||(fallback?await caches.match(fallback):null)||Response.error();
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.hostname.includes('googleapis.com')||url.hostname.includes('accounts.google.com'))return;
  if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(networkFirst(request,'./index.html'));
    return;
  }
  if(/\/(js|css)\//.test(url.pathname)||url.pathname.endsWith('manifest.webmanifest')||url.pathname.endsWith('service-worker.js')){
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(async response=>{
    if(response?.ok){const cache=await caches.open(CACHE);cache.put(request,response.clone());}
    return response;
  })));
});

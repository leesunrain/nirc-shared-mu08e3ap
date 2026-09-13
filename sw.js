const APP_BUILD='20260914-clean1';

self.addEventListener('install',event=>{
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)))}catch(e){}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  // 항상 네트워크 최신본을 사용합니다. 예전 Cache Storage에는 다시 쓰지 않습니다.
  event.respondWith(fetch(req,{cache:'no-store'}));
});

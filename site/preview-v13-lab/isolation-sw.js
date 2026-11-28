// No persistent caching, no audio handling, no external data submission.
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
 const req=e.request;
 if(req.method!=='GET'||req.cache==='only-if-cached'&&req.mode!=='same-origin')return;
 e.respondWith((async()=>{
  const response=await fetch(req);
  // Never synthesize access to opaque cross-origin resources.
  if(response.type==='opaque'||response.status===0)return response;
  if(new URL(req.url).origin!==self.location.origin)return response;
  const h=new Headers(response.headers);
  h.set('Cross-Origin-Opener-Policy','same-origin');
  h.set('Cross-Origin-Embedder-Policy','require-corp');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
 })());
});

// Bump this version for every changed app-shell release. Never touch IndexedDB.
const PREFIX = 'table-notes-shell-' + self.registration.scope;
const CACHE = PREFIX + 'v24';
const FILES = ['./','./index.html','./style.css','./app.js','./hosting.js','./updates.js','./backup.js','./sharing.js','./sharing-ui.js','./inbox-client.js','./map.js','./vendor/leaflet.js','./vendor/leaflet.css','./core.js','./db.js','./manifest.webmanifest','./icons/favicon-32.png','./icons/michelin-star.png','./icons/restaurant-192.png','./icons/restaurant-512.png','./icons/apple-touch-icon-v2.png'];
const URLS = FILES.map(file => new URL(file,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const names=await caches.keys();await Promise.all(names.filter(name=>name.startsWith(PREFIX)&&name!==CACHE).map(name=>caches.delete(name)));await self.clients.claim();})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||!URLS.includes(event.request.url))return;event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));});


// Inbox responses and authentication are never cached. The worker only downloads deliveries.
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING'){self.skipWaiting();return;}
 if(event.data?.type==='ACTIVATE_WHEN_READY'){
  event.waitUntil((async()=>{
   const tabs=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(tab=>tab.url.startsWith(self.registration.scope));
   const ready=await Promise.all(tabs.map(tab=>new Promise(resolve=>{
    const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(false);},2000);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data?.ready===true);};
    tab.postMessage({type:'CAN_UPDATE'},[channel.port2]);
   })));
   if(ready.every(Boolean))await self.skipWaiting();
  })());return;
 }
 if(event.data?.type!=='CHECK_ASSISTANT_INBOX'||!event.ports[0])return;
 event.waitUntil((async()=>{try{
  const response=await fetch(new URL('./api/inbox',self.registration.scope),{credentials:'same-origin',cache:'no-store',redirect:'error'});
  event.ports[0].postMessage({status:response.status,data:response.ok?await response.json():null});
 }catch{event.ports[0].postMessage({status:0});}})());
});

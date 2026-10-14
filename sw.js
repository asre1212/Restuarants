// Bump this version for every changed app-shell release. Never touch IndexedDB.
const PREFIX = 'table-notes-shell-' + self.registration.scope;
const CACHE = PREFIX + 'v14';
const FILES = ['./','./index.html','./style.css','./app.js','./map.js','./vendor/leaflet.js','./vendor/leaflet.css','./core.js','./db.js','./manifest.webmanifest','./icons/icon.svg','./icons/michelin-star.png','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
const URLS = FILES.map(file => new URL(file,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const names=await caches.keys();await Promise.all(names.filter(name=>name.startsWith(PREFIX)&&name!==CACHE).map(name=>caches.delete(name)));await self.clients.claim();})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||!URLS.includes(event.request.url))return;event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));});


// Inbox responses and authentication are never cached. The worker only downloads deliveries.
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING'){self.skipWaiting();return;}
 if(event.data?.type!=='CHECK_ASSISTANT_INBOX'||!event.ports[0])return;
 event.waitUntil((async()=>{try{
  const response=await fetch(new URL('./api/inbox',self.registration.scope),{credentials:'same-origin',cache:'no-store',redirect:'error'});
  event.ports[0].postMessage({status:response.status,data:response.ok?await response.json():null});
 }catch{event.ports[0].postMessage({status:0});}})());
});

const CACHE = 'din-comms-ui-v04';
const ASSETS = ['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method!=='GET' || new URL(e.request.url).origin!==self.location.origin) return;
  e.respondWith(fetch(e.request).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(e.request,clone));}return response;}).catch(()=>caches.match(e.request)));
});

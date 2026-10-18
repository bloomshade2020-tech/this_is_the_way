const CACHE='vector-v061-assets';
const ASSETS=['./','./index.html','./vector.css','./app.js','./vault.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&(k.startsWith('din-comms-ui-')||k.startsWith('vector-'))).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const cloned=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cloned))}return r}).catch(()=>caches.match(e.request)))});

const CACHE='vector-v07-comms-compact-20261024-assets';
const ASSETS=['./','./index.html','./vector.css','./app.js','./durable-state.js','./notification-context.js','./notification-control.js','./notification-http.js','./vault.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-192.png?v=vault-a-20261021','./icon-512.png?v=vault-a-20261021'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&(k.startsWith('din-comms-ui-')||k.startsWith('vector-'))).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const cloned=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cloned))}return r}).catch(()=>caches.match(e.request)))});

self.addEventListener('push',event=>{event.waitUntil(self.registration.showNotification('VECTOR',{body:'メッセージが届いています',tag:'vector-private-message',renotify:false,icon:'./icon-192.png?v=vault-a-20261021',data:{url:'./?open=comms'}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const all=await clients.matchAll({type:'window',includeUncontrolled:true});for(const c of all){if(c.url.startsWith(self.registration.scope)){await c.focus();c.postMessage({type:'VECTOR_INBOX'});return;}}await clients.openWindow('./?open=comms');})());});

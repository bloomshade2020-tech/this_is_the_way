const BUILD='vector-shared-setup-v2-20261024';
const CACHE=BUILD+'-common-room-20261027-local-assets';
const ASSETS=['./context-audit.js','./notification-diagnostics.js','./shared-log-setup.js','./local-shared-log/installer.mjs','./local-shared-log/room-client.mjs','./local-shared-log/integration.mjs','./local-shared-log/core.mjs','./local-shared-log/relay.mjs','./','./index.html','./vector.css','./app.js','./durable-state.js','./notification-context.js','./notification-control.js','./notification-http.js','./vault.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-192.png?v=vault-a-20261021','./icon-512.png?v=vault-a-20261021'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&(k.startsWith('din-comms-ui-')||k.startsWith('vector-'))).map(k=>caches.delete(k)))));self.clients.claim()});
// A release serves its precached assets together; network cannot mix code revisions.
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.open(CACHE).then(async c=>{const cached=await c.match(e.request);if(cached)return cached;if(e.request.mode==='navigate')return c.match('./index.html');return fetch(e.request);}));});
const readyClients=new Map();
self.addEventListener('message',e=>{
 if(e.data?.type==='VECTOR_SHARED_READY'&&e.source?.id&&e.data.build===BUILD)readyClients.set(e.source.id,BUILD);
 if(e.data?.type==='VECTOR_SHARED_STATUS')e.waitUntil((async()=>{const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>c.url.startsWith(self.registration.scope));const ready=windows.length>0&&windows.every(c=>readyClients.get(c.id)===BUILD);e.ports?.[0]?.postMessage({build:BUILD,ready});})());
});

self.addEventListener('push',event=>{event.waitUntil(self.registration.showNotification('VECTOR',{body:'メッセージが届いています',tag:'vector-private-message',renotify:false,icon:'./icon-192.png?v=vault-a-20261021',data:{url:'./?open=comms'}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const all=await clients.matchAll({type:'window',includeUncontrolled:true});for(const c of all){if(c.url.startsWith(self.registration.scope)){await c.focus();c.postMessage({type:'VECTOR_INBOX'});return;}}await clients.openWindow('./?open=comms');})());});

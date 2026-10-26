// Serve an old checkout and this release at one localhost origin; no external IO.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const oldRoot=process.argv[2]&&path.resolve(process.argv[2]),newRoot=path.resolve(process.argv[3]||path.join(__dirname,'../..'));
if(!oldRoot)throw Error('Pass the previous app root as the first argument');
const pass='synthetic-upgrade-passphrase',key='din-comms-v051-encrypted-vault',currentDraft='Synthetic draft copied before update.',cache='vector-shared-setup-v2-20261024-shared-context-m4-20261025-assets';
(async()=>{
 let served=oldRoot,unexpected=0,events=0,chats=0;
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local'),f=path.resolve(served,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(served+'/')||!fs.existsSync(f)){res.statusCode=404;return res.end();}res.setHeader('cache-control','no-cache');res.setHeader('content-type',/\.m?js$/.test(f)?'application/javascript':f.endsWith('.html')?'text/html':f.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(f));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const ctx=await browser.newContext();ctx.setDefaultTimeout(15000);
  await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===base)return route.continue();if(u.hostname==='din-comms-api.bloomshade-2020.workers.dev'){
   if(u.pathname==='/notifications/inbox')return route.fulfill({json:{entries:[]}});
   if(u.pathname==='/notifications/config')return route.fulfill({json:{protocol:4,rolloutMode:'migration-stop',revision:0}});
   if(u.pathname==='/shared-log/events')events++;
   if(u.pathname==='/chat')chats++;
  }unexpected++;return route.abort();});
  const p=await ctx.newPage();await p.goto(base);await p.evaluate(()=>navigator.serviceWorker.register('/sw.js'));await p.evaluate(async()=>{await navigator.serviceWorker.ready;});await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await p.locator('#vaultPass').fill(pass);await p.locator('#vaultConfirm').fill(pass);await p.locator('#vaultSubmit').click();await p.locator('#appShell').waitFor({state:'visible'});
  const seeded=await p.evaluate(async()=>{
   const {makeEvent,target}=await import('/local-shared-log/core.mjs');
   const policy={version:1,enrollmentId:'synthetic-enrollment',ownerSub:'synthetic-owner',documentId:'synthetic-doc',logId:'synthetic-log',namespace:'synthetic-server',deviceNamespaces:['synthetic-device'],partitions:['here:inner','comms:inner','backstage:backstage','project:outer']};
   const existing={id:'captured',sender:'user',at:'2026-10-22T00:00:00.000Z',text:'Synthetic prior confirmed outside event'};
   const event=await makeEvent({logId:policy.logId,namespace:'synthetic-device',sourceRecordId:'outsideMessages:captured',source:'vector',speaker:existing.sender,channel:'project',scope:'outer',kind:'original',occurredAt:existing.at,body:existing.text});
   const state={rp:[{id:7,sender:'me',at:existing.at,text:'Synthetic numeric old history'}],apiMessages:[],backstageMessages:[],outsideMessages:[existing],backstageDraftText:'Synthetic previous saved draft',rememberAccessToken:true,savedAccessToken:'synthetic-private-placeholder',sharedLogDeviceNamespace:'synthetic-device',sharedLogClient:{version:1,build:'vector-shared-setup-v2-20261024',capture:true,exportEnabled:true,namespace:'synthetic-device',policy},sharedLogOutbox:{version:1,target:target(policy),namespace:'synthetic-device',entries:[{event,status:'confirmed'}]}};
   await DinVault.save(state);return state;
  });
  async function reopen(){await p.reload();await p.evaluate(()=>{const start=DinAppStart;window.DinAppStart=data=>{window.observedBeforeStart=structuredClone(data);const save=DinVault.save.bind(DinVault);DinVault.save=async s=>{await save(s);window.observedSaved=structuredClone(s);};return start(data);};});await p.locator('#vaultPass').fill(pass);await p.locator('#vaultSubmit').click();await p.locator('#appShell').waitFor({state:'visible'});await p.waitForFunction(()=>!!window.VectorSharedLogLocal?.store);}
  await reopen();const envelope=await p.evaluate(k=>localStorage.getItem(k),key);
  await p.locator('[data-nav="backstage"]').click();await p.locator('#backstageDraft').fill(currentDraft);await p.waitForFunction(()=>document.getElementById('toast').textContent.includes('保存できません'));
  assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),envelope);
  // Simulates the owner copying the visible draft before refresh. It is never sent.
  const copied=await p.locator('#backstageDraft').inputValue();assert.equal(copied,currentDraft);
  served=newRoot;await p.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});
  await p.waitForFunction(async name=>(await caches.keys()).includes(name)&&!(await caches.keys()).includes('vector-shared-setup-v2-20261024-assets'),cache);
  assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),envelope);assert.equal(await p.locator('#backstageDraft').inputValue(),copied);
  await reopen();assert.equal(await p.evaluate(()=>VectorSharedLogLocal.prepare.toString().includes('legacySources')),true);
  const opened=await p.evaluate(()=>observedBeforeStart);assert.deepEqual(opened,seeded);assert.deepEqual(await p.evaluate(()=>VectorSharedLogLocal.store.load()),seeded.sharedLogOutbox);
  assert.equal(await p.evaluate(async()=>{await (await import('/local-shared-log/installer.mjs')).rollout();return true;}),true);
  await p.locator('[data-nav="backstage"]').click();await p.locator('#backstageDraft').fill(copied);await p.waitForFunction(text=>window.observedSaved?.backstageDraftText===text,copied);
  const saved=await p.evaluate(()=>observedSaved);assert.deepEqual(saved.rp,seeded.rp);assert.deepEqual(saved.outsideMessages,seeded.outsideMessages);assert.deepEqual(saved.sharedLogClient,seeded.sharedLogClient);assert.deepEqual(saved.sharedLogOutbox,seeded.sharedLogOutbox);assert.equal(saved.savedAccessToken,seeded.savedAccessToken);assert.equal(saved.sharedLogChatIntents,undefined);
  assert.equal(unexpected,0);assert.equal(chats,0);assert.equal(events,0);assert(!await p.evaluate(k=>localStorage.getItem(k).includes('Synthetic draft'),key));
  console.log(JSON.stringify({passed:1,realServiceWorkerUpgrade:true,protocolBuildUnchanged:true,existingEnrollmentAndVaultPreserved:true,confirmedReceiptPreserved:true,noHistoricalImport:true,copiedDraftSavedWithoutSending:true,chats,events,external:0}));
  await ctx.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});

const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),pass='synthetic-context-retry-passphrase';
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const ctx=await browser.newContext({serviceWorkers:'block'});ctx.setDefaultTimeout(15000);let calls=0,mode='success',release,unexpected=[],seenBefore=[];
 await ctx.route('**/*',async r=>{const u=new URL(r.request().url());
  if(u.hostname==='din-comms-api.bloomshade-2020.workers.dev'){
   if(u.pathname==='/chat'){
    calls++;seenBefore.push(await r.request().frame().page().evaluate(()=>structuredClone(lastSaved)));
    if(mode==='pause')await new Promise(resolve=>release=resolve);
    if(mode==='loss')return r.abort();
    if(mode==='not-started')return r.fulfill({status:409,json:{error:'CONTEXT_PENDING',generationStarted:false}});
    return r.fulfill({json:{reply:'  Synthetic reply\n\t ',repliedAt:'2026-10-24T01:02:03Z'}});
   }
   if(u.pathname==='/notifications/config')return r.fulfill({json:{protocol:4,rolloutMode:'migration-stop',revision:0}});
   if(u.pathname==='/notifications/inbox')return r.fulfill({json:{entries:[]}});
  }
  if(u.hostname!=='vector.local'){unexpected.push(u.href);return r.abort();}
  const f=path.join(root,u.pathname==='/'?'index.html':u.pathname);return fs.existsSync(f)?r.fulfill({path:f,contentType:f.endsWith('.mjs')?'text/javascript':undefined}):r.fulfill({status:404,body:''});
 });
 const p=await ctx.newPage();
 async function load(setup=false){await p.goto('https://vector.local/');await p.evaluate(async()=>{
  const mod=await import('/local-shared-log/integration.mjs'),start=DinAppStart;
  window.DinAppStart=function(data){window.opened=structuredClone(data);window.lastSaved=structuredClone(data);const save=DinVault.save.bind(DinVault);DinVault.save=async next=>{if(window.failSave)throw Error('SYNTHETIC_QUOTA');await save(next);window.lastSaved=structuredClone(next);};
   const projection=mod.createProjection({documentId:'synthetic-doc',logId:'synthetic-log',namespace:'synthetic-device',collections:[{key:'rp',map:r=>({source:'vector',speaker:r.sender,channel:'here',scope:'inner',kind:'original',occurredAt:r.at,body:r.text})}]});mod.installLocal({projection,vault:DinVault});return start(data);
  };
 });await p.locator('#vaultPass').fill(pass);if(setup)await p.locator('#vaultConfirm').fill(pass);await p.locator('#vaultSubmit').click();await p.locator('#appShell').waitFor({state:'visible'});}
 await load(true);await p.evaluate(()=>DinVault.save({apiPrompt:'synthetic instructions',rememberAccessToken:true,savedAccessToken:'synthetic-12345678901234567890',rp:[],apiMessages:[],backstageMessages:[]}));await load();
 const original='  Synthetic 原文😀\n\t  ';
 await p.locator('[data-nav="here"]').click();await p.locator('#hereDraft').fill(original);mode='pause';await p.locator('[data-send="here"]').click();await p.waitForFunction(()=>lastSaved.sharedLogChatIntents?.length===1);while(!release)await new Promise(r=>setTimeout(r,10));
 assert.equal(seenBefore[0].rp[0].text,original);assert.equal(seenBefore[0].sharedLogOutbox.entries[0].event.body,original);assert.equal(seenBefore[0].sharedLogChatIntents[0].status,'dispatched-unknown');
 release();await p.waitForFunction(()=>lastSaved.sharedLogChatIntents[0].status==='committed');assert.equal(await p.evaluate(()=>lastSaved.rp[1].text),'  Synthetic reply\n\t ');const ids=await p.evaluate(()=>lastSaved.sharedLogOutbox.entries.map(x=>x.event.eventId));await load();assert.deepEqual(await p.evaluate(()=>opened.sharedLogOutbox.entries.map(x=>x.event.eventId)),ids);
 console.log('PASS intent: actual sendRoom durably stores raw whitespace/control text + stable identity + encrypted outbox before mocked request; exact reply and restart IDs');
 await p.locator('[data-nav="here"]').click();await p.locator('#hereDraft').fill('Synthetic rejected before dispatch');await p.evaluate(()=>window.failSave=true);const before=calls;await p.locator('[data-send="here"]').click();await p.waitForFunction(()=>document.getElementById('hereState').textContent.includes('SYNTHETIC_QUOTA'));assert.equal(calls,before);await p.evaluate(()=>window.failSave=false);
 console.log('PASS intent: failed encrypted intent save prevents model dispatch');

 await p.waitForTimeout(1450);await p.locator('#hereDraft').fill('Synthetic provably not started');mode='not-started';await p.locator('[data-send="here"]').click();await p.waitForFunction(()=>lastSaved.sharedLogChatIntents.some(x=>x.status==='not-started'));
 const refused=await p.evaluate(()=>({intent:lastSaved.sharedLogChatIntents.find(x=>x.status==='not-started'),sender:lastSaved.rp.find(x=>x.text==='Synthetic provably not started'),events:lastSaved.sharedLogOutbox.entries.map(x=>x.event.eventId)}));const refusedCalls=calls;await p.waitForTimeout(1500);assert.equal(calls,refusedCalls);
 await load();await p.locator('[data-nav="here"]').click();await p.locator('#hereDraft').fill('Synthetic provably not started');mode='pause';release=null;await p.locator('[data-send="here"]').click();while(!release)await new Promise(r=>setTimeout(r,10));
 const dispatched=seenBefore.at(-1),intent=dispatched.sharedLogChatIntents.find(x=>x.id===refused.intent.id);assert.equal(intent.status,'dispatched-unknown');assert.equal(intent.senderId,refused.intent.senderId);assert.equal(intent.replyId,refused.intent.replyId);assert.equal(dispatched.rp.filter(x=>x.id===refused.sender.id).length,1);assert.equal(dispatched.rp.find(x=>x.id===refused.sender.id).at,refused.sender.at);assert.deepEqual(dispatched.sharedLogOutbox.entries.map(x=>x.event.eventId),refused.events);release();await p.waitForFunction(()=>lastSaved.sharedLogChatIntents.every(x=>x.status==='committed'));
 assert.equal(await p.evaluate(()=>lastSaved.rp.filter(x=>x.text==='Synthetic provably not started').length),1);
 console.log('PASS explicit same-ID retry: definite generation-not-started survives restart; no autonomous retry; original sender/time/reply/outbox IDs retained');
 const lossBefore=calls;
 await p.waitForTimeout(1450);await p.locator('#hereDraft').fill('Synthetic lost response');mode='loss';await p.locator('[data-send="here"]').click();await p.waitForFunction(()=>document.getElementById('hereState').textContent.includes('送信できません'));assert.equal(calls,lossBefore+1);await load();await p.locator('[data-nav="here"]').click();await p.locator('#hereDraft').fill('Synthetic lost response');await p.locator('[data-send="here"]').click();await p.waitForFunction(()=>document.getElementById('hereState').textContent.includes('前の送信結果が未確認'));assert.equal(calls,lossBefore+1);assert.equal(await p.evaluate(()=>lastSaved.sharedLogChatIntents.filter(x=>x.status==='dispatched-unknown').length),1);assert.deepEqual(unexpected,[]);
 console.log('PASS intent: lost model response survives restart; same text cannot blindly dispatch again; original retained; no external calls');
 await ctx.close();
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

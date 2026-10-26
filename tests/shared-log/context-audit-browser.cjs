const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),output=process.env.VECTOR_AUDIT_TEST_OUTPUT||'/tmp/vector-context-audit-test';
fs.mkdirSync(output,{recursive:true});
const pass='synthetic-audit-vault-passphrase',stamp='2026-10-26T00:00:00.000Z';
const receipt=letter=>({status:'ready',revision:'snapshot_'+letter.repeat(64),checkedAt:stamp,coverage:{fullHistory:false,eligibleChunks:5,includedChunks:2,omittedChunks:3,reasons:[{code:'NO_QUERY_MATCH',chunks:3}]}});
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});context.setDefaultTimeout(15000);
 let mode='success',incoming=[],calls=[],acks=[],unexpected=[],serial=0,clock=Date.parse(stamp);const errors=[];
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='din-comms-api.bloomshade-2020.workers.dev'){
   if(u.pathname==='/chat'){
    const request=route.request().postDataJSON();calls.push(request);serial++;
    if(mode==='pending')return route.fulfill({status:409,json:{error:'SYNTHETIC_CONTEXT_PENDING',generationStarted:false}});
    if(mode==='lost')return route.abort();
    const metadata=receipt(request.channel==='here'?'a':request.channel==='comms'?'b':'c');
    if(mode==='invalid')metadata.coverage.reasons=[{code:{toString:null}}];
    if(mode==='oversize')metadata.extra='SYNTHETIC_PRIVATE_EXTRA'.repeat(500);
    return route.fulfill({json:{reply:'  Synthetic reply '+serial+'\n\t ',repliedAt:new Date(clock+500).toISOString(),usage:{input_tokens:12,output_tokens:3},...(mode==='missing'?{}:{sharedContext:metadata})}});
   }
   if(u.pathname==='/notifications/config')return route.fulfill({json:{protocol:4,rolloutMode:'migration-stop',revision:0}});
   if(u.pathname==='/notifications/inbox')return route.fulfill({json:{entries:incoming,hasMore:false}});
   if(u.pathname==='/notifications/ack'){acks.push(route.request().postDataJSON());incoming=[];return route.fulfill({json:{ok:true}});}
   unexpected.push(u.pathname);return route.abort();
  }
  if(u.hostname!=='vector.local'){unexpected.push(u.hostname);return route.abort();}
  const file=path.join(root,u.pathname==='/'?'index.html':u.pathname);
  return fs.existsSync(file)?route.fulfill({path:file,contentType:file.endsWith('.mjs')?'text/javascript':undefined}):route.fulfill({status:404,body:''});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date(clock));
 async function load(setup=false){
  await page.goto('https://vector.local/');
  await page.evaluate(async()=>{
   const {createProjection,installLocal}=await import('/local-shared-log/integration.mjs'),start=DinAppStart;
   window.DinAppStart=data=>{
    window.opened=structuredClone(data);window.saved=structuredClone(data);const save=DinVault.save.bind(DinVault);
    DinVault.save=async next=>{if(window.failReplyText&&[...next.rp,...next.apiMessages].some(m=>m.text===window.failReplyText))throw Error('SYNTHETIC_SAVE_FAILURE');await save(next);window.saved=structuredClone(next);};
    const projection=createProjection({documentId:'synthetic-audit-doc',logId:'synthetic-audit-log',namespace:'synthetic-audit-device',collections:[['rp','here','inner'],['apiMessages','comms','inner'],['backstageMessages','backstage','backstage']].map(([key,channel,scope])=>({key,map:m=>({source:'vector',speaker:m.sender,channel,scope,kind:'original',occurredAt:m.at,body:m.text})}))});
    installLocal({projection,vault:DinVault});return start(data);
   };
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text;}}});
  });
  await page.locator('#vaultPass').fill(pass);if(setup)await page.locator('#vaultConfirm').fill(pass);await page.locator('#vaultSubmit').click();await page.locator('#appShell').waitFor({state:'visible'});
 }
 async function nav(room){await page.locator('#backHome').click();await page.locator(`[data-nav="${room}"]`).click();}
 async function send(room,text){clock+=2000;await page.clock.setFixedTime(new Date(clock));await page.locator(`#${room}Draft`).fill(text);await page.locator(`[data-send="${room}"]`).click();await page.waitForFunction(room=>!document.querySelector('[data-send="'+room+'"]').disabled,room);}
 await load(true);
 await page.evaluate(()=>DinVault.save({apiPrompt:'Synthetic instructions',rememberAccessToken:true,savedAccessToken:'synthetic-token-12345678901234567890',rp:[],backstageMessages:[],apiMessages:[{id:'historical-reply',sender:'din',at:'2026-10-25T00:00:00.000Z',text:'Synthetic old reply'},{id:'historical-notice',sender:'din',source:'scheduled',at:'2026-10-25T00:01:00.000Z',text:'Synthetic old notice'}]}));await load();
 await page.locator('[data-nav="comms"]').click();await page.locator('#commsThread .context-audit-button').first().click();
 assert.match(await page.locator('#contextAuditText').innerText(),/未記録/);await page.locator('#contextAuditClose').click();
 assert.equal(await page.evaluate(()=>opened.apiMessages[0].generationAudit),undefined);
 console.log('PASS audit browser: historical reply stays unrecorded; no retrofit or network on inspect');

 await nav('here');await send('here','Synthetic HERE original');await nav('comms');await send('comms','Synthetic COMMS original');
 const pair=await page.evaluate(()=>({here:saved.rp.find(m=>m.sender==='din'),comms:saved.apiMessages.find(m=>m.exchangeId&&m.sender==='din'),events:saved.sharedLogOutbox.entries.map(e=>e.event)}));
 assert.equal(pair.here.generationAudit.revision,receipt('a').revision);assert.equal(pair.comms.generationAudit.revision,receipt('b').revision);
 assert.equal(pair.here.generationAudit.messageId,pair.here.id);assert.equal(pair.comms.generationAudit.channel,'comms');assert.equal(pair.events.length,4);
 assert(!JSON.stringify(pair.events).includes('generationAudit'));assert(!JSON.stringify(pair.events).includes('snapshot_'));
 await load();assert.deepEqual(await page.evaluate(()=>({here:opened.rp.find(m=>m.sender==='din'),comms:opened.apiMessages.find(m=>m.exchangeId&&m.sender==='din')})),{here:pair.here,comms:pair.comms});
 assert.equal(await page.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault').includes('snapshot_')),false);
 console.log('PASS audit browser: two modes/replies retain exact distinct receipts through encrypted save/reload; canonical event schema unchanged');

 await page.locator('[data-nav="comms"]').click();const beforeInspect=calls.length;
 await page.locator('#commsThread .context-audit-button').last().click();assert.match(await page.locator('#contextAuditText').innerText(),/通常COMMS/);assert((await page.locator('#contextAuditText').innerText()).includes(pair.comms.generationAudit.revision));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,'comms-audit-390.png')});
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('contextAuditDialog').open&&document.getElementById('contextAuditText').textContent==='');
 await page.locator('#commsThread .body-copy').last().click();assert.equal(await page.evaluate(()=>copied),pair.comms.text);
 await nav('here');await page.locator('#hereThread .more-btn').last().click();assert.match(await page.locator('#contextAuditText').innerText(),/通常HERE/);assert(!(await page.locator('#contextAuditText').innerText()).includes(pair.comms.generationAudit.revision));
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(output,'here-audit-1280.png')});await page.locator('#contextAuditClose').click();await page.setViewportSize({width:390,height:844});assert.equal(calls.length,beforeInspect);
 console.log('PASS audit browser: on-demand mobile/desktop dialog, per-reply mode isolation, keyboard close/focus, exact body copy, no inspection requests');

 mode='invalid';await send('here','Synthetic invalid receipt');mode='oversize';await send('here','Synthetic excessive receipt');mode='missing';await send('here','Synthetic absent receipt');
 const invalid=await page.evaluate(()=>saved.rp.filter(m=>m.sender==='din').slice(-3));assert.deepEqual(invalid.map(m=>m.generationAudit.state),['invalid','invalid','not-recorded']);assert(invalid.every(m=>m.text.startsWith('  Synthetic reply')));
 assert(!JSON.stringify(await page.evaluate(()=>saved)).includes('SYNTHETIC_PRIVATE_EXTRA'));
 console.log('PASS audit browser: malformed and oversized receipts do not lose successful reply bodies; missing metadata remains explicit');

 mode='success';await nav('backstage');await send('backstage','Synthetic outer original');assert.equal(await page.evaluate(()=>saved.backstageMessages.find(m=>m.sender==='chappy').generationAudit),undefined);assert.equal(await page.locator('#backstageThread .context-audit-button').count(),0);
 assert(!calls.some(r=>JSON.stringify(r).includes('snapshot_')));
 console.log('PASS audit browser: BACKSTAGE does not adopt a supplied shared receipt; audit fields never enter later request history');

 const firstAck=page.waitForResponse(r=>new URL(r.url()).pathname==='/notifications/ack');
 incoming=[{id:'scheduled-new',text:'Synthetic notification original',at:'2026-10-26T00:03:00.000Z',contextVersion:'synthetic-legacy-context',sharedContextRevision:receipt('d').revision}];
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForFunction(()=>saved.apiMessages.some(m=>m.id==='scheduled-new'));await page.waitForFunction(()=>saved.apiMessages.find(m=>m.id==='scheduled-new').generationAudit.state==='revision-only');
 const scheduled=await page.evaluate(()=>saved.apiMessages.find(m=>m.id==='scheduled-new'));assert.equal(scheduled.generationAudit.checkedAt,undefined);assert.equal(scheduled.generationAudit.coverage,undefined);
 await (await firstAck).finished();
 const duplicateAck=page.waitForResponse(r=>new URL(r.url()).pathname==='/notifications/ack');
 incoming=[{id:'scheduled-new',text:scheduled.text,at:scheduled.at,contextVersion:'synthetic-legacy-context',sharedContextRevision:receipt('e').revision},{id:'historical-notice',text:'Synthetic old notice',at:'2026-10-25T00:01:00.000Z',sharedContextRevision:receipt('e').revision}];
 await load();await (await duplicateAck).finished();assert.equal(incoming.length,0);
 assert.deepEqual(await page.evaluate(()=>saved.apiMessages.find(m=>m.id==='scheduled-new')),scheduled);assert.equal(await page.evaluate(()=>saved.apiMessages.find(m=>m.id==='historical-notice').generationAudit),undefined);
 await load();assert.deepEqual(await page.evaluate(()=>opened.apiMessages.find(m=>m.id==='scheduled-new')),scheduled);
 await page.locator('[data-nav="comms"]').click();const noticeIndex=await page.evaluate(()=>opened.apiMessages.filter(m=>m.sender==='din').findIndex(m=>m.id==='scheduled-new'));await page.locator('#commsThread .context-audit-button').nth(noticeIndex).click();assert.match(await page.locator('#contextAuditText').innerText(),/版だけ/);await page.locator('#contextAuditClose').click();
 console.log('PASS audit browser: autonomous revision-only receipt survives reload; duplicates cannot overwrite/backfill; old notification remains unrecorded');

 await nav('here');const repliesBefore=await page.evaluate(()=>saved.rp.filter(m=>m.sender==='din').length),beforePending=calls.length;
 mode='pending';await send('here','Synthetic rejected generation');assert.equal(calls.length,beforePending+1);assert.equal(await page.evaluate(()=>saved.rp.filter(m=>m.sender==='din').length),repliesBefore);assert.match(await page.locator('#hereState').innerText(),/生成は開始されていません/);
 mode='lost';await send('here','Synthetic lost generation response');assert.equal(await page.evaluate(()=>saved.rp.filter(m=>m.sender==='din').length),repliesBefore);
 const beforeWait=calls.length;await page.waitForTimeout(200);assert.equal(calls.length,beforeWait);
 console.log('PASS audit browser: rejected/lost responses create no reply receipt and no automatic extra model request');

 mode='success';await page.evaluate(text=>window.failReplyText=text,'  Synthetic reply '+(serial+1)+'\n\t ');await send('here','Synthetic reply save failure');assert.match(await page.locator('#hereState').innerText(),/保存に失敗/);assert.equal(await page.evaluate(()=>saved.rp.filter(m=>m.sender==='din').length),repliesBefore);await page.evaluate(()=>window.failReplyText=null);
 await load();assert.equal(await page.evaluate(()=>opened.rp.filter(m=>m.sender==='din').length),repliesBefore);
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 console.log('PASS audit browser: reply+receipt save is atomic; failed save and restart do not invent a durable receipt; zero external calls');
 await context.close();
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

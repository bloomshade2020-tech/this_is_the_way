const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),output=process.env.VECTOR_AUDIT_TEST_OUTPUT||'/tmp/vector-context-audit-test';
fs.mkdirSync(output,{recursive:true});
const pass='synthetic-audit-vault-passphrase',stamp='2026-10-26T00:00:00.000Z';
const receipt=letter=>({status:'ready',revision:'snapshot_'+letter.repeat(64),checkedAt:stamp,coverage:{fullHistory:false,eligibleChunks:5,includedChunks:2,omittedChunks:3,reasons:[{code:'NO_QUERY_MATCH',chunks:3}]}});
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});context.setDefaultTimeout(15000);
 let exported=new Map(),tickets=new Map(),phase='active',roomId='room1',roomEpoch=1;let mode='success',incoming=[],calls=[],acks=[],unexpected=[],serial=0,clock=Date.parse(stamp);const errors=[];
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='din-comms-api.bloomshade-2020.workers.dev'){
   if(u.pathname==='/shared-log/config')return route.fulfill({json:{room:{clientProtocol:1,roomId,roomEpoch,status:phase}}});
   if(u.pathname==='/shared-log/room-control'){const b=route.request().postDataJSON();if(b.action==='reserve'){let t=tickets.get(b.request.operationId);if(!t){t={...b.request,writerId:'device'};tickets.set(t.operationId,t);}return route.fulfill({json:t});}return route.fulfill({json:{status:'drained'}});}
   if(u.pathname==='/shared-log/events'){const b=route.request().postDataJSON();assert.ok(b.room?.roomId);const old=exported.get(b.event.eventId);if(old)assert.equal(old.event.recordHash,b.event.recordHash);exported.set(b.event.eventId,b);return route.fulfill({json:{status:'confirmed',eventId:b.event.eventId,recordHash:b.event.recordHash}});}
   if(u.pathname==='/chat'){
    const request=route.request().postDataJSON();calls.push(request);serial++;assert.ok(request.sharedRoom?.ticket);assert.ok(exported.has(request.currentEvent.eventId));assert.equal(exported.get(request.currentEvent.eventId).room.roomId,request.sharedRoom.roomId);
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
   const {createProjection,installLocal}=await import('/local-shared-log/integration.mjs'),{roomClient}=await import('/local-shared-log/room-client.mjs'),start=DinAppStart;
   window.DinAppStart=data=>{
    window.opened=structuredClone(data);window.saved=structuredClone(data);const save=DinVault.save.bind(DinVault);
    DinVault.save=async next=>{if(window.failReplyText&&[...next.rp,...next.apiMessages].some(m=>m.text===window.failReplyText))throw Error('SYNTHETIC_SAVE_FAILURE');await save(next);window.saved=structuredClone(next);};
    const projection=createProjection({documentId:'synthetic-audit-doc',logId:'synthetic-audit-log',namespace:'synthetic-audit-device',relay:{enrollmentId:'synthetic',enabled:()=>true},collections:[['rp','here','inner'],['apiMessages','comms','inner'],['backstageMessages','backstage','backstage']].map(([key,channel,scope])=>({key,map:m=>({source:'vector',speaker:m.sender,channel,scope,kind:'original',occurredAt:m.at,body:m.text})}))});
    const connect=projection.connect.bind(projection);projection.connect=(durable,{request})=>{connect(durable,{request});projection.room=roomClient({durable,request,projection,namespace:'synthetic-audit-device'});};
    installLocal({projection,vault:DinVault});return start(data);
   };
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text;}}});
  });
  await page.locator('#vaultPass').fill(pass);if(setup)await page.locator('#vaultConfirm').fill(pass);await page.locator('#vaultSubmit').click();await page.locator('#appShell').waitFor({state:'visible'});
 }
 async function nav(room){await page.locator('#backHome').click();await page.locator(`[data-nav="${room}"]`).click();}
 async function send(room,text){clock+=2000;await page.clock.setFixedTime(new Date(clock));await page.locator(`#${room}Draft`).fill(text);await page.locator(`[data-send="${room}"]`).click();await page.waitForFunction(room=>!document.querySelector('[data-send="'+room+'"]').disabled,room);}
 await load(true);await page.evaluate(()=>DinVault.save({apiPrompt:'Synthetic instructions',rememberAccessToken:true,savedAccessToken:'synthetic-token-12345678901234567890',rp:[],backstageMessages:[],apiMessages:[{id:'historical',sender:'din',at:'2026-10-25T00:00:00.000Z',text:'Old original'}]}));await load();
 await page.locator('[data-nav="comms"]').click();await send('comms','Synthetic common COMMS');await nav('here');await send('here','Synthetic common HERE');await nav('backstage');await send('backstage','Synthetic outer consultation');
 await page.waitForFunction(()=>saved.sharedLogOutbox.entries.length===6&&saved.sharedLogOutbox.entries.every(e=>e.status==='confirmed'));
 const saved=await page.evaluate(()=>window.saved);assert.equal(calls.length,3);assert.equal(exported.size,6);assert.equal(saved.apiMessages[0].sharedRoom,undefined);for(const key of ['apiMessages','rp','backstageMessages'])for(const m of saved[key].filter(m=>m.exchangeId))assert.equal(m.sharedRoom.roomId,'room1');assert.ok(saved.apiMessages.find(m=>m.exchangeId&&m.sender==='din').generationAudit);assert.equal(saved.backstageMessages.find(m=>m.sender==='chappy').generationAudit,undefined);console.log('PASS browser actual app sends COMMS/HERE/BACKSTAGE through room reservation and encrypted outbox; preserves audit and old originals');
 await load();assert.equal(calls.length,3);assert.equal(await page.evaluate(()=>opened.apiMessages.find(m=>m.exchangeId&&m.sender==='din').sharedRoom.roomId),'room1');await page.locator('[data-nav="comms"]').click();phase='frozen';await send('comms','Must remain draft');assert.equal(calls.length,3);assert.equal(await page.locator('#commsDraft').inputValue(),'Must remain draft');await nav('settings');await page.locator('#roomDrain').click();await page.waitForFunction(()=>document.querySelector('#sharedStatus').textContent.includes('この端末の保存待ち'));console.log('PASS browser reload preserves routing; freeze blocks generation and explicit drain check works');
 phase='active';roomId='room2';roomEpoch=2;await nav('comms');await send('comms','Synthetic next room');assert.equal(calls.at(-1).sharedRoom.roomId,'room2');assert.ok([...exported.values()].some(x=>x.room.roomId==='room2'));assert.equal(await page.evaluate(()=>saved.apiMessages.find(m=>m.text==='Synthetic common COMMS').sharedRoom.roomId),'room1');console.log('PASS browser new send uses new room while previously saved originals retain old target');
 mode='lost';await send('comms','Synthetic unknown result');const n=calls.length;await load();await page.locator('[data-nav="comms"]').click();await send('comms','Synthetic unknown result');assert.equal(calls.length,n);assert.match(await page.locator('#commsState').innerText(),/OUTCOME_UNKNOWN/);assert.equal(unexpected.length,0,unexpected.join(','));assert.deepEqual(errors,[]);console.log('PASS browser uncertain generation survives reload and never redispatches; all network mocked');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

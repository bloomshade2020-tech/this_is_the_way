// Real encrypted vault, app handler and localhost SW. Every external request is mocked.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(process.argv.slice(2).find(arg=>!arg.startsWith('--'))||path.join(__dirname,'../..')),fixed=process.argv.includes('--fixed');
const protectedGuard=process.argv.includes('--protected');
const pass='synthetic-legacy-passphrase',body='Synthetic BACKSTAGE compatibility check. Not RP.';
const sample={sender:'me',at:'2026-10-22T00:00:00.000Z',text:'synthetic previous history'};
const protectedRecord={...sample,id:'captured',sharedLogOrigin:{sourceRecordId:'comms:captured',eventId:'synthetic-server-origin'}};
const variants=protectedGuard?{capturedDuplicate:[protectedRecord,structuredClone(protectedRecord)]}:{numeric:[{...sample,id:10}],missing:[{...sample}],duplicate:[{...sample,id:'old'},{...sample,id:'old',text:'different old text'}]};
(async()=>{
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(root+'/')||!fs.existsSync(f)){res.statusCode=404;return res.end();}res.setHeader('content-type',/\.m?js$/.test(f)?'application/javascript':f.endsWith('.html')?'text/html':f.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(f));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const [name,old] of Object.entries(variants)){
  let chats=0,unexpected=0;const sent=new Map();
  const policy={version:1,enrollmentId:'synthetic-enrollment',ownerSub:'synthetic-owner',documentId:'synthetic-doc',logId:'synthetic-log',namespace:'synthetic-server',deviceNamespaces:['synthetic-device'],partitions:['here:inner','comms:inner','backstage:backstage','project:outer']};
  const ctx=await browser.newContext();ctx.setDefaultTimeout(12000);
  await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===base)return route.continue();if(u.hostname!=='din-comms-api.bloomshade-2020.workers.dev'){unexpected++;return route.abort();}
   if(u.pathname==='/chat'){chats++;return route.fulfill({json:{reply:'Synthetic reply.',repliedAt:'2026-10-25T00:40:00.000Z',usage:{input_tokens:1,output_tokens:1}}});}
   if(u.pathname==='/shared-log/config')return route.fulfill({json:{active:true,everActivated:true,policy,clientBuild:'vector-shared-setup-v2-20261024'}});
   if(u.pathname==='/shared-log/events'){const {event}=route.request().postDataJSON();sent.set(event.eventId,(sent.get(event.eventId)||0)+1);return route.fulfill({json:{status:'confirmed',eventId:event.eventId,recordHash:event.recordHash}});}
   if(u.pathname==='/notifications/inbox')return route.fulfill({json:{entries:[]}});
   if(u.pathname==='/notifications/config')return route.fulfill({json:{protocol:4,rolloutMode:'migration-stop',revision:0}});
   unexpected++;return route.abort();
  });
  const p=await ctx.newPage();await p.goto(base);await p.evaluate(()=>navigator.serviceWorker.register('/sw.js'));await p.evaluate(async()=>{await navigator.serviceWorker.ready;});await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await p.locator('#vaultPass').fill(pass);await p.locator('#vaultConfirm').fill(pass);await p.locator('#vaultSubmit').click();await p.locator('#appShell').waitFor({state:'visible'});
  // Construct a synthetic previously installed vault. No original IDs are rewritten.
  await p.evaluate(async({old,policy})=>{await DinVault.save({rp:old,apiMessages:[],backstageMessages:[],outsideMessages:[],backstageDraftText:'',rememberAccessToken:true,savedAccessToken:'synthetic-token-only',sharedLogDeviceNamespace:'synthetic-device',sharedLogClient:{version:1,build:'vector-shared-setup-v2-20261024',capture:true,exportEnabled:true,namespace:'synthetic-device',policy}});},{old,policy});
  await p.reload();await p.locator('#vaultPass').fill(pass);await p.locator('#vaultSubmit').click();await p.locator('#appShell').waitFor({state:'visible'});await p.waitForFunction(()=>!!window.VectorSharedLogLocal?.store);
  // Observe the real encrypted save boundary without changing its behavior.
  await p.evaluate(()=>{window.savedCandidates=[];const original=DinVault.save.bind(DinVault);DinVault.save=async state=>{await original(state);savedCandidates.push(structuredClone(state));};});
  const encryptedBefore=await p.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault'));
  await p.locator('[data-nav="backstage"]').click();await p.locator('#backstageDraft').fill(body);
  if(!fixed)await p.waitForFunction(()=>document.getElementById('toast').textContent.includes('保存できません'));
  if(protectedGuard)assert.equal(await p.locator('#toast').textContent(),'記録IDの重複・形式を確認できず保存できません。下書きを控え、画面は閉じないでください。');
  await p.locator('[data-send="backstage"]').click();
  if(!fixed){
   await p.waitForFunction(()=>document.getElementById('backstageState').textContent.includes('DUPLICATE_SOURCE_ID'));
   assert.equal(await p.locator('#backstageState').textContent(),'送信できませんでした：DUPLICATE_SOURCE_ID。下書きは残っています。');
   assert.equal(chats,0);assert.equal(sent.size,0);assert.equal(await p.locator('#backstageDraft').inputValue(),body);
   assert.equal(await p.evaluate(()=>savedCandidates.length),0);assert.equal(await p.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault')),encryptedBefore);
  }else{
   await p.waitForFunction(()=>document.getElementById('backstageDraft').value==='');
   // Read-only wait for the current drain; do not force another flush or send.
   try{await p.waitForFunction(()=>savedCandidates.at(-1)?.sharedLogOutbox?.entries.length===2&&savedCandidates.at(-1).sharedLogOutbox.entries.every(e=>e.status==='confirmed'));}catch(error){console.log(JSON.stringify({case:name,chats,eventRequests:[...sent.values()],diagnostic:await p.evaluate(()=>({statuses:savedCandidates.at(-1)?.sharedLogOutbox?.entries.map(e=>e.status),relayError:VectorSharedLogLocal.lastRelayError,draining:VectorSharedLogLocal.draining}))}));throw error;}
   const saved=await p.evaluate(()=>savedCandidates.at(-1));assert.deepEqual(saved.rp,old);assert.equal(saved.backstageMessages.length,2);assert.equal(saved.sharedLogChatIntents.length,1);assert.equal(saved.sharedLogChatIntents[0].status,'committed');
   assert.equal(chats,1);assert.equal(sent.size,2);assert.deepEqual([...sent.values()],[1,1]);assert(saved.sharedLogOutbox.entries.every(e=>e.event.channel==='backstage'&&e.event.scope==='backstage'));assert.equal(saved.sharedLogOutbox.entries[0].event.body,body);
   assert(!await p.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault').includes('Synthetic BACKSTAGE')));
   await p.reload();await p.locator('#vaultPass').fill(pass);await p.locator('#vaultSubmit').click();await p.locator('#appShell').waitFor({state:'visible'});await p.waitForFunction(()=>!!window.VectorSharedLogLocal?.store);assert.equal((await p.evaluate(()=>VectorSharedLogLocal.store.load())).entries.length,2);assert.equal(chats,1);assert.deepEqual([...sent.values()],[1,1]);
  }
  assert.equal(unexpected,0);console.log(JSON.stringify({case:name,fixed,chats,eventRequests:[...sent.values()].reduce((a,b)=>a+b,0),externalRequests:0,baselinePreserved:true}));await ctx.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

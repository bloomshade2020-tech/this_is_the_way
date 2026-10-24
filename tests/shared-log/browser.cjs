const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),pass='synthetic-shared-log-pass-2026';
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});ctx.setDefaultTimeout(15000);let modelCalls=0,unexpected=[];
await ctx.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname==='din-comms-api.bloomshade-2020.workers.dev'){
 if(u.pathname==='/chat'){modelCalls++;return r.fulfill({json:{reply:'合成の返答 '+modelCalls,repliedAt:'2026-10-22T00:00:00Z'}});}
 if(u.pathname==='/notifications/config')return r.fulfill({json:{protocol:4,rolloutMode:'migration-stop',revision:0}});
 if(u.pathname==='/notifications/inbox')return r.fulfill({json:{entries:[]}});
 unexpected.push(u.pathname);return r.abort();}
 if(u.hostname!=='vector.local'){unexpected.push(u.hostname);return r.abort();}
 const f=path.join(root,u.pathname==='/'?'index.html':u.pathname);return fs.existsSync(f)?r.fulfill({path:f,contentType:f.endsWith('.mjs')?'text/javascript':undefined}):r.fulfill({status:404,body:''});});
async function load(p,setup=false){await p.goto('https://vector.local/');await p.evaluate(async()=>{
 const mod=await import('/local-shared-log/integration.mjs');const start=window.DinAppStart;
 window.DinAppStart=function(data){window.opened=structuredClone(data);const save=DinVault.save.bind(DinVault);
 DinVault.save=async candidate=>{if(window.failSave)throw Error('SYNTHETIC_QUOTA');await save(candidate);window.lastSaved=structuredClone(candidate);};
 const projection=mod.createProjection({documentId:'mock-only',logId:'synthetic-log',namespace:'synthetic-device',collections:[['rp','here','inner'],['apiMessages','comms','inner'],['backstageMessages','backstage','backstage']].map(([key,channel,scope])=>({key,map:r=>({source:'vector',speaker:r.sender,channel,scope,kind:'original',occurredAt:r.at,body:r.text})}))});
 mod.installLocal({projection,vault:DinVault,readEnvelope:()=>localStorage.getItem('din-comms-v051-encrypted-vault'),locks:navigator.locks,lockName:'vector-shared-log-synthetic'});return start(data);};
 });await p.locator('#vaultPass').fill(pass);if(setup)await p.locator('#vaultConfirm').fill(pass);await p.locator('#vaultSubmit').click();await p.locator('#appShell').waitFor({state:'visible'});}
const p=await ctx.newPage();await load(p,true);
// Establish only synthetic local credentials/settings, no external request can escape routing.
await p.evaluate(async()=>{await DinVault.save({apiPrompt:'synthetic instructions',rememberAccessToken:true,savedAccessToken:'synthetic-123456789012345678901234',rp:[],apiMessages:[],backstageMessages:[]});});
await load(p);
for(const room of ['here','comms','backstage']){await p.locator('[data-nav="'+room+'"]').click();await p.locator('#'+(room==='here'?'here':room)+'Draft').fill('合成原文 '+room);await p.locator('[data-send="'+room+'"]').click();await p.waitForFunction(n=>window.lastSaved?.sharedLogOutbox?.entries.length>=n,room==='here'?2:room==='comms'?4:6);await p.locator('#backHome').click();}
assert.equal(await p.evaluate(()=>lastSaved.sharedLogOutbox.entries.length),6);const ids=await p.evaluate(()=>lastSaved.sharedLogOutbox.entries.map(x=>x.event.eventId));
assert(!await p.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault').includes('合成原文')));
await load(p);assert.deepEqual(await p.evaluate(()=>opened.sharedLogOutbox.entries.map(x=>x.event.eventId)),ids);
await p.locator('[data-nav="here"]').click();await p.locator('#hereDraft').fill('保持する下書き');await p.waitForTimeout(700);await p.evaluate(()=>DinVault.flush());
await p.locator('#backHome').click();await p.locator('[data-nav="settings"]').click();await p.locator('#lockNow').click();await p.locator('#vaultScreen').waitFor({state:'visible'});
await load(p);assert.equal(await p.evaluate(()=>opened.rpDraftText),'保持する下書き');assert.deepEqual(await p.evaluate(()=>opened.sharedLogOutbox.entries.map(x=>x.event.eventId)),ids);
console.log('PASS browser: actual encrypted vault, 3 rooms atomic history/outbox, reload, lock, draft, exact IDs');
// Second participating tab starts at same envelope. First tab persists; second must fail closed.
const p2=await ctx.newPage();await load(p2);await p.locator('[data-nav="here"]').click();await p.locator('#hereDraft').fill('tab one latest');await p.waitForTimeout(700);await p.evaluate(()=>DinVault.flush());
await p2.locator('[data-nav="here"]').click();await p2.locator('#hereDraft').fill('tab two stale');await p2.waitForFunction(()=>document.getElementById('toast').textContent.includes('保存できません'));
assert.equal(await p2.locator('#hereDraft').inputValue(),'tab two stale');await p2.close();
await load(p);assert.equal(await p.evaluate(()=>opened.rpDraftText),'tab one latest');assert.equal(await p.evaluate(()=>opened.sharedLogOutbox.entries.length),6);
console.log('PASS browser: two real tabs, Web Locks, stale write refused, latest durable draft preserved');
// Deterministic unlock race: B decrypts E0 while A writes E1.
const p3=await ctx.newPage();await p3.addInitScript(()=>{const derive=crypto.subtle.deriveKey.bind(crypto.subtle);crypto.subtle.deriveKey=async(...args)=>{const key=await derive(...args);await new Promise(resolve=>window.releaseUnlock=resolve);return key;};});
const opening=load(p3);await p3.waitForFunction(()=>!!window.releaseUnlock);
await p.locator('[data-nav="here"]').click();await p.locator('#hereDraft').fill('new during other tab unlock');await p.waitForTimeout(700);await p.evaluate(()=>DinVault.flush());const latest=await p.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault'));
await p3.evaluate(()=>releaseUnlock());await opening;assert.notEqual(await p3.evaluate(()=>DinVault.writeBaseToken()),latest);
await p3.locator('[data-nav="here"]').click();await p3.locator('#hereDraft').fill('stale decrypted draft');await p3.waitForFunction(()=>document.getElementById('toast').textContent.includes('保存できません'));assert.equal(await p3.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault')),latest);await p3.close();
console.log('PASS browser: E0 decrypt paused, A saves E1, B cannot overwrite after finishing unlock');
// Startup fallback race: E0 requests remembered unlock; IndexedDB fails before guard installation.
await p.evaluate(async()=>{await DinVault.save({...window.lastSaved,stayUnlocked:true});});
const fallbackE0=await p.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault'));
const p4=await ctx.newPage();let fallbackAlerts=0;p4.on('dialog',async d=>{fallbackAlerts++;await d.accept();});
await p4.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{value:undefined});const derive=crypto.subtle.deriveKey.bind(crypto.subtle);crypto.subtle.deriveKey=async(...args)=>{const key=await derive(...args);await new Promise(resolve=>window.releaseFallbackUnlock=resolve);return key;};});
const fallbackOpening=load(p4);await p4.waitForFunction(()=>!!window.releaseFallbackUnlock);
await p.locator('#hereDraft').fill('E1 newer while B fallback pending');await p.waitForTimeout(700);await p.evaluate(()=>DinVault.flush());const fallbackE1=await p.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault'));assert.notEqual(fallbackE0,fallbackE1);
await p4.evaluate(()=>releaseFallbackUnlock());await fallbackOpening;assert.equal(fallbackAlerts,1);assert.equal(await p4.evaluate(()=>opened.stayUnlocked),false);assert.equal(await p4.evaluate(()=>DinVault.writeBaseToken()),fallbackE0);assert.equal(await p4.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault')),fallbackE1);
await p4.locator('[data-nav="here"]').click();await p4.locator('#hereDraft').fill('stale fallback draft');await p4.waitForFunction(()=>document.getElementById('toast').textContent.includes('保存できません'));assert.equal(await p4.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault')),fallbackE1);await p4.close();
console.log('PASS browser: IndexedDB failure startup fallback never persists stale E0; A E1 and outbox survive; later stale save refused');
// Actual encrypted vault receipt merge while new chat/history arrives.
await p.evaluate(async()=>{const core=await import('/local-shared-log/core.mjs');const target={documentId:'mock-only',logId:'synthetic-log'};const drive={text:core.header(target),rev:0,calls:0,async read(){return {text:this.text,revision:String(this.rev)};},async append(_id,r){this.calls++;if(this.calls===1)await new Promise(resolve=>window.releaseDrive=resolve);if(r.requiredRevisionId!==String(this.rev))throw Object.assign(Error('stale'),{code:'REVISION_CONFLICT'});this.text+=r.text;this.rev++;}};window.mockDrive=drive;window.mockFlush=new core.Outbox({target,store:VectorSharedLogLocal.store,drive}).flush().then(()=>window.flushDone=true).catch(e=>window.flushError=e.message);});
await p.waitForFunction(()=>!!window.releaseDrive);await p.locator('#hereDraft').fill('new during Drive receipt');await p.locator('[data-send="here"]').click();await p.waitForFunction(()=>lastSaved.sharedLogOutbox.entries.length===8);await p.locator('#hereDraft').fill('typing during receipt');await p.waitForTimeout(700);await p.evaluate(()=>releaseDrive());await p.waitForFunction(()=>window.flushDone||window.flushError);assert.equal(await p.evaluate(()=>window.flushError),undefined);
assert.deepEqual(await p.evaluate(()=>lastSaved.sharedLogOutbox.entries.map(x=>x.status)),['confirmed','confirmed','confirmed','confirmed','confirmed','confirmed','pending','pending']);assert.equal(await p.evaluate(()=>lastSaved.rpDraftText),'typing during receipt');assert.equal(await p.evaluate(()=>lastSaved.rp.length),4);
await load(p);assert.equal(await p.evaluate(()=>opened.sharedLogOutbox.entries.length),8);assert.equal(await p.evaluate(()=>opened.sharedLogOutbox.entries.filter(x=>x.status==='confirmed').length),6);
console.log('PASS browser: mocked Drive confirmations merge atomically with new originals/outbox/draft; encrypted reload retains both');
// Failed chat save must not create history/outbox. Later retry saves one pair.
await p.locator('[data-nav="here"]').click();await p.locator('#hereDraft').fill('保存失敗テスト');await p.waitForTimeout(600);await p.evaluate(()=>window.failSave=true);await p.locator('[data-send="here"]').click();await p.waitForFunction(()=>document.getElementById('hereState').textContent.includes('SYNTHETIC_QUOTA'));
assert.equal(await p.locator('#hereDraft').inputValue(),'保存失敗テスト');await p.evaluate(()=>window.failSave=false);await p.waitForTimeout(1500);await p.locator('[data-send="here"]').dblclick();await p.waitForFunction(()=>window.lastSaved?.sharedLogOutbox.entries.length===10);await p.locator('#backHome').click();await p.locator('[data-nav="backstage"]').click();await p.locator('#backHome').click();
assert.equal(await p.evaluate(()=>lastSaved.rp.length),6);assert.equal(await p.evaluate(()=>lastSaved.sharedLogOutbox.entries.length),10);assert.deepEqual(unexpected,[]);
console.log('PASS browser: quota failure preserves draft/history/outbox; repeated click saves one pair; navigation safe; all remote requests mocked');
// Without competing updates, the effective false setting persists on an ordinary guarded save.
await p.evaluate(async()=>{await DinVault.save({...window.lastSaved,stayUnlocked:true});});const beforeFallback=await p.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault'));
const p5=await ctx.newPage();p5.on('dialog',d=>d.accept());await p5.addInitScript(()=>Object.defineProperty(window,'indexedDB',{value:undefined}));await load(p5);assert.equal(await p5.evaluate(()=>opened.stayUnlocked),false);assert.equal(await p5.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault')),beforeFallback);
await p5.locator('[data-nav="here"]').click();await p5.locator('#hereDraft').fill('ordinary guarded save after fallback');await p5.waitForTimeout(700);await p5.evaluate(()=>DinVault.flush());assert.equal(await p5.evaluate(()=>lastSaved.stayUnlocked),false);assert.equal(await p5.evaluate(()=>lastSaved.sharedLogOutbox.entries.length),10);assert.notEqual(await p5.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault')),beforeFallback);
console.log('PASS browser: no-race IndexedDB fallback is memory-only until ordinary guarded save persists false and preserves queue');
await ctx.close();}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});

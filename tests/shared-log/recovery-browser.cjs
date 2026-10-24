const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),pass='synthetic-recovery-passphrase',key='din-comms-v051-encrypted-vault';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({serviceWorkers:'block'});context.setDefaultTimeout(12000);
  const unexpected=[];
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='vector.local'){unexpected.push(u.hostname);return route.abort();}
   const p=path.join(root,u.pathname==='/'?'index.html':u.pathname);return fs.existsSync(p)?route.fulfill({path:p}):route.fulfill({status:404,body:''});
  });
  async function page(){const p=await context.newPage();await p.goto('https://vector.local/');await p.evaluate(()=>window.DinAppStart=data=>{window.opened=data;window.started=true;});return p;}
  async function submit(p,setup=false){await p.locator('#vaultPass').fill(pass);if(setup)await p.locator('#vaultConfirm').fill(pass);await p.locator('#vaultSubmit').click();}
  // Two fresh tabs both begin creation against null. B must not replace A.
  const a=await page(),b=await page();
  await b.evaluate(()=>{const derive=crypto.subtle.deriveKey.bind(crypto.subtle);crypto.subtle.deriveKey=async(...args)=>{const result=await derive(...args);await new Promise(r=>window.finishCreate=r);return result;};});
  await submit(b,true);await b.waitForFunction(()=>!!window.finishCreate);
  await submit(a,true);await a.waitForFunction(()=>window.started);await a.evaluate(()=>DinVault.save({marker:'A latest',rp:[]}));
  const first=await a.evaluate(k=>localStorage.getItem(k),key);
  await b.evaluate(()=>finishCreate());await b.waitForFunction(()=>document.getElementById('vaultStatus').textContent.includes('STALE'));
  assert.equal(await a.evaluate(k=>localStorage.getItem(k),key),first);await b.close();
  console.log('PASS recovery: concurrent initial creation cannot overwrite the winner');
  // Recovery operation captures E0, waits behind an E1 save, then refuses E0.
  async function race(kind){
   const r=await page();r.on('dialog',d=>d.accept(d.type()==='prompt'?'RESET':undefined));
   const backup=await a.evaluate(()=>JSON.stringify(DinVault.encryptedBackup()));
   await a.evaluate(async()=>{
    const encrypt=crypto.subtle.encrypt.bind(crypto.subtle);crypto.subtle.encrypt=async(...args)=>{const encrypted=await encrypt(...args);await new Promise(r=>window.finishSave=r);return encrypted;};
    window.savePending=DinVault.save({marker:'newer than recovery'});
   });await a.waitForFunction(()=>!!window.finishSave);
   if(kind==='restore')await r.locator('#vaultImportFile').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});
   else {await r.locator('.vault-help summary').click();await r.locator('#vaultResetBtn').click();}
   // Await the asynchronous lock observation itself; do not let a Promise count
   // as a truthy polling predicate before the recovery handler joins the queue.
   const recoveryQueued=await a.evaluate(async()=>{const end=performance.now()+8000;do{if((await navigator.locks.query()).pending.some(x=>x.name==='vector-encrypted-vault-write-v1'))return true;await new Promise(resolve=>setTimeout(resolve,25));}while(performance.now()<end);return false;});
   assert.equal(recoveryQueued,true,'recovery must hold its stale envelope before releasing the competing save');
   await a.evaluate(()=>finishSave());await a.evaluate(()=>savePending);
   const latest=await a.evaluate(k=>localStorage.getItem(k),key);
   await r.waitForFunction(()=>/復元できません|初期化できません/.test(document.getElementById('vaultStatus').textContent));
   assert.equal(await r.evaluate(k=>localStorage.getItem(k),key),latest);
   await r.close();await a.reload();await a.evaluate(()=>window.DinAppStart=data=>{window.opened=data;window.started=true;});await submit(a);await a.waitForFunction(()=>window.started);
  }
  await race('restore');await race('reset');
  console.log('PASS recovery: queued restore/reset cannot erase a newer encrypted save');
  // A successful restore invalidates every old tab's next save.
  const c=await page();c.on('dialog',d=>d.accept());const backup=await a.evaluate(()=>JSON.stringify(DinVault.encryptedBackup()));
  const old=await page();await submit(old);await old.waitForFunction(()=>window.started);
  await a.evaluate(()=>DinVault.save({marker:'before explicit restore'}));
  await c.locator('#vaultImportFile').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});
  await c.waitForFunction(raw=>{const current=JSON.parse(localStorage.getItem('din-comms-v051-encrypted-vault'));return current.data===JSON.parse(raw).data&&!!current.restoredRevision;},backup);
  assert.match(await a.evaluate(()=>DinVault.save({marker:'must not overwrite restore'}).then(()=>'',e=>e.message)),/STALE/);
  assert.match(await old.evaluate(()=>DinVault.save({marker:'ABA stale E0'}).then(()=>'',e=>e.message)),/STALE/);
  const restored=await a.evaluate(k=>localStorage.getItem(k),key);assert.notEqual(restored,backup);assert.equal(JSON.parse(restored).data,JSON.parse(backup).data);await old.close();
  await c.close();
  console.log('PASS recovery: explicit restore invalidates all old tabs, including an E0 tab after E0 backup restore (ABA)');
  const capacity=await page();await submit(capacity);await capacity.waitForFunction(()=>window.started);
  const beforeCapacity=await capacity.evaluate(k=>localStorage.getItem(k),key);
  assert.equal(await capacity.evaluate(()=>DinVault.save({body:'x'.repeat(9_100_000)}).then(()=>'',e=>e.message)),'VAULT_CAPACITY_EXCEEDED');
  assert.equal(await capacity.evaluate(k=>localStorage.getItem(k),key),beforeCapacity);await capacity.close();
  console.log('PASS recovery: envelope exceeding restore byte cap rejected before persistence; original vault intact');
  // No lock support leaves ordinary app available but shared logging cannot install.
  const d=await context.newPage();await d.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));await d.goto('https://vector.local/');
  assert.equal(await d.evaluate(()=>DinVault.sharedLogWriteGuardReady()),false);
  assert.deepEqual(unexpected,[]);await context.close();
  console.log('PASS recovery: no-lock shared-log capability fails closed; no remote requests');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

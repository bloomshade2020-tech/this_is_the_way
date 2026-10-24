const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),pass='synthetic-comms-passphrase';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({serviceWorkers:'block'});context.setDefaultTimeout(12000);
  let incoming=[],acks=[],inboxes=0;const unexpected=[];
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='din-comms-api.bloomshade-2020.workers.dev'){
    if(u.pathname==='/notifications/config')return route.fulfill({json:{protocol:4,rolloutMode:'migration-stop',revision:0}});
    if(u.pathname==='/notifications/inbox'){inboxes++;return route.fulfill({json:{entries:incoming,hasMore:false}});}
    if(u.pathname==='/notifications/ack'){acks.push(route.request().postDataJSON());return route.fulfill({json:{ok:true}});}
    unexpected.push(u.pathname);return route.abort();
   }
   if(u.hostname!=='vector.local'){unexpected.push(u.hostname);return route.abort();}
   const p=path.join(root,u.pathname==='/'?'index.html':u.pathname);return fs.existsSync(p)?route.fulfill({path:p,contentType:p.endsWith('.mjs')?'text/javascript':undefined}):route.fulfill({status:404,body:''});
  });
  const p=await context.newPage();
  async function load(setup=false,fail=false){
   await p.goto('https://vector.local/');await p.evaluate(async fail=>{
    window.failSave=fail;
    const {createProjection,installLocal}=await import('/local-shared-log/integration.mjs'),start=window.DinAppStart;
    window.DinAppStart=function(data){window.opened=structuredClone(data);const save=DinVault.save.bind(DinVault);
     DinVault.save=async next=>{if(window.failSave)throw Error('SYNTHETIC_QUOTA');await save(next);window.saved=structuredClone(next);};
     const projection=createProjection({documentId:'synthetic-comms-document',logId:'synthetic-comms-log',namespace:'synthetic-device',collections:[['rp','here','inner'],['apiMessages','comms','inner'],['backstageMessages','backstage','backstage']].map(([key,channel,scope])=>({key,map:r=>({source:'vector',speaker:r.sender,channel,scope,kind:'original',occurredAt:r.at,body:r.text})}))});
     installLocal({projection,vault:DinVault});return start(data);
    };
   },fail);await p.locator('#vaultPass').fill(pass);if(setup)await p.locator('#vaultConfirm').fill(pass);await p.locator('#vaultSubmit').click();await p.locator('#appShell').waitFor({state:'visible'});
  }
  await load(true);await p.evaluate(()=>DinVault.save({rememberAccessToken:true,savedAccessToken:'synthetic-token-1234567890123456789',rp:[],apiMessages:[],backstageMessages:[]}));
  const longText='  合成COMMS\n🙂\u0000\t\\EVENT '.repeat(6000)+'末尾\n  ';
  incoming=[{id:'scheduled-synthetic-1',text:longText,at:'2026-10-24T00:00:00Z',contextVersion:'synthetic-context'}];
  const previous=inboxes;await load(false,true);
  await p.waitForFunction(()=>document.getElementById('notificationStatus').textContent.includes('SYNTHETIC_QUOTA'));
  assert(inboxes>previous);assert.equal(acks.length,0);assert.equal(await p.evaluate(()=>window.saved?.sharedLogOutbox?.entries.length||0),0);
  await p.evaluate(()=>{window.failSave=false;document.dispatchEvent(new Event('visibilitychange'));});
  await p.waitForFunction(()=>window.saved?.sharedLogOutbox?.entries.length===1);
  await p.waitForFunction(()=>document.getElementById('notificationStatus').textContent!=='');
  // ACK is asynchronous after durable save; observe its completion via intercepted request.
  for(let i=0;i<40&&acks.length<1;i++)await new Promise(r=>setTimeout(r,25));
  assert.equal(acks.length,1);assert.deepEqual(acks[0].ids,['scheduled-synthetic-1']);
  const entry=await p.evaluate(()=>saved.sharedLogOutbox.entries[0]);assert.equal(entry.status,'pending');assert.equal(entry.event.body,longText);assert.equal(entry.event.sourceRecordId,'apiMessages:scheduled-synthetic-1');
  assert.equal(await p.evaluate(()=>saved.apiMessages[0].text),longText);
  assert(!await p.evaluate(()=>localStorage.getItem('din-comms-v051-encrypted-vault').includes('合成COMMS')));
  console.log('PASS COMMS: quota failure withholds device ACK; retry saves complete >4096-character body and outbox atomically, then ACKs while Drive stays pending');
  await load();await p.waitForFunction(()=>window.saved?.sharedLogOutbox?.entries.length===1);assert.equal(await p.evaluate(()=>saved.sharedLogOutbox.entries[0].event.eventId),entry.event.eventId);assert.equal(await p.evaluate(()=>saved.apiMessages.length),1);
  console.log('PASS COMMS: repeated inbox event after restart preserves one body and one stable event ID');
  await p.evaluate(async()=>{
   const core=await import('/local-shared-log/core.mjs'),{createMockDocsAdapter}=await import('/local-shared-log/docs-adapter.mjs');
   const target={documentId:'synthetic-comms-document',logId:'synthetic-comms-log'};
   window.doc={text:core.header(target),revision:0,writes:0,unavailable:false};
   const drive=createMockDocsAdapter({...target,request:async r=>{
    if(r.method==='documents.get'){
     if(doc.unavailable)throw Error('SYNTHETIC_READ_OFFLINE');
     return {documentId:target.documentId,revisionId:String(doc.revision),tabs:[{tabProperties:{tabId:'synthetic-tab'},documentTab:{body:{content:[{paragraph:{elements:[{textRun:{content:doc.text+'\n'}}]}}]}}}]};
    }
    if(r.body.writeControl.requiredRevisionId!==String(doc.revision))throw Object.assign(Error('stale'),{code:'REVISION_CONFLICT'});
    doc.text+=r.body.requests[0].insertText.text;doc.revision++;doc.writes++;doc.unavailable=true;throw Error('SYNTHETIC_RESPONSE_LOST');
   }});
   window.makeOutbox=()=>new core.Outbox({target,store:VectorSharedLogLocal.store,drive});
   window.flushError=await makeOutbox().flush().then(()=>'',e=>e.message);
  });
  assert.equal(await p.evaluate(()=>flushError),'WRITE_UNKNOWN');assert.equal(await p.evaluate(()=>saved.sharedLogOutbox.entries[0].status),'unknown');
  const diskDoc=await p.evaluate(()=>({...doc,unavailable:false}));await load();
  await p.evaluate(async savedDoc=>{
   const core=await import('/local-shared-log/core.mjs');window.doc=savedDoc;const target={documentId:'synthetic-comms-document',logId:'synthetic-comms-log'};
   await new core.Outbox({target,store:VectorSharedLogLocal.store,drive:{read:async()=>({text:doc.text,revision:String(doc.revision)}),append:async()=>{doc.writes++;throw Error('MUST_NOT_RESEND');}}}).flush();
   window.parsed=await core.parse(doc.text,target);
  },diskDoc);
  assert.equal(await p.evaluate(()=>saved.sharedLogOutbox.entries[0].status),'confirmed');assert.equal(await p.evaluate(()=>doc.writes),1);assert.equal(await p.evaluate(()=>parsed.physicalCount),1);assert.equal(await p.evaluate(()=>parsed.events[0].body),longText);
  assert.deepEqual(unexpected,[]);await context.close();
  console.log('PASS COMMS: Docs-shaped mock loses append response; encrypted restart readback confirms exact long text without a second write; all external requests intercepted');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

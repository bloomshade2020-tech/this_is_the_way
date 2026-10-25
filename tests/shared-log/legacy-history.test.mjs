import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createProjection} from '../../local-shared-log/integration.mjs';
import {collections} from '../../local-shared-log/installer.mjs';
import {makeEvent} from '../../local-shared-log/core.mjs';
const {create}=createRequire(import.meta.url)('../../durable-state.js');
const rec=(id,text='synthetic old text')=>({...id===undefined?{}:{id},text,sender:'me',at:'2026-10-22T00:00:00.000Z'});
const config={documentId:'synthetic-doc',logId:'synthetic-log',namespace:'synthetic-device',collections:collections()};
const base=()=>({rp:[],apiMessages:[],backstageMessages:[],outsideMessages:[],draft:'synthetic draft'});
function setup(initial){let disk=structuredClone(initial),fail=false,writes=0;const view=structuredClone(disk),projection=createProjection(config);const durable=create(view,async candidate=>{if(fail)throw Error('QUOTA');disk=structuredClone(candidate);writes++;},projection);projection.connect(durable);return {view,projection,durable,get disk(){return disk;},get writes(){return writes;},set fail(x){fail=x;}};}
const legacy=[rec(10),{text:'synthetic missing ID',sender:'me',at:rec().at},rec(null),rec(''),rec('old','first'),rec('old','second'),rec(undefined,'identical'),rec(undefined,'identical')];
for(const key of ['rp','apiMessages','backstageMessages','outsideMessages'])test(`unchanged legacy ${key} is preserved, excluded from export, and cannot block new BACKSTAGE`,async()=>{
 const initial=base();initial[key]=structuredClone(legacy);const x=setup(initial);await x.durable.save();assert.equal(x.disk.sharedLogOutbox.entries.length,0);assert.deepEqual(x.disk[key],legacy);
 await x.durable.commit(s=>s.backstageMessages.push(rec('new','synthetic new message')));assert.equal(x.disk.sharedLogOutbox.entries.length,1);assert.equal(x.disk.sharedLogOutbox.entries[0].event.sourceRecordId,'backstageMessages:new');assert.equal(x.disk.sharedLogOutbox.entries[0].event.scope,'backstage');assert.deepEqual(x.disk[key].slice(0,legacy.length),legacy);
 const restarted=setup(x.disk);await restarted.durable.save();assert.deepEqual(restarted.disk.sharedLogOutbox,x.disk.sharedLogOutbox);assert.deepEqual(restarted.disk[key],x.disk[key]);
});
test('new missing/numeric/empty IDs and extra identical old occurrences still fail atomically',async()=>{
 const initial=base();initial.rp=structuredClone(legacy);const x=setup(initial);
 for(const item of [rec(12),rec(undefined,'new'),rec(''),rec('10'),rec('undefined'),structuredClone(legacy[1]),rec('old','first'),rec('old','new')]){await assert.rejects(x.durable.commit(s=>s.rp.push(item)),/DUPLICATE_SOURCE_ID/);assert.deepEqual(x.disk,initial);assert.equal(x.writes,0);}
});
test('legacy edits, renumbering and duplicate-ID replacement are not silently accepted',async()=>{
 const initial=base();initial.rp=structuredClone(legacy);const x=setup(initial);
 for(const edit of [s=>s.rp[0].text='changed',s=>s.rp[0].id=11,s=>s.rp[4].text='second']){await assert.rejects(x.durable.commit(edit),/DUPLICATE_SOURCE_ID/);assert.deepEqual(x.disk,initial);}
});
test('new string IDs retain strict duplicate/edit guards with a legacy baseline',async()=>{
 const initial=base();initial.rp=structuredClone(legacy);const x=setup(initial);await x.durable.commit(s=>s.rp.push(rec('new')));const saved=structuredClone(x.disk);
 await assert.rejects(x.durable.commit(s=>s.rp.push(rec('new'))),/DUPLICATE_SOURCE_ID/);
 await assert.rejects(x.durable.commit(s=>s.rp.at(-1).text='changed'),/EDIT_MAPPING_UNSET/);assert.deepEqual(x.disk,saved);
});
test('quota failure/retry is atomic and uses only the fixed new source ID',async()=>{
 const initial=base();initial.apiMessages=structuredClone(legacy);const x=setup(initial);x.fail=true;await assert.rejects(x.durable.commit(s=>s.backstageMessages.push(rec('new'))),/QUOTA/);assert.deepEqual(x.disk,initial);assert.deepEqual(x.view,initial);x.fail=false;
 await x.durable.commit(s=>s.backstageMessages.push(rec('new')));await x.durable.save();assert.equal(x.disk.sharedLogOutbox.entries.length,1);assert.deepEqual(x.disk.apiMessages,legacy);
});
test('legacy baseline preserves monotonic receipts during concurrent append',async()=>{
 const initial=base();initial.rp=structuredClone(legacy);const x=setup(initial);await x.durable.commit(s=>s.backstageMessages.push(rec('one')));const stale=await x.projection.store.load();const receipt=structuredClone(stale);receipt.entries[0].status='confirmed';await x.durable.commit(s=>s.outsideMessages.push(rec('two')));await x.projection.store.save(receipt);await x.projection.store.save(stale);assert.deepEqual(x.disk.sharedLogOutbox.entries.map(e=>e.status),['confirmed','pending']);assert.deepEqual(x.disk.rp,legacy);
});
test('a duplicated already-captured source never becomes an unexported legacy exception',async()=>{
 const initial=base();initial.rp=[rec('captured')];const x=setup(base());await x.durable.commit(s=>s.rp.push(rec('captured')));const broken=structuredClone(x.disk);broken.rp.push(rec('captured','changed'));const y=setup(broken);await assert.rejects(y.durable.save(),/DUPLICATE_SOURCE_ID/);assert.equal(y.writes,0);assert.deepEqual(y.disk,broken);
});
test('duplicated server-origin COMMS cannot be reclassified as legacy, even without a device outbox',async()=>{
 const initial=base();const record={...rec('notice'),source:'scheduled',sharedLogOrigin:{sourceRecordId:'comms:notice',eventId:'synthetic-server-event'}};initial.apiMessages=[record,structuredClone(record)];const x=setup(initial);await assert.rejects(x.durable.save(),/DUPLICATE_SOURCE_ID/);assert.equal(x.writes,0);assert.deepEqual(x.disk,initial);
});
test('generated COMMS retains server event identity alongside unrelated legacy history',async()=>{
 const initial=base();initial.rp=structuredClone(legacy);const x=setup(initial);const event=await makeEvent({logId:config.logId,namespace:'synthetic-server',sourceRecordId:'comms:notice',source:'vector',channel:'comms',scope:'inner',speaker:'din',kind:'original',occurredAt:rec().at,body:'synthetic generated text'});
 await x.durable.commit(s=>s.apiMessages.push({...rec('notice',event.body),sender:'din',source:'scheduled',sharedLogOrigin:{logId:config.logId,namespace:event.namespace,sourceRecordId:event.sourceRecordId,eventId:event.eventId,recordHash:event.recordHash}}));assert.deepEqual(x.disk.sharedLogOutbox.entries[0].event,event);await x.durable.save();assert.equal(x.disk.sharedLogOutbox.entries.length,1);assert.deepEqual(x.disk.rp,legacy);
});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function idle(projection){for(let i=0;i<100&&projection.draining;i++)await tick();assert.equal(projection.draining,false);}
function relaySetup(request){let disk=base();disk.rp=structuredClone(legacy);const projection=createProjection({...config,relay:{enrollmentId:'synthetic-enrollment',enabled:()=>true}});const durable=create(structuredClone(disk),async s=>{disk=structuredClone(s);},{prepare:(...args)=>projection.prepare(...args),committed:()=>projection.afterCommit()});projection.connect(durable,{request});return {projection,durable,get disk(){return disk;}};}
test('reply committed during successful relay is drained without another user action',async()=>{
 let started,release;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r),sent=[];
 const x=relaySetup(async(_path,{event})=>{sent.push(event.eventId);if(sent.length===1){started();await gate;}return {status:'confirmed',eventId:event.eventId,recordHash:event.recordHash};});
 await x.durable.commit(s=>s.backstageMessages.push(rec('sender')));await ready;await x.durable.commit(s=>s.backstageMessages.push({...rec('reply','synthetic response'),sender:'chappy'}));release();await idle(x.projection);assert.equal(sent.length,2);assert.equal(new Set(sent).size,2);assert.deepEqual(x.disk.sharedLogOutbox.entries.map(e=>e.status),['confirmed','confirmed']);assert.deepEqual(x.disk.rp,legacy);
});
test('uncertain relay stops after one dispatch, preserving unknown and pending for later reconciliation',async()=>{
 let started,release,calls=0;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
 const x=relaySetup(async()=>{calls++;started();await gate;throw Error('SYNTHETIC_RESPONSE_LOSS');});await x.durable.commit(s=>s.backstageMessages.push(rec('sender')));await ready;await x.durable.commit(s=>s.backstageMessages.push({...rec('reply'),sender:'chappy'}));release();await idle(x.projection);await tick();assert.equal(calls,1);assert.equal(x.projection.lastRelayError,'SYNTHETIC_RESPONSE_LOSS');assert.deepEqual(x.disk.sharedLogOutbox.entries.map(e=>e.status),['unknown','pending']);assert.deepEqual(x.disk.rp,legacy);
});

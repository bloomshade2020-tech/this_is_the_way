import {createRelayDrain} from './relay.mjs';
import {target,makeEvent,validateEvent} from './core.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Explicit source mappings; no RP validity or character knowledge inferred.
export function createProjection({documentId,logId,namespace,collections,relay}) {
 const binding=target({documentId,logId});
 if(!namespace || !Array.isArray(collections) || !collections.length)throw Error('EXPLICIT_MAPPING_REQUIRED');
 const receiptUpdates=new WeakMap();
 const projection={
 connect(durable,{request}={}){this.store=this.createStore(durable);if(relay)this.relay=createRelayDrain({store:this.store,logId,enrollmentId:relay.enrollmentId,enabled:relay.enabled,request});},
 afterCommit(){if(this.relay&&!this.draining){this.draining=true;queueMicrotask(async()=>{try{await this.relay.flush();this.lastRelayError=null;}catch(e){this.lastRelayError=e.message;}finally{this.draining=false;}});}},
 createStore(durable){return {
  load:async()=>structuredClone(durable.snapshot().sharedLogOutbox||{version:1,target:binding,namespace,entries:[]}),
  save:async incoming=>{
   if(incoming?.version!==1 || !same(incoming.target,binding) || incoming.namespace!==namespace || !Array.isArray(incoming.entries))throw Error('OUTBOX_BINDING_CONFLICT');
   const updates=new Map();
   for(const entry of incoming.entries){
    await validateEvent(entry.event,logId);
    if(!['pending','unknown','confirmed'].includes(entry.status))throw Error('INVALID_STATUS');
    const prev=updates.get(entry.event.eventId);
    if(prev && (prev.hash!==entry.event.recordHash || prev.status!==entry.status))throw Error('ID_CONFLICT');
    updates.set(entry.event.eventId,{hash:entry.event.recordHash,status:entry.status});
   }
   // Attach receipt deltas to the queued candidate, not to the caller's stale full snapshot.
   await durable.commit(next=>{receiptUpdates.set(next,updates);});
  }
 };},
 async prepare(next,before){
  const existing=before.sharedLogOutbox;
  if(existing && (!same(existing.target,binding) || existing.namespace!==namespace))throw Error('OUTBOX_BINDING_CONFLICT');
  const box=structuredClone(existing||{version:1,target:binding,namespace,entries:[]});
  if(box.version!==1 || !Array.isArray(box.entries))throw Error('INVALID_OUTBOX');
  const ids=new Map();
  for(const entry of box.entries){
   await validateEvent(entry.event,logId);
   if(!['pending','unknown','confirmed'].includes(entry.status))throw Error('INVALID_STATUS');
   const old=ids.get(entry.event.eventId);
   if(old && old.recordHash!==entry.event.recordHash)throw Error('ID_CONFLICT');
   ids.set(entry.event.eventId,entry.event);
  }
  // Only this projection's store adapter may authorize receipt deltas.
  if(next.sharedLogOutbox && !same(next.sharedLogOutbox,before.sharedLogOutbox))throw Error('OUTBOX_DIRECT_EDIT');
  for(const {key,map} of collections){
   if(typeof map!=='function' || !Array.isArray(next[key]) || !Array.isArray(before[key]))throw Error('INVALID_COLLECTION');
   const prior=new Map(before[key].map(x=>[x.id,x]));
   if(prior.size!==before[key].length)throw Error('DUPLICATE_SOURCE_ID');
   const seen=new Set();
   for(const record of next[key]){
    if(typeof record.id!=='string'||!record.id||seen.has(record.id))throw Error('DUPLICATE_SOURCE_ID');seen.add(record.id);
    if(prior.has(record.id)){
     const previous=prior.get(record.id);
     if(previous.text!==record.text || previous.sender!==record.sender || previous.at!==record.at ||
       !same(map(structuredClone(previous)),map(structuredClone(record))) || !same(previous.sharedLogOrigin,record.sharedLogOrigin))throw Error('EDIT_MAPPING_UNSET');
     continue;
    }
    const mapped=map(structuredClone(record));
    if(!mapped || mapped.body!==record.text)throw Error('ORIGINAL_TEXT_REQUIRED');
    const origin=record.sharedLogOrigin;
    if(origin && (key!=='apiMessages'||record.source!=='scheduled'||origin.logId!==logId||origin.sourceRecordId!=='comms:'+record.id||mapped.channel!=='comms'||mapped.scope!=='inner'||mapped.speaker!=='din'))throw Error('SERVER_ORIGIN_CONFLICT');
    const event=await makeEvent({...mapped,logId,namespace:origin?.namespace||namespace,sourceRecordId:origin?.sourceRecordId||key+':'+record.id});
    if(origin&&(origin.eventId!==event.eventId||origin.recordHash!==event.recordHash))throw Error('SERVER_ORIGIN_CONFLICT');
    const old=ids.get(event.eventId);
    if(old && old.recordHash!==event.recordHash)throw Error('ID_CONFLICT');
    if(!old){box.entries.push({event,status:'pending'});ids.set(event.eventId,event);}
   }
  }
  const updates=receiptUpdates.get(next);
  if(updates){
   const ranks={pending:0,unknown:1,confirmed:2};
   for(const [id,update] of updates){
    const matches=box.entries.filter(entry=>entry.event.eventId===id);
    if(!matches.length || matches.some(entry=>entry.event.recordHash!==update.hash))throw Error('RECEIPT_ID_CONFLICT');
    for(const entry of matches)if(ranks[update.status]>ranks[entry.status])entry.status=update.status;
   }
   receiptUpdates.delete(next);
  }
  next.sharedLogOutbox=box;
 }};
 return projection;
}
// All participating tabs must use this guard. It refuses stale writes; never merges guesses.
export function guardVaultWrites({vault,readEnvelope,locks,lockName,expectedEnvelope}){
 if(!locks?.request || typeof readEnvelope!=='function'||!lockName)throw Error('WEB_LOCKS_REQUIRED');
 if(typeof expectedEnvelope!=='string'||!expectedEnvelope)throw Error('DECRYPTED_ENVELOPE_REQUIRED');
 let expected=expectedEnvelope; const original=vault.save.bind(vault);
 vault.save=data=>locks.request(lockName,{mode:'exclusive'},async()=>{
  if(readEnvelope()!==expected)throw Error('STALE_VAULT_REOPEN_REQUIRED');
  await original(data);expected=readEnvelope();
 });
 return {restore(){vault.save=original;}};
}
// Installer requires the intrinsic writer guard before enabling capture.
export function installLocal({projection,vault}){
 if(!vault.sharedLogWriteGuardReady?.())throw Error('ALL_VAULT_WRITERS_GUARD_REQUIRED');
 if(window.VectorSharedLogLocal)throw Error('PROJECTION_ALREADY_INSTALLED');
 window.VectorSharedLogLocal=projection;
 return {dispose(){delete window.VectorSharedLogLocal;}};
}

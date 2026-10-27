// Existing encrypted vault and authenticated app transport only. No new key,
// background timer or room selection. Room routing stays outside EVENT hashes.
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateRoomTag(r){
 if(!r||Object.keys(r).some(k=>!['roomId','roomEpoch','ticket'].includes(k))||typeof r.roomId!=='string'||!/^[A-Za-z0-9_:-]{1,200}$/.test(r.roomId)||!Number.isSafeInteger(r.roomEpoch)||r.roomEpoch<1)throw Error('ROOM_TAG_INVALID');
 if(r.ticket&&(!r.ticket.operationId||!r.ticket.writerId||r.ticket.roomId!==r.roomId||r.ticket.roomEpoch!==r.roomEpoch||Object.keys(r.ticket).some(k=>!['operationId','writerId','roomId','roomEpoch'].includes(k))))throw Error('ROOM_TICKET_INVALID');return structuredClone(r);
}
export function roomClient({durable,request,projection,namespace}){
 const control=(action,value)=>request('/shared-log/room-control',{action,namespace,request:value});
 async function config(){const c=await request('/shared-log/config',{});if(!c.room)return null;const r=c.room;if(r.clientProtocol!==1||!['active','frozen'].includes(r.status))throw Error('ROOM_CLIENT_UPDATE_REQUIRED');validateRoomTag({roomId:r.roomId,roomEpoch:r.roomEpoch});return r;}
 async function flush(){await projection.relay.flush();}
 return {
  async prepareChat({intent,sender}){
   const room=await config();if(!room)return null;
   const collection=intent.collection,before=durable.snapshot();
   const matches=(before.sharedLogChatIntents||[]).filter(j=>j.collection===collection&&j.status!=='committed'&&[j.original,...before[collection]].some(m=>m?.id===j.senderId&&m.text===sender.text&&same(m.photo,sender.photo)));
   if(matches.length>1||matches.some(j=>!['preparing','not-started'].includes(j.status)))throw Error('ROOM_CHAT_OUTCOME_UNKNOWN');
   let j=matches[0];
   if(!j){if(room.status!=='active')throw Error('ROOM_WRITER_FROZEN');j={...intent,status:'preparing',original:sender};await durable.commit(next=>{next.sharedLogChatIntents??=[];next.sharedLogChatIntents.push(structuredClone(j));});}
   // Identity and exact original are durable BEFORE reserve. An uncertain reserve
   // is retried with this SAME ID, never converted into another generation.
   const target=j.sharedRoom||{roomId:room.roomId,roomEpoch:room.roomEpoch};
   const ticket=await control('reserve',{operationId:j.id,roomId:target.roomId,roomEpoch:target.roomEpoch});
   const tag=validateRoomTag({...target,ticket});
   await durable.commit(next=>{const live=next.sharedLogChatIntents.find(x=>x.id===j.id);if(!live||!['preparing','not-started'].includes(live.status))throw Error('CHAT_INTENT_CONFLICT');if(live.sharedRoom&&!same(live.sharedRoom,tag))throw Error('ROOM_TARGET_CHANGED');live.sharedRoom=tag;live.status='preparing';if(!next[collection].some(m=>m.id===live.senderId)){next[collection].push({...live.original,sharedRoom:tag});delete live.original;}});
   // Do not generate until the current exported user record is confirmed once.
   for(let i=0;i<100;i++){const box=durable.snapshot().sharedLogOutbox,entry=box?.entries.find(e=>e.event.sourceRecordId===collection+':'+j.senderId);if(!entry)throw Error('ROOM_CURRENT_EVENT_MISSING');if(entry.status==='confirmed')break;await flush();if(i===99)throw Error('ROOM_OUTBOX_DRAIN_PENDING');}
   const current=durable.snapshot(),saved=current[collection].find(m=>m.id===j.senderId),live=current.sharedLogChatIntents.find(x=>x.id===j.id),event=current.sharedLogOutbox.entries.find(e=>e.event.sourceRecordId===collection+':'+j.senderId).event;
   return {intent:structuredClone(live),sender:structuredClone(saved),currentEvent:structuredClone(event),sharedRoom:tag};
  },
  async markDispatch(intent){
   await durable.commit(next=>{const live=next.sharedLogChatIntents.find(x=>x.id===intent.id);if(!live||live.status!=='preparing'||!same(live.sharedRoom,intent.sharedRoom))throw Error('CHAT_INTENT_CONFLICT');live.status='dispatched-unknown';});
  },
  async tagOriginal(){const r=await config();if(!r)return null;if(r.status!=='active')throw Error('ROOM_WRITER_FROZEN');return {roomId:r.roomId,roomEpoch:r.roomEpoch};},
  async acknowledge(){
   const r=await config();if(!r||r.status!=='frozen')throw Error('ROOM_NOT_FROZEN');
   await flush();const s=durable.snapshot();
   if(s.sharedLogOutbox?.entries.some(e=>e.status!=='confirmed')||(s.sharedLogChatIntents||[]).some(j=>j.status!=='committed'))throw Error('ROOM_LOCAL_WRITES_UNRECONCILED');
   return control('acknowledge',{roomId:r.roomId,roomEpoch:r.roomEpoch,localOutboxEmpty:true,noInFlight:true});
  },config
 };
}

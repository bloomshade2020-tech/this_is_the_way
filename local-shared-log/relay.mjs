import {validateEvent} from './core.mjs';
// Explicitly installed local candidate. No timer, fetch, credentials, or destination.
// request is the app's existing authenticated transport (a mock in all tests).
export function createRelayDrain({store,logId,enrollmentId,request,enabled=()=>false,maxBatch=16}){
 if(typeof request!=='function'||!enrollmentId||!Number.isInteger(maxBatch)||maxBatch<1||maxBatch>100)throw Error('RELAY_CONFIG');
 let running;
 return {flush(){if(running)return running;running=(async()=>{
  if(enabled()!==true)return {status:'disabled'};
  const state=await store.load();let n=0;
  for(const entry of state.entries){
   if(entry.status==='confirmed')continue;if(n>=maxBatch)break;n++;
   await validateEvent(entry.event,logId);if(enabled()!==true)throw Error('RELAY_DISABLED');
   entry.status='unknown';await store.save(state);
   if(enabled()!==true)throw Error('RELAY_DISABLED');
   const reply=await request('/shared-log/events',{enrollmentId,event:entry.event});
   if(reply?.status!=='confirmed'||reply.eventId!==entry.event.eventId||reply.recordHash!==entry.event.recordHash)throw Error('DRIVE_RECEIPT_UNVERIFIED');
   entry.status='confirmed';await store.save(state);
  }
  return {status:'complete',processed:n};
 })().finally(()=>{running=null;});return running;}};
}

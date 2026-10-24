// Isolated synthetic adapter, NOT wired into sendRoom or real model APIs.
// Explicit operation IDs come from the caller; L/M and RP validity are not inferred.
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createMockChatPersistence({durable,request}) {
 if(typeof request!=='function')throw Error('MOCK_REQUEST_REQUIRED');
 const running=new Map(),results=new Map();
 function execute(input){
  const spec=structuredClone(input),{operationId,collection,sender,replySpeaker}=spec;
  if(typeof operationId!=='string'||!operationId || !['rp','apiMessages','backstageMessages'].includes(collection) || typeof sender?.text!=='string' || !sender.sender || !sender.at || !replySpeaker)throw Error('INVALID_CHAT_INTENT');
  const current=running.get(operationId);
  if(current){if(!same(current.spec,spec))return Promise.reject(Error('INTENT_CONFLICT'));return current.promise;}
  const run=(async()=>{
   // This commit fences duplicate controllers using the same durable queue.
   let job;
   await durable.commit(next=>{
    next.sharedLogChatIntents??=[];
    job=next.sharedLogChatIntents.find(x=>x.id===operationId);
    if(job){if(!same(job.spec,spec))throw Error('INTENT_CONFLICT');}
    else {job={id:operationId,spec,status:'prepared',senderId:'chat:'+operationId+':user',replyId:'chat:'+operationId+':reply'};next.sharedLogChatIntents.push(job);}
    job=structuredClone(job);
   });
   if(job.status==='committed')return {operationId,status:'committed'};
   let result=results.get(operationId);
   if(!result){
    if(job.status!=='prepared')throw Error('CHAT_RESULT_UNKNOWN_NO_RETRY');
    await durable.commit(next=>{
     const j=next.sharedLogChatIntents.find(x=>x.id===operationId);
     if(j.status!=='prepared')throw Error('CHAT_RESULT_UNKNOWN_NO_RETRY');
     j.status='dispatched-unknown';
    });
    // A failure/response loss leaves a durable unknown; no automatic second call.
    const response=await request(structuredClone(spec));
    if(typeof response?.text!=='string'||!response.at)throw Error('CHAT_RESULT_UNKNOWN_NO_RETRY');
    result={text:response.text,at:response.at};results.set(operationId,result);
   }
   await durable.commit(next=>{
    const j=next.sharedLogChatIntents.find(x=>x.id===operationId);
    if(j.status==='committed')return;
    if(j.status!=='dispatched-unknown')throw Error('INVALID_CHAT_INTENT');
    const originals=[{...sender,id:j.senderId,exchangeId:operationId},{id:j.replyId,exchangeId:operationId,sender:replySpeaker,text:result.text,at:result.at}];
    for(const record of originals){
     const existing=next[collection].find(x=>x.id===record.id);
     if(existing&&!same(existing,record))throw Error('ID_CONFLICT');
     if(!existing)next[collection].push(record);
    }
    j.status='committed';
   });
   results.delete(operationId);return {operationId,status:'committed'};
  })();
  const promise=run.finally(()=>running.delete(operationId));running.set(operationId,{spec,promise});return promise;
 }
 return {execute};
}

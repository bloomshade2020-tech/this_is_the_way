/* Encrypted, durable control intent. No request with an unknown external outcome is retried. */
(function(root){
'use strict';
function create(durable,post,randomId){
 const state=()=>durable.snapshot().notificationControl||{};
 const uncertain=()=>{const s=state();return !s.owner||!!s.recovery||Object.keys(s.pending||{}).length>0;};
 async function mutate(path,body={},guard=()=>{}){
  guard();const before=state();if(!before.owner||before.recovery||(uncertain()&&!path.endsWith('/disable')))throw Error('先に「停止して接続を確認」を実行してください');
  let proof;
  await durable.commit(next=>{guard();const s=next.notificationControl;if(!s||s.owner!==before.owner||s.recovery)throw Error('Control changed');s.sequence=(s.sequence||0)+1;proof={owner:s.owner,sequence:s.sequence};(s.pending??={})[proof.sequence]={path};});
  try{guard();}catch(e){await finish(proof);throw e;}
  // Once dispatched, a failed response or failed local receipt remains pending across reload.
  const result=await post(path,{...body,control:proof});
  await finish(proof);guard();return result;
 }
 async function finish(proof){await durable.commit(next=>{const s=next.notificationControl;if(s?.owner===proof.owner)delete s.pending?.[proof.sequence];});}
 async function recover(guard=()=>{}){
  guard();const config=await post('/notifications/config',{});guard();if(config.protocol!==4)throw Error('復旧対応の通知Workerが必要です');
  const ticket={owner:randomId(),baseRevision:config.revision};
  await durable.commit(next=>{guard();const s=next.notificationControl||{};next.notificationControl={...s,recovery:ticket};});guard();
  const result=await post('/notifications/recover',ticket);guard();await accept(ticket,result,guard);return result;
 }
 async function reconcile(guard=()=>{}){
  guard();const ticket=state().recovery;if(!ticket)throw Error('確認待ちの停止要求がありません');
  const result=await post('/notifications/control-status',{owner:ticket.owner});guard();await accept(ticket,result,guard);return result;
 }
 async function accept(ticket,result,guard){
  if(!result.controlOwned||result.enabled||result.controlSequence!==0)throw Error('停止を確認できません。明示的に停止操作をやり直してください');
  await durable.commit(next=>{guard();if(next.notificationControl?.recovery?.owner!==ticket.owner)throw Error('Recovery superseded');next.notificationControl={owner:ticket.owner,sequence:0,pending:{}};next.notificationEnabled=false;});
 }
 return {mutate,recover,reconcile,uncertain,state};
}
root.VectorNotificationControl={create};if(typeof module!=='undefined')module.exports=root.VectorNotificationControl;
})(typeof window==='undefined'?globalThis:window);

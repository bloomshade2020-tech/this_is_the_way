/* Version negotiation before notification data/changes; chat transport is unchanged. */
(function(root){
'use strict';
function create(transport){
 async function check(path){
  const config=await transport('/notifications/config',{});
  if(config.protocol!==4)throw Object.assign(Error('通知Workerまたは画面の更新が必要です。通知の受信・操作を保留しました。履歴の削除は不要です'),{code:'WORKER_UPDATE_REQUIRED'});
  if((path==='/notifications/update'&&config.rolloutMode==='push-test-only')||(path==='/notifications/enable'&&config.rolloutMode!=='active')||(path==='/notifications/test'&&config.rolloutMode!=='active'&&!(config.rolloutMode==='push-test-only'&&config.pushTestOnly===true)))throw Object.assign(Error('通知は移行・保守のため強制停止中です。未受領本文は受信できます'),{code:'ROLLOUT_STOP',serverStatus:config});
  return config;
 }
 async function post(path,body={}){
  if(['/notifications/config','/notifications/status'].includes(path))return transport(path,body);
  await check(path);return transport(path,{...body,clientProtocol:4});
 }
 return {check,post};
}
root.VectorNotificationHTTP={create};if(typeof module!=='undefined')module.exports=root.VectorNotificationHTTP;
})(typeof window==='undefined'?globalThis:window);

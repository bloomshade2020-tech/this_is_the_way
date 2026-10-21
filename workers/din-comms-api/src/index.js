/* LOCAL candidate; no production binding or deploy configuration is included. */
import baseline from './baseline.js';
import {safeMatch,headers,json,requestJSON,ALLOWED_ORIGIN} from './notification-transport.js';
export {VectorNotificationCoordinator} from './coordinator.js';
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/notifications/'))return baseline.fetch(request,env);
  const origin=request.headers.get('Origin')||'',h=headers(origin);
  if(origin!==ALLOWED_ORIGIN)return json({error:'許可されたアプリからのみ利用できます'},403,h);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:h});
  if(request.method!=='POST')return json({error:'Not found'},404,h);
  if(!env.DIN_ACCESS_TOKEN||env.DIN_ACCESS_TOKEN.length<24||!env.OPENAI_API_KEY)return json({error:'WorkerのSecret設定を確認してください'},503,h);
  const auth=request.headers.get('Authorization')||'';
  if(!await safeMatch(auth.startsWith('Bearer ')?auth.slice(7):'',env.DIN_ACCESS_TOKEN))return json({error:'DIN_ACCESS_TOKENが違います'},401,h);
  if(!env.VECTOR_NOTIFICATIONS)return json({error:'通知コーディネーターは未接続です'},503,h);
  let body;try{body=await requestJSON(request)}catch{return json({error:'送信JSONを読めません'},400,h)}
  const stub=env.VECTOR_NOTIFICATIONS.getByName('vector-private-notifications');
  try{
   if(path==='/notifications/config'||path==='/notifications/status')return json({configured:!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY),protocol:4,vapidPublicKey:env.VAPID_PUBLIC_KEY||'',...await stub.status()},200,h);
   if(body?.clientProtocol!==4)return json({error:'通知の受信・操作には更新済みVECTORが必要です。画面を更新してください。保管庫や履歴の削除は不要です',code:'CLIENT_UPDATE_REQUIRED',protocol:4},409,h);
   if(path==='/notifications/recover')return json(await stub.recoverControl(body),200,h);
   if(path==='/notifications/control-status')return json(await stub.controlStatus(body.owner),200,h);
   if(['/notifications/update','/notifications/enable','/notifications/disable','/notifications/subscribe','/notifications/test'].includes(path)&&!body.control)return json({error:'通知の停止・確認を先に行ってください'},409,h);
   if(path==='/notifications/update'||path==='/notifications/enable'){
    if(env.VECTOR_NOTIFICATION_MODE==='push-test-only')return json({error:'テスト専用モードではRP文脈同期・生成ONを許可しません'},409,h);
    if(!body.context)return json({error:'共有文脈対応アプリへ更新してください（旧状態で生成を開始しません）'},409,h);
    const result=await stub.setContext(body.context,body.baseRevision,path.endsWith('/enable'),body.control);return json({ok:true,updatedAt:result.acceptedAt,...result},200,h);
   }
   if(path==='/notifications/disable')return json({ok:true,...await stub.enable(false,body.control)},200,h);
   if(path==='/notifications/inbox')return json(await stub.inbox(body),200,h);
   if(path==='/notifications/ack'){const result=await stub.ack(body.ids);return json(result,result.ok===false?409:200,h);}
   if(path==='/notifications/subscribe'){
    const sub=body?.subscription;try{const u=new URL(sub.endpoint);if(u.protocol!=='https:'||!sub.keys?.p256dh||!sub.keys?.auth||sub.endpoint.length>2200||sub.keys.p256dh.length>180||sub.keys.auth.length>80)throw Error();}catch{return json({error:'Push購読が不正です'},400,h)}
    return json(await stub.subscribe({endpoint:sub.endpoint,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}},body.baseRevision,body.control),200,h);
   }
   if(path==='/notifications/test')return json(await stub.testPush(body.control),200,h);
   return json({error:'Not found'},404,h);
  }catch(e){return json({error:String(e.message||e).slice(0,200)},409,h)}
 },
 async scheduled(event,env,ctx){if(!env.VECTOR_NOTIFICATIONS)return;ctx.waitUntil(env.VECTOR_NOTIFICATIONS.getByName('vector-private-notifications').cycle(Math.floor(event.scheduledTime/3600000)));}
};

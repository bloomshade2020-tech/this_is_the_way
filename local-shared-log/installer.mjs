import {roomClient} from './room-client.mjs';
import {createProjection,installLocal} from './integration.mjs';
export const BUILD='vector-shared-setup-v2-20261024';
export const SCOPES=['here:inner','comms:inner','backstage:backstage','project:outer'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const collections=()=>[['rp','here','inner'],['apiMessages','comms','inner'],['backstageMessages','backstage','backstage'],['outsideMessages','project','outer']].map(([key,channel,scope])=>({key,map:r=>({source:'vector',speaker:r.sender,channel,scope,kind:'original',occurredAt:r.at,body:r.text})}));
export async function rollout(){
 if(window.VectorAppBuild!==BUILD||window.VectorVaultBuild!==BUILD||!navigator.serviceWorker?.controller)throw Error('全タブを新版で開き直してください');
 const c=navigator.serviceWorker.controller;
 c.postMessage({type:'VECTOR_SHARED_READY',build:BUILD});
 return new Promise((resolve,reject)=>{const ch=new MessageChannel(),timer=setTimeout(()=>{ch.port1.close();reject(Error('タブ更新状態を確認できません'));},3000);ch.port1.onmessage=e=>{clearTimeout(timer);ch.port1.close();if(e.data?.build!==BUILD||e.data?.ready!==true)reject(Error('古いタブを閉じて全タブを開き直してください'));else resolve(true);};c.postMessage({type:'VECTOR_SHARED_STATUS'},[ch.port2]);});
}
export function validConfig(c){return c?.version===1&&c.capture===true&&c.build===BUILD&&typeof c.namespace==='string'&&c.policy?.deviceNamespaces?.includes(c.namespace)&&same(c.policy.partitions,SCOPES)&&typeof c.policy.enrollmentId==='string'&&typeof c.policy.documentId==='string'&&typeof c.policy.logId==='string';}
export async function install(data,vault){
 const c=data.sharedLogClient;if(!c)return;
 if(!validConfig(c))throw Error('共通ログ設定を確認してください');
 await rollout();
 // Existing history is the baseline; only future additions enter the outbox.
 for(const {key} of collections())if(!Array.isArray(data[key]))data[key]=[];
 const projection=createProjection({documentId:c.policy.documentId,logId:c.policy.logId,namespace:c.namespace,collections:collections(),relay:{enrollmentId:c.policy.enrollmentId,enabled:()=>projection.store?.configuration?.()?.exportEnabled===true}});
 const connect=projection.connect.bind(projection);
 projection.connect=(durable,{request})=>{const checkedRequest=async(path,body)=>{await rollout();const r=await request('/shared-log/config',{});if(r.active!==true||r.everActivated!==true||r.clientBuild!==BUILD||!same(r.policy,c.policy))throw Error('共通ログは未有効化または停止中です');return path==='/shared-log/config'?r:request(path,body);};connect(durable,{request:checkedRequest});projection.store.configuration=()=>durable.snapshot().sharedLogClient;projection.room=roomClient({durable,request:checkedRequest,projection,namespace:c.namespace});};
 installLocal({projection,vault});return projection;
}
export async function enrollClient({durable,request,consent}){
 if(consent!=='four-scopes-new-text-only')throw Error('保存範囲への明示許可が必要です');
 await rollout();const r=await request('/shared-log/config',{}),before=durable.snapshot(),namespace=before.sharedLogDeviceNamespace;
 if(r.active!==true||r.everActivated!==true||r.clientBuild!==BUILD||!namespace||!r.policy?.deviceNamespaces?.includes(namespace)||!same(r.policy.partitions,SCOPES))throw Error('所有者側の文書・端末・範囲の有効化を先に完了してください');
 if(before.sharedLogClient&&!same(before.sharedLogClient.policy,r.policy))throw Error('既存保存先は上書きできません');
 await durable.commit(next=>{next.sharedLogClient={version:1,build:BUILD,capture:true,exportEnabled:true,namespace,policy:r.policy};});
}

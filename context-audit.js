/* Bounded server receipt metadata, stored with its reply in the existing vault.
 * No network, source text, prompt, credential, inference or historical backfill.
 */
(function(root){
'use strict';
const MAX_BYTES=4096,MAX_CHUNKS=12000;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const bounded=v=>{try{return new TextEncoder().encode(JSON.stringify(v)).length<=MAX_BYTES;}catch{return false;}};
const revision=v=>typeof v==='string'&&v.length===73&&/^snapshot_[a-f0-9]{64}$/.test(v);
const same=(a,b)=>a===b||(object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])))||(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i])));
const timestamp=v=>typeof v==='string'&&v.length===24&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=MAX_CHUNKS;
const reasons={NO_QUERY_MATCH:'検索語との一致なし',CONTEXT_BUDGET:'文脈の容量上限',UNCLASSIFIED_SOURCE:'未分類の範囲あり'};
function coverage(value){
 if(!keys(value,['fullHistory','eligibleChunks','includedChunks','omittedChunks','reasons'])||typeof value.fullHistory!=='boolean'||
    !['eligibleChunks','includedChunks','omittedChunks'].every(k=>count(value[k]))||value.includedChunks+value.omittedChunks!==value.eligibleChunks||
    !Array.isArray(value.reasons)||value.reasons.length>3)return null;
 const seen=new Set(),clean=[];
 for(const item of value.reasons){
  if(!keys(item,['code','chunks'])||typeof item.code!=='string'||!Object.hasOwn(reasons,item.code)||seen.has(item.code))return null;
  seen.add(item.code);
  if(item.code!=='UNCLASSIFIED_SOURCE'&&(!count(item.chunks)||item.chunks>value.omittedChunks))return null;
  if(item.chunks!==undefined&&!count(item.chunks))return null;
  clean.push({code:item.code,...(item.chunks===undefined?{}:{chunks:item.chunks})});
 }
 return {fullHistory:value.fullHistory,eligibleChunks:value.eligibleChunks,includedChunks:value.includedChunks,omittedChunks:value.omittedChunks,reasons:clean};
}
function base(messageId,channel,origin){
 if(typeof messageId!=='string'||!messageId||messageId.length>256||!['here','comms'].includes(channel))return null;
 return {version:1,messageId,channel,origin};
}
function manual(value,{messageId,channel}){
 const target=base(messageId,channel,'manual');if(!target)return undefined;
 if(value===undefined||value===null)return {...target,state:'not-recorded'};
 if(!bounded(value)||!keys(value,['status','revision','checkedAt','coverage'])||value.status!=='ready'||!revision(value.revision)||!timestamp(value.checkedAt))return {...target,state:'invalid'};
 const range=coverage(value.coverage);if(!range)return {...target,state:'invalid'};
 return {...target,state:'recorded',revision:value.revision,checkedAt:value.checkedAt,coverage:range};
}
function notification(event){
 if(!object(event))return undefined;
 const target=base(event.id,'comms','autonomous');if(!target)return undefined;
 if(event.sharedContextRevision===undefined)return {...target,state:'not-recorded'};
 if(!revision(event.sharedContextRevision))return {...target,state:'invalid'};
 // The current inbox supplies only this revision. Never substitute contextVersion,
 // receipt time, or a later setup status for unavailable generation metadata.
 return {...target,state:'revision-only',revision:event.sharedContextRevision};
}
function inspect(message,channel){
 if(!['here','comms'].includes(channel)||message.sender!=='din')return {state:'not-applicable'};
 const value=message.generationAudit;
 if(value===undefined)return {state:'not-recorded'};
 const origin=message.source==='scheduled'?'autonomous':'manual';
 if(!bounded(value)||!keys(value,['version','messageId','channel','origin','state','revision','checkedAt','coverage'])||value.version!==1||
    value.messageId!==message.id||value.channel!==channel||value.origin!==origin||!base(message.id,channel,origin))return {state:'invalid'};
 let clean;
 if(value.state==='recorded'&&origin==='manual')clean=manual({status:'ready',revision:value.revision,checkedAt:value.checkedAt,coverage:value.coverage},value);
 else if(value.state==='revision-only'&&origin==='autonomous'&&channel==='comms')clean=notification({id:message.id,sharedContextRevision:value.revision});
 else if(['not-recorded','invalid'].includes(value.state))clean={...base(message.id,channel,origin),state:value.state};
 if(!clean||!same(clean,value))return {state:'invalid'};
 return clean;
}
function describe(message,channel){
 const a=inspect(message,channel);
 if(a.state==='not-applicable')return 'この記録は生成返信の監査対象ではありません。';
 if(a.state==='not-recorded')return '生成時の文脈：未記録\nこの返信の確認情報は保存されていません。後から最新の情報で補ってはいません。';
 if(a.state==='invalid')return '生成時の文脈：確認情報を記録できませんでした\n形式・上限・返信との対応を確認できないため、確認済みとして表示しません。本文はそのまま保持します。';
 if(a.state==='revision-only')return '生成経路：自発通知\n文脈の版：'+a.revision+'\n確認時刻・参照範囲：未記録（現行の通知応答は版だけを返します）';
 const c=a.coverage;
 return '生成経路：通常'+(channel==='here'?'HERE':'COMMS')+'\n文脈の版：'+a.revision+'\nサーバーの確認時刻：'+a.checkedAt+
  '\n全履歴の網羅：'+(c.fullHistory?'あり（サーバー報告）':'なし')+'\n検索候補：'+c.eligibleChunks+' / 取得：'+c.includedChunks+' / 省略：'+c.omittedChunks+
  '\n検索件数は必須部分とは別の範囲です。'+(c.reasons.length?'\n参照範囲の注記：'+c.reasons.map(r=>reasons[r.code]+(r.chunks===undefined?'':' '+r.chunks+'件')).join('、'):'');
}
root.VectorContextAudit={manual,notification,inspect,describe};
if(typeof module!=='undefined')module.exports=root.VectorContextAudit;
})(typeof window==='undefined'?globalThis:window);

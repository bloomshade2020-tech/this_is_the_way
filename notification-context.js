/* Local notification context builder; originals remain unchanged. */
(function(root){
'use strict';
async function normalizeLegacyIds(events){
 const used=new Set(events.filter(m=>typeof m.id==='string').map(m=>m.id)),counts=new Map(),out=[];
 for(const m of events){
  if(typeof m.id==='string'){out.push({...m});continue;}
  if(!['here','comms'].includes(m.channel)||m.source==='test')throw Error('Invalid shared RP source');
  if(m.source==='scheduled')throw Error('受領した通知の記録IDが不正なため同期できません（履歴は保持しています）');
  const type=m.id===undefined?'missing':m.id===null?'null':typeof m.id;
  if(!['missing','null','number'].includes(type)||(type==='number'&&!Number.isFinite(m.id)))throw Error('共有履歴の記録ID形式を確認できません（履歴は保持しています）');
  const fingerprint=JSON.stringify([m.channel,type,m.id??null,m.sender??null,m.at??null,m.text??null,m.source??null,m.exchangeId??null]);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint))),b=>b.toString(16).padStart(2,'0')).join('');
  const occurrence=counts.get(fingerprint)||0;counts.set(fingerprint,occurrence+1);
  const id='vector-context-legacy-v1:'+digest+':'+occurrence;
  if(used.has(id))throw Error('共有履歴の互換IDが衝突したため同期を停止しました（履歴は保持しています）');
  used.add(id);out.push({...m,id,contextIdProvenance:{kind:'derived-legacy-context-id-v1',originalIdType:type,originalId:m.id??null,occurrence,meaning:'context reference only; original record unchanged; no inferred validity or pairing'}});
 }
 return out;
}
function build(data,selected,{version,clientId,sequence,requiredNotificationId,availability='unavailable',coverage}={}){
 if(typeof version!=='string'||!version)throw Error('An explicit committed context version is required');
 if(!['complete','stale','unavailable'].includes(availability))throw Error('Invalid context availability');
 if(availability!=='complete')return {version,clientId,sequence,availability};
 if(!coverage?.here||!coverage?.comms)throw Error('Both modes must have explicit coverage, including known empty');
 if(!Array.isArray(selected)||selected.length>24)throw Error('At most 24 explicitly selected records');
 const events=selected.map(m=>{if(!['here','comms'].includes(m.channel)||m.source==='test'||typeof m.id!=='string')throw Error('Invalid shared RP source');
  if(!['me','din'].includes(m.sender))throw Error('履歴の発話者が不明なため通知文脈を同期できません（原文は保持しています）');
  return {id:m.id,...(m.contextIdProvenance?{contextIdProvenance:m.contextIdProvenance}:{}),mode:m.channel,sender:m.sender,role:m.sender==='me'?'user':'assistant',validity:m.validity??'unclassified',validityProvenance:m.validity==null?'not classified; no inferred validity':'stored metadata; not inferred',exchangeId:m.exchangeId||null,source:m.source||'legacy-unclassified',at:m.at||null,text:String(m.text||'').slice(0,2200),truncated:String(m.text||'').length>2200};
 });
 const registered={projectInstructions:data.apiPrompt||'',documents:(data.documents||[]).map(d=>({id:d.id||null,name:d.name,content:d.content})),sharedMemo:data.sceneMemory||'',notificationScene:data.notificationScene||''};
 const references=JSON.stringify(registered);if(references.length>49000)throw Error('Registered reference JSON exceeds proposed 49000 character budget');
 const received=(data.apiMessages||[]).filter(m=>m.source==='scheduled'&&m.sender==='din').map(m=>m.id);const receiptIds=received.slice(-50);if(requiredNotificationId&&received.includes(requiredNotificationId)&&!receiptIds.includes(requiredNotificationId))receiptIds.unshift(requiredNotificationId);
 const out={version,clientId,sequence,availability,coverage,events,registered,receivedNotifications:{ids:receiptIds,meaning:'durably saved on device; not read, consent, or fictional reply; text may be omitted by bounded context'},
  instructions:'ディンの自発的な携帯連絡を検討する。HEREとCOMMSは同じRP。登録資料と出典付き共有記録を参照する。未分類の古い記録の有効性や本人の知識を決め付けない。場面・居場所・行動・同意を補わない。保存日時や実時計の経過で物語を進めない。確立した場面が不足・不明なら送らない。毎回送信する義務はない。BACKSTAGEの相談は採用しない。JSONのsendとmessageで答える。'};
 if(new TextEncoder().encode(JSON.stringify(out)).length>120000)throw Error('Proposed context UTF-8 budget exceeded');return out;
}
root.VectorNotificationContext={build,normalizeLegacyIds};if(typeof module!=='undefined')module.exports=root.VectorNotificationContext;
})(typeof window==='undefined'?globalThis:window);

/* LOCAL REVIEW ONLY. No production binding or automatic deployment configuration. */
import { DurableObject } from 'cloudflare:workers';
import {responseCall,preparePush,getPrivate,jst} from './notification-transport.js';
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=b=>{const bytes=new Uint8Array(b);let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const un64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const digest=async value=>b64(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(value))));
export class VectorNotificationCoordinator extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.sql=ctx.storage.sql;
  this.sql.exec('CREATE TABLE IF NOT EXISTS control (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, seq INTEGER UNIQUE NOT NULL, encrypted TEXT NOT NULL, bytes INTEGER NOT NULL, digest TEXT NOT NULL, origin TEXT NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS legacy_receipts (id TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(id,digest))');
  this.sql.exec('INSERT OR IGNORE INTO control VALUES (1,?)',JSON.stringify({enabled:false,epoch:0,highwater:-1,seq:0,job:null,context:null,contextVersion:null,pauseReason:'off'}));
  const recovered=this.control();if(recovered.job&&['reserved','model-started','saved','push-started'].includes(recovered.job.status)){const push=['saved','push-started'].includes(recovered.job.status);recovered.job.status=push?'unknown-push':'unknown';recovered.pauseReason=push?'push-outcome-unknown':'model-outcome-unknown';this.put(recovered);}
 }
 rolloutMode(){return this.env.VECTOR_NOTIFICATION_MODE==='active'?'active':'migration-stop';}
 enforceRolloutStop(){
  const mode=this.rolloutMode();if(mode==='active')return false;
  this.tx(()=>{const s=this.control();if(s.enabled||s.job||s.pauseReason!==mode){s.enabled=false;s.epoch++;s.revision=(s.revision||0)+1;s.job=null;s.pauseReason=mode;this.put(s);}});return true;
 }
 requireGeneration(){if(this.enforceRolloutStop())throw Error('通知は移行・保守のため強制停止中です。受信済み本文は保持されます');}
 control(){return JSON.parse(this.sql.exec('SELECT value FROM control WHERE id=1').one().value)}
 put(s){this.sql.exec('UPDATE control SET value=? WHERE id=1',JSON.stringify(s))}
 tx(fn){return this.ctx.storage.transactionSync(fn)}
 count(){return this.sql.exec('SELECT count(*) AS n, coalesce(sum(bytes),0) AS bytes FROM messages').one()}
 async key(){const bytes=un64(this.env.VECTOR_STATE_KEY);if(bytes.length!==32)throw Error('Invalid encryption configuration');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt'])}
 async seal(value){const iv=crypto.getRandomValues(new Uint8Array(12));return JSON.stringify({v:1,iv:b64(iv),data:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},await this.key(),enc.encode(JSON.stringify(value))))})}
 async open(value){const p=JSON.parse(value);return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(p.iv)},await this.key(),un64(p.data))))}
 now(){return Date.now()}
 fresh(s){return Number.isFinite(s.acceptedAt)&&this.now()-s.acceptedAt>=0&&this.now()-s.acceptedAt<86400000}
 status(){this.enforceRolloutStop();const s=this.control(),c=this.count();return {rolloutMode:this.rolloutMode(),lastGeneratedId:s.lastGeneratedId||null,usageTotals:{input:(s.usageTotals?.input||0)+(s.legacyUsage?.input||0),output:(s.usageTotals?.output||0)+(s.legacyUsage?.output||0)},revision:s.revision||0,acceptedAt:s.acceptedAt?new Date(s.acceptedAt).toISOString():null,expired:!this.fresh(s),enabled:s.enabled,epoch:s.epoch,contextVersion:s.contextVersion,pauseReason:this.rolloutMode()!=='active'?this.rolloutMode():s.enabled&&!this.fresh(s)?'context-expired':s.pauseReason,count:c.n,bytes:c.bytes,job:s.job?{slot:s.job.slot,status:s.job.status}:null}}
 controlCheck(s,proof,action){
  if(!s.controlOwner&&!proof)return false; // Internal pre-initialization compatibility; HTTP requires a proof.
  if(typeof s.controlOwner!=='string'||!proof||typeof proof.owner!=='string'||proof.owner!==s.controlOwner||!Number.isSafeInteger(proof.sequence)||proof.sequence<1)throw Error('Control ownership changed: explicit stop/reconcile required');
  if(proof.sequence<(s.controlSequence||0))throw Error('Stale control operation');
  if(proof.sequence===(s.controlSequence||0)){
   if(s.controlAction!==action)throw Error('Control operation conflict');
   return true;
  }
  return false;
 }
 controlApplied(s,proof,action){if(proof){s.controlSequence=proof.sequence;s.controlAction=action;}}
 recoverControl({owner,baseRevision}){
  if(typeof owner!=='string'||owner.length<20||owner.length>100)throw Error('Invalid recovery identity');
  this.tx(()=>{const s=this.control();if(s.controlOwner===owner)return;
   if(baseRevision!==(s.revision||0))throw Error('Recovery conflict: inspect state and explicitly stop again');
   s.controlOwner=owner;s.controlSequence=0;s.controlAction=null;s.enabled=false;s.epoch++;s.revision=(s.revision||0)+1;s.job=null;s.pauseReason='off';this.put(s);
  });return this.controlStatus(owner);
 }
 controlStatus(owner){const s=this.control();return {...this.status(),controlOwned:typeof owner==='string'&&s.controlOwner===owner,controlSequence:s.controlSequence||0};}
 async setContext(context,baseRevision,enable=false,proof){
  if(enable)this.requireGeneration();
  // Availability is evidence, never a judgement that an old fictional scene is invalid.
  if(!context||typeof context.version!=='string'||!context.version||context.version.length>160||!['complete','unavailable','stale'].includes(context.availability))throw Error('Context version/availability required');
  if(context.availability==='complete'&&(!context.coverage?.here||!context.coverage?.comms||!Array.isArray(context.events)||context.events.some(e=>!['here','comms'].includes(e.mode)||typeof e.id!=='string'||typeof e.text!=='string'||!['me','din'].includes(e.sender)||e.role!==(e.sender==='me'?'user':'assistant'))||typeof context.instructions!=='string'))throw Error('Both mode coverage and instructions required');
  if(enc.encode(JSON.stringify(context)).length>120000)throw Error('Proposed context byte budget exceeded');
  if(typeof context.clientId!=='string'||context.clientId.length>100||!Number.isSafeInteger(context.sequence)||context.sequence<1)throw Error('Committed client sequence required');
  const hash=await digest(context),sealed=await this.seal(context);
  if(enable)this.requireGeneration();
  this.tx(()=>{const s=this.control();const action=enable?'enable':'update';if(['unknown','unknown-push'].includes(s.job?.status))throw Error('Unknown external outcome: explicitly stop/reconcile first');if(this.controlCheck(s,proof,action))return;this.controlApplied(s,proof,action);
   if(s.contextHash===hash){if(enable){if(baseRevision!==(s.revision||0))throw Error('Snapshot conflict');s.enabled=true;s.epoch++;s.revision=(s.revision||0)+1;s.job=null;}this.put(s);return;} // retries never renew freshness
   if(baseRevision!==(s.revision||0))throw Error('Snapshot conflict: refresh server revision');
   if(s.clientId===context.clientId&&context.sequence<=(s.clientSequence||0))throw Error('Out-of-order snapshot');
   s.epoch++;s.job=null;s.revision=(s.revision||0)+1;s.context=sealed;s.contextHash=hash;s.contextVersion=context.version;s.clientId=context.clientId;s.clientSequence=context.sequence;s.acceptedAt=this.now();s.availability=context.availability;
   if(enable)s.enabled=true;
   s.pauseReason=context.availability==='complete'?(s.enabled?'ready':'off'):'context-'+context.availability;this.put(s);
  });
  return this.status();
 }
 enable(value,proof){if(value)this.requireGeneration();this.tx(()=>{const s=this.control();if(this.controlCheck(s,proof,'disable'))return;this.controlApplied(s,proof,'disable');s.enabled=!!value;s.revision=(s.revision||0)+1;s.epoch++;s.job=null;s.pauseReason=value?(s.availability==='complete'?'ready':'context-unavailable'):'off';this.put(s)});return this.status()}
 async subscribe(subscription,baseRevision,proof){const encrypted=await this.seal(subscription);this.tx(()=>{const s=this.control();if(['unknown','unknown-push'].includes(s.job?.status))throw Error('Unknown external outcome: explicitly stop/reconcile first');if(this.controlCheck(s,proof,'subscribe'))return;this.controlApplied(s,proof,'subscribe');if(baseRevision!==(s.revision||0))throw Error('Subscription conflict: refresh server revision');s.subscription=encrypted;s.revision=(s.revision||0)+1;s.epoch++;s.job=null;this.put(s)});return {ok:true};}
 async testPush(proof){
  this.requireGeneration();
  const reserved=this.tx(()=>{const s=this.control();if(this.controlCheck(s,proof,'test'))throw Error('Test already attempted; no automatic retry');this.controlApplied(s,proof,'test');if(!s.enabled||(!this.env.PUSH&&!s.subscription))throw Error('通知を有効にして購読を確認してください');if(s.lastTestAt&&this.now()-s.lastTestAt<60000)throw Error('テスト通知は1分以上空けてください');s.lastTestAt=this.now();this.put(s);return {epoch:s.epoch,subscription:s.subscription};});
  let prepared;if(!this.env.PUSH)prepared=await preparePush(this.env,await this.open(reserved.subscription));
  this.requireGeneration();
  const allowed=this.tx(()=>{const s=this.control();return s.enabled&&s.epoch===reserved.epoch;});if(!allowed)return {ok:false,acceptedByPushService:false};
  const response=await (this.env.PUSH?this.env.PUSH.fetch('https://mock.invalid/push',{method:'POST',body:JSON.stringify({title:'VECTOR',body:'メッセージが届いています'})}):fetch(prepared.endpoint,prepared.init));
  return {ok:response.ok,acceptedByPushService:response.ok};
 }
 async readLegacy(){
  if(!this.env.VECTOR_KV)return {imported:[],conflicts:[],deferred:[]};
  const [stored,meta]=await Promise.all([getPrivate(this.env,'inbox'),getPrivate(this.env,'meta')]);const entries=stored||[];
  this.tx(()=>{const s=this.control();s.legacyUsage={input:Math.max(s.legacyUsage?.input||0,Number(meta?.usageTotals?.input)||0),output:Math.max(s.legacyUsage?.output||0,Number(meta?.usageTotals?.output)||0)};const prior=Date.parse(meta?.lastSentAt);if(Number.isFinite(prior))s.lastSentAt=Math.max(s.lastSentAt||0,prior);this.put(s)});
  const result=await this.importLegacy(Array.isArray(entries)?entries:[]);
  this.tx(()=>{const s=this.control();s.legacyBlocked=result.conflicts.length>0||result.deferred.length>0;if(s.legacyBlocked)s.pauseReason='legacy-review-required';this.put(s)});
  return result;
 }
 async inbox({legacyCursor=0,newCursor=0}={}){
  const legacy=await this.readLegacy();
  const old=[...this.sql.exec("SELECT * FROM messages WHERE origin='legacy' AND seq>? ORDER BY seq LIMIT 30",Number(legacyCursor)||0)];
  const fresh=[...this.sql.exec("SELECT * FROM messages WHERE origin='new' AND seq>? ORDER BY seq LIMIT 30",Number(newCursor)||0)];
  let oldN=Math.min(10,old.length),newN=Math.min(20,fresh.length);
  if(oldN<10)newN=Math.min(fresh.length,30-oldN);if(newN<20)oldN=Math.min(old.length,30-newN);
  const rows=[...old.slice(0,oldN),...fresh.slice(0,newN)].sort((a,b)=>a.seq-b.seq);
  return {legacy,hasMore:old.length>oldN||fresh.length>newN,entries:await Promise.all(rows.map(r=>this.open(r.encrypted))),cursors:{legacyCursor:old[oldN-1]?.seq||legacyCursor,newCursor:fresh[newN-1]?.seq||newCursor},...this.status()};
 }

 ack(ids){if(!Array.isArray(ids)||ids.length>30)throw Error('Invalid ack');
  try{this.tx(()=>{for(const id of new Set(ids)){const row=[...this.sql.exec('SELECT * FROM messages WHERE id=?',id)][0];if(!row)continue;
   if(row.origin==='legacy'&&this.sql.exec('SELECT count(*) AS n FROM legacy_receipts').one().n>=1000)throw Object.assign(Error('Legacy receipt cap reached; body retained'),{code:'LEGACY_RECEIPT_CAP'});
   if(row.origin==='legacy')this.sql.exec('INSERT OR IGNORE INTO legacy_receipts VALUES (?,?)',row.id,row.digest);
   this.sql.exec('DELETE FROM messages WHERE id=?',id);
  }});}catch(e){
   if(e.code!=='LEGACY_RECEIPT_CAP')throw e;
   // The entire mixed transaction was rolled back. Only identify requested new records.
   const newOnlyAckIds=[...new Set(ids)].filter(id=>typeof id==='string'&&[...this.sql.exec("SELECT 1 FROM messages WHERE id=? AND origin='new'",id)].length);
   return {ok:false,code:'LEGACY_RECEIPT_CAP',error:'旧通知の受領確認の控えが上限です。旧本文はサーバーに保持しています',newOnlyAckIds};
  }return {ok:true};
 }
 async importLegacy(entries){
  // Read-only caller-provided legacy records. Never modify or delete the old KV array.
  const prepared=[];for(const e of entries){if(!e||typeof e.id!=='string'||typeof e.text!=='string'||!Number.isFinite(Date.parse(e.at)))continue;prepared.push({e,hash:await digest(e),sealed:await this.seal(e)})}
  return this.tx(()=>{const s=this.control(),result={imported:[],conflicts:[],deferred:[]};for(const {e,hash,sealed} of prepared){
   if([...this.sql.exec('SELECT 1 FROM legacy_receipts WHERE id=? AND digest=?',e.id,hash)].length)continue;
   if([...this.sql.exec('SELECT 1 FROM legacy_receipts WHERE id=?',e.id)].length){result.conflicts.push(e.id);continue;}
   const prior=[...this.sql.exec('SELECT digest FROM messages WHERE id=?',e.id)][0];if(prior){if(prior.digest!==hash)result.conflicts.push(e.id);continue;}
   const c=this.count();const reserved=s.job&&['reserved','model-started'].includes(s.job.status)?1:0;if(c.n+reserved>=50||c.bytes+reserved*8192+enc.encode(sealed).length>Number(this.env.UNREAD_BYTE_CAP||1048576)){result.deferred.push(e.id);continue;}
   s.seq++;this.sql.exec('INSERT INTO messages VALUES (?,?,?,?,?,?)',e.id,s.seq,sealed,enc.encode(sealed).length,hash,'legacy');result.imported.push(e.id);
  }this.put(s);return result;});
 }
 async cycle(slot){
  if(this.enforceRolloutStop())return {started:false,...this.status()};
  if(!Number.isSafeInteger(slot)||slot<0)throw Error('Invalid slot');
  await this.readLegacy();
  const reserved=this.tx(()=>{const s=this.control(),c=this.count();
   if(!s.enabled||s.availability!=='complete'||!s.context||s.legacyBlocked)return null;
   if(!this.env.PUSH&&!s.subscription){s.pauseReason='subscription-unavailable';this.put(s);return null;}
   if(!this.fresh(s)){s.pauseReason='context-expired';this.put(s);return null;}
   if(s.lastSentAt&&this.now()-s.lastSentAt<10800000){s.pauseReason='cooldown';this.put(s);return null;}
   if(slot<=s.highwater||s.job)return null;
   if(this.sql.exec('SELECT count(*) AS n FROM legacy_receipts').one().n>=1000||c.n>=50||c.bytes+8192>Number(this.env.UNREAD_BYTE_CAP||1048576)){s.pauseReason='capacity';this.put(s);return null;}
   s.highwater=slot;s.job={slot,epoch:s.epoch,status:'reserved',version:s.contextVersion};this.put(s);return {job:s.job,context:s.context};
  });if(!reserved)return {started:false,...this.status()};
  const context=await this.open(reserved.context);
  const pending=await Promise.all([...this.sql.exec("SELECT encrypted FROM messages WHERE origin='new' ORDER BY seq LIMIT 50")].map(r=>this.open(r.encrypted)));
  const known=new Set([...(context.events?.map(e=>e.id)||[]),...(context.receivedNotifications?.ids||[])]);
  const recentId=this.control().lastGeneratedId;
  if(recentId&&!known.has(recentId)&&!pending.some(e=>e.id===recentId)){this.tx(()=>{const s=this.control();if(s.job?.slot===slot){s.job=null;s.pauseReason='awaiting-received-context';this.put(s)}});return {started:false,...this.status()};}
  context.pendingNotifications=pending.filter(e=>!known.has(e.id)).map(e=>({...e,mode:'comms',sender:'din',role:'assistant',validity:'unclassified',provenance:'server-generated; device receipt/read/user reply not implied'}));
  const body=JSON.stringify({instructions:context.instructions,context:{...context,instructions:undefined},policy:'HERE and COMMS are the same established RP. Do not invent whereabouts, consent, or fictional time passage. Decide send or skip; sending is not obligatory.'});
  if(enc.encode(body).length>200000){this.tx(()=>{const s=this.control();if(s.job?.slot===slot){s.job=null;s.pauseReason='context-payload-too-large';this.put(s)}});return {started:false,...this.status()};}
  // The harness binds fake services. Production adapter reuses the existing transport.
  if(this.enforceRolloutStop())return {started:false,...this.status()};
  const allowed=this.tx(()=>{const s=this.control();if(!s.enabled||!this.fresh(s)||s.epoch!==reserved.job.epoch||s.job?.slot!==slot)return false;s.job.status='model-started';this.put(s);return true});
  if(!allowed)return {started:false};
  let decision;try{
   if(this.env.MODEL)decision=await (await this.env.MODEL.fetch('https://mock.invalid/model',{method:'POST',body})).json();
   else {const output=await responseCall(this.env,{instructions:'あなたはディンの自発的な携帯連絡を検討する。HEREとCOMMSは同じRP。以下の登録資料・共有記録の確立した場面だけを根拠にする。別行動で連絡可能と判断できない、同席・睡眠・危険・休息中、場面不明なら送らない。過去・居場所・行動・同意・ユーザーの返答を創作しない。保存日時と実時間の経過で物語を進めない。未受領通知はディンの送信記録であり既読・返答ではない。送信は義務ではない。短い日本語の端末文のみ、地の文やメタ説明なし。サーバー実時刻 '+jst(new Date(this.now()).toISOString())+' はRP時刻ではない。JSONのみ: {"send":boolean,"message":string}',input:[{role:'user',content:body}],maxOutput:360});
    this.tx(()=>{const s=this.control();const u=s.usageTotals||{input:0,output:0};u.input+=output.usage.input_tokens;u.output+=output.usage.output_tokens;s.usageTotals=u;this.put(s)});
    decision=JSON.parse(output.reply.replace(/^```(?:json)?\s*|\s*```$/g,''));
   }
  }catch{this.tx(()=>{const s=this.control();if(s.job?.slot===slot){s.job.status='unknown';s.pauseReason='model-outcome-unknown';this.put(s)}});return {unknown:true}}
  if(decision?.send!==true||typeof decision.message!=='string'||!decision.message.trim()||decision.message.length>260){this.tx(()=>{const s=this.control();if(s.job?.slot===slot){s.job=null;this.put(s)}});return {sent:false}}
  const message={id:'do-'+slot,at:new Date(this.now()).toISOString(),text:decision.message.trim(),source:'scheduled',channel:'comms',sender:'din',contextVersion:reserved.job.version};
  const sealed=await this.seal(message),hash=await digest(message),bytes=enc.encode(sealed).length;
  if(this.enforceRolloutStop())return {sent:false,...this.status()};
  const saved=this.tx(()=>{const s=this.control(),c=this.count();if(!s.enabled||!this.fresh(s)||s.epoch!==reserved.job.epoch||s.contextVersion!==reserved.job.version||s.job?.slot!==slot)return false;
   if(c.n>=50||c.bytes+bytes>Number(this.env.UNREAD_BYTE_CAP||1048576)){s.job=null;s.pauseReason='capacity';this.put(s);return false;}
   s.seq++;this.sql.exec('INSERT INTO messages VALUES (?,?,?,?,?,?)',message.id,s.seq,sealed,bytes,hash,'new');s.lastSentAt=this.now();s.lastGeneratedId=message.id;s.job.status='saved';this.put(s);return true;
  });if(!saved)return {sent:false};
  const pushBody=JSON.stringify({title:'VECTOR',body:'メッセージが届いています'});
  let prepared;try{if(!this.env.PUSH){const sub=await this.open(this.control().subscription);prepared=await preparePush(this.env,sub);}}catch{this.tx(()=>{const s=this.control();if(s.job?.slot===slot){s.job=null;s.pauseReason='push-preparation-failed';this.put(s)}});return {saved:true,push:false};}
  if(this.enforceRolloutStop())return {saved:true,push:false,...this.status()};
  const startPush=this.tx(()=>{const s=this.control();if(!s.enabled||!this.fresh(s)||s.epoch!==reserved.job.epoch||s.job?.slot!==slot)return false;s.job.status='push-started';this.put(s);return true});
  if(!startPush)return {saved:true,push:false};
  try{const result=await (this.env.PUSH?this.env.PUSH.fetch('https://mock.invalid/push',{method:'POST',body:pushBody}):fetch(prepared.endpoint,prepared.init));this.tx(()=>{const s=this.control();if(s.job?.slot===slot){s.job=null;s.pauseReason=result.ok?'ready':'push-failed';if([404,410].includes(result.status))s.subscription=null;this.put(s)}});return {saved:true,push:result.ok}}
  catch{this.tx(()=>{const s=this.control();if(s.job?.slot===slot){s.job.status='unknown-push';s.pauseReason='push-outcome-unknown';this.put(s)}});return {saved:true,pushUnknown:true}}
 }
}
// The authenticated adapter is index.js. baseline.js remains the unmodified comparison source.

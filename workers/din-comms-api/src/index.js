/** VECTOR v0.7 Cloudflare Worker. Public source: NEVER paste secrets into this file.
 * Required: OPENAI_API_KEY, DIN_ACCESS_TOKEN. Optional notification backend:
 * KV binding VECTOR_KV; secrets VECTOR_STATE_KEY (base64url of 32 random bytes),
 * VAPID_PRIVATE_KEY (base64url P-256 private scalar); VAPID_PUBLIC_KEY (base64url uncompressed P-256 public key).
 * Trigger: "0 * * * *" (UTC). Requires consent and a valid Apple Home Screen PWA push subscription.
 */
const ALLOWED_ORIGIN='https://bloomshade2020-tech.github.io';
const MODEL='gpt-6-sol',MAX_OUTPUT_TOKENS=2200;
const te=new TextEncoder(),td=new TextDecoder();
const BASE='https://bloomshade2020-tech.github.io/this_is_the_way/';
const b64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const from64=s=>Uint8Array.from(atob(String(s).replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),ch=>ch.charCodeAt(0));
const nowISO=()=>new Date().toISOString();
const jst=iso=>new Date(iso).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' JST';
function headers(origin){return {'Cache-Control':'no-store','Vary':'Origin',...(origin===ALLOWED_ORIGIN?{'Access-Control-Allow-Origin':ALLOWED_ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}:{})}}
function json(result,status,h){return new Response(JSON.stringify(result),{status,headers:{...h,'Content-Type':'application/json; charset=utf-8'}})}
async function safeMatch(a,b){if(!a||!b||a.length!==b.length)return false;const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',te.encode(a)),crypto.subtle.digest('SHA-256',te.encode(b))]);const xx=new Uint8Array(x),yy=new Uint8Array(y);let d=0;for(let i=0;i<xx.length;i++)d|=xx[i]^yy[i];return d===0;}
async function requestJSON(request,max=440000){const length=Number(request.headers.get('Content-Length')||0);if(length>max)throw Error('サイズ上限を超えています');const raw=await request.text();if(raw.length>max)throw Error('サイズ上限を超えています');return JSON.parse(raw);}
async function responseCall(env,{instructions,input,maxOutput=MAX_OUTPUT_TOKENS}){
 const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,store:false,reasoning:{effort:'low'},max_output_tokens:maxOutput,instructions,input})});
 const out=await res.json().catch(()=>({}));if(!res.ok){const err=Object.assign(new Error('OpenAI APIエラー '+res.status),{status:res.status,code:out?.error?.code});throw err;}
 const reply=(out.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('').trim();
 if(!reply)throw Error('返答本文が空です');return {reply,usage:{input_tokens:out.usage?.input_tokens||0,output_tokens:out.usage?.output_tokens||0},model:out.model};
}
async function chat(body,env,h){if(!body||typeof body.message!=='string'||typeof body.instructions!=='string')return json({error:'message/instructionsが必要です'},400,h);
 const message=body.message.trim(),instructions=body.instructions.trim(),channel=['comms','here','backstage'].includes(body.channel)?body.channel:'comms';
 if(!message||message.length>4000||!instructions||instructions.length>50000)return json({error:'文章または資料の長さを確認してください'},400,h);
 let photo=null;if(body.image!=null){if(typeof body.image!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.image)||body.image.length>225000)return json({error:'JPEG画像を圧縮して添付してください'},400,h);photo=body.image;}
 const history=Array.isArray(body.history)?body.history.slice(-24):[];
 const safeHistory=history.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.length<=3000).map(m=>({role:m.role,content:m.content}));
 const receivedAt=nowISO(),sentAt=(typeof body.sentAt==='string'&&!isNaN(Date.parse(body.sentAt)))?new Date(body.sentAt).toISOString():null;
 const clock=`【時刻情報】サーバーでの今回の受信: ${jst(receivedAt)}（${receivedAt}）。${sentAt?'端末での送信: '+jst(sentAt)+'（'+sentAt+'）。':''}以下の履歴に記した日時は保存済み時刻です。実JSTと物語内の時刻は区別し、古い過去発言の日時を現在時刻と誤認しないこと。実時刻を確認できないと断定しないこと。\n`;
 const role=(channel==='backstage'?'あなたは相談の支援者です。ロールプレイの人物にはなりきらないでください。':'これは独立したRP実行環境です。参照できない外部資料を読んだと偽らないでください。HEREは対面の本編、DIN COMMSはその本編に属する端末通信。通信は対面の発話に変換しない。');
 try{const result=await responseCall(env,{instructions:role+'\n'+clock+instructions,input:[...safeHistory,{role:'user',content:photo?[{type:'input_text',text:message},{type:'input_image',image_url:photo,detail:'low'}]:message}]});return json({...result,receivedAt,repliedAt:nowISO()},200,h);
 }catch(err){return json({error:err.status===429?'APIの利用制限または残高を確認してください（429）':err.status===401?'OpenAI APIキーが正しくありません（401）':err.status===403?'モデルのAPI利用権限を確認してください（403）':err.message||'OpenAIへの接続に失敗しました'},err.status===429?429:502,h);}
}
async function stateKey(env){if(!env.VECTOR_STATE_KEY||!env.VECTOR_KV)throw Error('CloudflareのKVと暗号化シークレットが未設定です');const bytes=from64(env.VECTOR_STATE_KEY);if(bytes.byteLength!==32)throw Error('VECTOR_STATE_KEYは32バイト必要です');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
async function encrypt(env,payload){const key=await stateKey(env),iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,te.encode(JSON.stringify(payload)));return JSON.stringify({v:1,iv:b64url(iv),data:b64url(data)});}
async function decrypt(env,s){if(!s)return null;const o=JSON.parse(s),key=await stateKey(env);if(o.v!==1)throw Error('暗号文の版が違います');return JSON.parse(td.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(o.iv)},key,from64(o.data))));}
async function getPrivate(env,name){return decrypt(env,await env.VECTOR_KV.get('private:'+name));}
async function setPrivate(env,name,value){await env.VECTOR_KV.put('private:'+name,await encrypt(env,value));}
const cleanString=(s,n)=>typeof s==='string'?s.slice(0,n):'';
function cleanSnapshot(body){if(!body||typeof body!=='object')throw Error('状態データが必要です');
 const events=Array.isArray(body.events)?body.events.slice(-14).filter(m=>m&&typeof m.text==='string'&&['me','din'].includes(m.sender)&&['here','comms'].includes(m.channel)).map(m=>({id:cleanString(m.id,110),channel:m.channel,sender:m.sender,at:!isNaN(Date.parse(m.at))?new Date(m.at).toISOString():null,text:cleanString(m.text,850)})):[];
 return {enabled:true,scene:cleanString(body.scene,4000),events,updatedAt:nowISO(),lastActivityAt:events.at(-1)?.at||null};
}
async function notificationEndpoint(path,body,env,h){
 if(!env.VECTOR_KV||!env.VECTOR_STATE_KEY)return json({error:'通知用のKVと暗号化設定が未接続です。Cloudflareの設定手順を確認してください。'},503,h);
 try{
  if(path==='/notifications/config'){const configured=Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY);return json({configured,vapidPublicKey:configured?env.VAPID_PUBLIC_KEY:'',serverClock:jst(nowISO())},200,h);}
  if(path==='/notifications/enable'){
    const snapshot=cleanSnapshot(body);if(!snapshot.scene.trim()){return json({error:'自発通知用の現在地・共有状況を先に入力してください。'},400,h);}
    await setPrivate(env,'snapshot',snapshot);return json({ok:true,updatedAt:snapshot.updatedAt},200,h);
  }
  if(path==='/notifications/update'){
    const prior=await getPrivate(env,'snapshot');if(!prior?.enabled)return json({error:'先に通知機能を有効にしてください'},409,h);
    const update=cleanSnapshot(body);if(!update.scene.trim())return json({error:'通知の現在地情報がありません'},400,h);
    await setPrivate(env,'snapshot',update);return json({ok:true,updatedAt:update.updatedAt},200,h);
  }
  if(path==='/notifications/subscribe'){
    if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return json({error:'VAPID設定がありません'},503,h);
    const sub=body?.subscription;try{const u=new URL(sub.endpoint);if(u.protocol!=='https:'||!sub.keys?.p256dh||!sub.keys?.auth)throw Error('invalid');if(sub.endpoint.length>2200||sub.keys.p256dh.length>180||sub.keys.auth.length>80)throw Error('size');}catch{return json({error:'Push購読が不正です'},400,h);}
    await setPrivate(env,'subscription',{endpoint:sub.endpoint,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}});return json({ok:true},200,h);
  }
  if(path==='/notifications/test'){
    if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return json({error:'VAPID設定がありません'},503,h);
    const sub=await getPrivate(env,'subscription');if(!sub)return json({error:'iPhoneのPush購読を先に有効にしてください'},409,h);
    const meta=await getPrivate(env,'meta')||{};if(meta.lastTestAt&&Date.now()-Date.parse(meta.lastTestAt)<60000)return json({error:'テスト通知は1分以上空けてください'},429,h);
    const push=await sendPush(env,sub);if(!push.ok)return json({error:'Push配信事業者からHTTP '+push.status+' が返りました'},502,h);
    meta.lastTestAt=nowISO();await setPrivate(env,'meta',meta);return json({ok:true,acceptedByPushService:true},200,h);
  }
  if(path==='/notifications/inbox'){const entries=await getPrivate(env,'inbox')||[],meta=await getPrivate(env,'meta')||{};return json({entries:Array.isArray(entries)?entries.slice(-30):[],usageTotals:meta.usageTotals||{input:0,output:0}},200,h);}
  if(path==='/notifications/ack'){const ids=Array.isArray(body?.ids)?body.ids.filter(x=>typeof x==='string').slice(0,30):[];const old=await getPrivate(env,'inbox')||[];await setPrivate(env,'inbox',old.filter(m=>!ids.includes(m.id)));return json({ok:true},200,h);}
  if(path==='/notifications/disable'){await Promise.all(['snapshot','subscription','inbox','meta'].map(k=>env.VECTOR_KV.delete('private:'+k)));return json({ok:true},200,h);}
  return json({error:'Not found'},404,h);
 }catch(err){return json({error:'通知処理に失敗しました：'+String(err?.message||err).slice(0,160)},500,h);}
}
// Web Push payload encryption (RFC 8291 aes128gcm), no external dependencies.
async function hmac(key,data){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,data));}
async function expand(prk,info,length){let t=new Uint8Array(0),buf=new Uint8Array(0),n=1;while(buf.length<length){const part=new Uint8Array(t.length+info.length+1);part.set(t);part.set(info,t.length);part[part.length-1]=n++;t=await hmac(prk,part);const next=new Uint8Array(buf.length+t.length);next.set(buf);next.set(t,buf.length);buf=next;}return buf.slice(0,length);}
const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;};
async function makePushBody(subscription,message){
 const ua=from64(subscription.keys.p256dh),auth=from64(subscription.keys.auth);if(ua.length!==65||auth.length<16)throw Error('購読鍵が不正です');
 const peer=await crypto.subtle.importKey('raw',ua,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const server=/** @type {CryptoKeyPair} */ (await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']));
 const as=new Uint8Array(/** @type {ArrayBuffer} */ (await crypto.subtle.exportKey('raw',server.publicKey)));
 const shared=new Uint8Array(await crypto.subtle.deriveBits(/** @type {EcdhKeyDeriveParams} */ ({name:'ECDH',public:peer}),server.privateKey,256));
 const ikm=await expand(await hmac(auth,shared),concat(te.encode('WebPush: info\0'),ua,as),32);
 const salt=crypto.getRandomValues(new Uint8Array(16));const prk=await hmac(salt,ikm);
 const cek=await expand(prk,te.encode('Content-Encoding: aes128gcm\0'),16),nonce=await expand(prk,te.encode('Content-Encoding: nonce\0'),12);
 const aead=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
 const msg=concat(te.encode(message),new Uint8Array([2]));const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},aead,msg));
 const hdr=new Uint8Array(21);hdr.set(salt);new DataView(hdr.buffer).setUint32(16,4096);hdr[20]=as.length;
 return concat(hdr,as,encrypted);
}
async function sendPush(env,sub){
 const publicKey=from64(env.VAPID_PUBLIC_KEY),d=from64(env.VAPID_PRIVATE_KEY);if(publicKey.length!==65||d.length!==32)throw Error('VAPID key invalid');
 const privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:b64url(publicKey.slice(1,33)),y:b64url(publicKey.slice(33)),d:b64url(d),ext:false},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const aud=new URL(sub.endpoint).origin,exp=Math.floor(Date.now()/1000)+3500;
 const part=b64url(te.encode(JSON.stringify({typ:'JWT',alg:'ES256'})))+'.'+b64url(te.encode(JSON.stringify({aud,exp,sub:BASE})));
 const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,te.encode(part));const jwt=part+'.'+b64url(new Uint8Array(sig));
 const payload=await makePushBody(sub,JSON.stringify({title:'VECTOR',body:'メッセージが届いています',url:BASE+'?open=comms'}));
 const res=await fetch(sub.endpoint,{method:'POST',headers:{'TTL':'3600','Urgency':'normal','Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream','Authorization':'vapid t='+jwt+', k='+env.VAPID_PUBLIC_KEY},body:payload});
 return {ok:res.ok,status:res.status};
}
async function notificationCycle(env){
 if(!env.VECTOR_KV||!env.VECTOR_STATE_KEY||!env.OPENAI_API_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_PUBLIC_KEY)return;
 const state=await getPrivate(env,'snapshot'),subscription=await getPrivate(env,'subscription');if(!state?.enabled||!state.scene?.trim()||!subscription)return;
 const now=Date.now();if(now-Date.parse(state.updatedAt)>14*864e5)return;
 const meta=await getPrivate(env,'meta')||{};
 if(meta.lastSentAt&&now-Date.parse(meta.lastSentAt)<3*3600000)return; // protect against excessive messages
 const events=state.events||[];const last=events.at(-1);
 const scenario='【現在共有状態（端末から本人が同期を許可した範囲）】\n'+state.scene+'\n【端末と対面の最近の有効入力・出力（テスト内容は含めない）】\n'+events.map(m=>`[${m.channel.toUpperCase()} ${m.sender} ${m.at||'不明'}] ${m.text}`).join('\n');
 const guide=`あなたは携帯通知のための判定を一回だけ行う。人物はディン・ジャリン。HEREは本編対面RP、DIN COMMSは本編から派生した離れている間の携帯連絡。同じ出来事と知識を引き継ぐ。資料にない過去や本人の行動・同意を作らず、現在別行動中で通信可能と共有記録から確認できる場合のみ検討。状態が古い・不明・対面同席中・睡眠中・危険・休息中なら送らない。送信は義務ではない。本人の理由を優先して通知しない選択を許す。送るなら文面は端末に打つ短い日本語だけ、台詞括弧・地の文・外・日時報告・メタ説明・キャラクター名を含めない。返信を要求しない。重要な新決定や未共有の成立は作らない。現在時刻は${jst(nowISO())}。JSONのみ: {"send":boolean,"message":string}。`;
 try{const output=await responseCall(env,{instructions:guide,input:[{role:'user',content:scenario+'\n\nこれをもとに今、本人からの自発連絡を送るか判断してください。'}],maxOutput:360});
 meta.usageTotals={input:(Number(meta.usageTotals?.input)||0)+output.usage.input_tokens,output:(Number(meta.usageTotals?.output)||0)+output.usage.output_tokens};await setPrivate(env,'meta',meta);
 let decision;try{decision=JSON.parse(output.reply.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{return;}
 if(decision?.send!==true||typeof decision.message!=='string')return;
 const msg=decision.message.trim();if(!msg||msg.length>260||msg.includes('外：')||msg.includes('```'))return;
 const at=nowISO(),id=crypto.randomUUID(),event={id,at,text:msg,sender:'din',channel:'comms',source:'scheduled',usage:output.usage};
 const old=await getPrivate(env,'inbox')||[];await setPrivate(env,'inbox',[...old,event].slice(-30));await setPrivate(env,'meta',{...meta,lastSentAt:at,lastMessageId:id});
 const push=await sendPush(env,subscription);if(push.status===404||push.status===410)await env.VECTOR_KV.delete('private:subscription');
 }catch(err){console.error('VECTOR notify error',String(err?.message||err).slice(0,200));}
}
export default {
 async fetch(request,env){const origin=request.headers.get('Origin')||'',h=headers(origin),url=new URL(request.url);
  if(origin!==ALLOWED_ORIGIN)return json({error:'許可されたアプリからのみ利用できます'},403,h);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:h});
  if(request.method!=='POST')return json({error:'Not found'},404,h);
  if(!env.DIN_ACCESS_TOKEN||env.DIN_ACCESS_TOKEN.length<24||!env.OPENAI_API_KEY)return json({error:'WorkerのSecret設定を確認してください'},503,h);
  const auth=request.headers.get('Authorization')||'';if(!await safeMatch(auth.startsWith('Bearer ')?auth.slice(7):'',env.DIN_ACCESS_TOKEN))return json({error:'DIN_ACCESS_TOKENが違います'},401,h);
  let body;try{body=await requestJSON(request);}catch{return json({error:'送信JSONを読めません（サイズ上限440KB）'},400,h);}
  if(url.pathname==='/chat')return chat(body,env,h);
  if(url.pathname.startsWith('/notifications/'))return notificationEndpoint(url.pathname,body,env,h);
  return json({error:'Not found'},404,h);
 },
 async scheduled(event,env,ctx){ctx.waitUntil(notificationCycle(env));}
};

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
// Client timestamps are metadata, never the authority for the current time.
function clientTimestamp(value){
 if(typeof value!=='string')return null;
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if(!m)return null;
 const [,y,month,day,hour,minute,second]=m;
 const date=new Date(0);date.setUTCFullYear(+y,+month-1,+day);
 if(date.getUTCFullYear()!==+y||date.getUTCMonth()!==+month-1||date.getUTCDate()!==+day||+hour>23||+minute>59||+second>59)return null;
 const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;
}
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
 const receivedAt=nowISO(),sentAt=clientTimestamp(body.sentAt);
 const clock=`【実時計・今回のリクエスト】現在時刻の基準はサーバー受信時刻: ${jst(receivedAt)}（${receivedAt}、Asia/Tokyo / UTC+09:00）。これは受信時点の実時刻で、返答生成中に更新される時計ではありません。${sentAt?'端末申告の送信時刻（時計ずれの可能性あり、現在時刻の基準にしない）: '+jst(sentAt)+'（'+sentAt+'）。':'端末の送信時刻は未提供または無効です。'}
【保存日時と物語内時刻】履歴の日時は過去の保存・送受信時刻であり、現在時刻やRP場面の時刻ではありません。実時計の経過だけで物語内の時間を進めたり、場面・行動・最新状況を補完したりしないでください。物語内の時刻は共有済みの場面記述を根拠にし、不明なら不明のまま扱ってください。
実際の現在時刻を聞かれた場合は上記のサーバー受信時刻を根拠にJSTで答えてください。通常のRP・DIN COMMSには時刻報告やこの管理情報を付け足さず、自然な文面を保ってください。\n`;
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
async function preparePush(env,sub){
 const publicKey=from64(env.VAPID_PUBLIC_KEY),d=from64(env.VAPID_PRIVATE_KEY);if(publicKey.length!==65||d.length!==32)throw Error('VAPID key invalid');
 const privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:b64url(publicKey.slice(1,33)),y:b64url(publicKey.slice(33)),d:b64url(d),ext:false},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const aud=new URL(sub.endpoint).origin,exp=Math.floor(Date.now()/1000)+3500;
 const part=b64url(te.encode(JSON.stringify({typ:'JWT',alg:'ES256'})))+'.'+b64url(te.encode(JSON.stringify({aud,exp,sub:BASE})));
 const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,te.encode(part));const jwt=part+'.'+b64url(new Uint8Array(sig));
 const payload=await makePushBody(sub,JSON.stringify({title:'VECTOR',body:'メッセージが届いています',url:BASE+'?open=comms'}));
 return {endpoint:sub.endpoint,init:{method:'POST',headers:{'TTL':'3600','Urgency':'normal','Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream','Authorization':'vapid t='+jwt+', k='+env.VAPID_PUBLIC_KEY},body:payload}};
}

export {responseCall,preparePush,getPrivate,safeMatch,headers,json,requestJSON,ALLOWED_ORIGIN,jst,nowISO};

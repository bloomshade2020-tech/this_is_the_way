/* VECTOR v0.7 — synchronized private RP prototype. Never put secrets in this file. */
window.DinAppStart = function DinAppStart(unlocked){
'use strict';
const $=id=>document.getElementById(id);
const initial={comms:[],rp:[],apiMessages:[],backstageMessages:[],apiWorkerUrl:'https://din-comms-api.bloomshade-2020.workers.dev',apiPrompt:'',documents:[],sceneMemory:'',apiDraftText:'',rpDraftText:'',backstageDraftText:'',apiDraftPhoto:null,rpDraftPhoto:null,backstageDraftPhoto:null,rpUrl:'',notificationUrl:'',timeTheme:'auto',inputRate:1,outputRate:5,notificationEnabled:false,notificationScene:'',notificationLastSync:'',stayUnlocked:false,rememberAccessToken:false,savedAccessToken:''};
const data={...initial,...(unlocked&&typeof unlocked==='object'?unlocked:{})};delete data.oauthClientId;
for(const k of ['comms','rp','apiMessages','backstageMessages','documents'])if(!Array.isArray(data[k]))data[k]=[];
for(const k of ['apiDraftText','rpDraftText','backstageDraftText','apiPrompt','sceneMemory'])if(typeof data[k]!=='string')data[k]='';
if(typeof data.rememberAccessToken!=='boolean')data.rememberAccessToken=false;
if(typeof data.stayUnlocked!=='boolean')data.stayUnlocked=false;
if(typeof data.savedAccessToken!=='string')data.savedAccessToken='';
let active='home',busy=false,fetchingInbox=false,token=(data.rememberAccessToken?data.savedAccessToken:''),toastTimer=null,saveTimer=null;const lastSubmit={comms:0,here:0,backstage:0};
// Preserve totals even when an individual transcript is intentionally cleared.
if(!data.usageTotals||typeof data.usageTotals!=='object'){
 data.usageTotals={};for(const [room,k] of Object.entries({comms:'apiMessages',here:'rp',backstage:'backstageMessages'})){
  data.usageTotals[room]=data[k].reduce((a,m)=>{if(m.usage){a.input+=Number(m.usage.input_tokens)||0;a.output+=Number(m.usage.output_tokens)||0;}return a;},{input:0,output:0});
 }
}
for(const room of ['comms','here','backstage','notifications'])if(!data.usageTotals[room])data.usageTotals[room]={input:0,output:0};
const rooms={comms:{items:'apiMessages',draft:'apiDraftText',photo:'apiDraftPhoto',input:'commsDraft',preview:'commsPhotoPreview',scroll:'commsScroll',thread:'commsThread'},here:{items:'rp',draft:'rpDraftText',photo:'rpDraftPhoto',input:'hereDraft',preview:'herePhotoPreview',scroll:'hereScroll',thread:'hereThread'},backstage:{items:'backstageMessages',draft:'backstageDraftText',photo:'backstageDraftPhoto',input:'backstageDraft',preview:'backstagePhotoPreview',scroll:'backstageScroll',thread:'backstageThread'}};
const uid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():('v-'+Date.now()+'-'+Math.random().toString(36).slice(2));
const make=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
const msgTime=iso=>{const d=new Date(iso);return Number.isNaN(d.valueOf())?'--:--':d.toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})+' JST';};
const msgDay=iso=>{const d=new Date(iso);return Number.isNaN(d.valueOf())?'DATE':d.toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'});};
function notice(t){const el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3600);}
function cloneData(){return JSON.parse(JSON.stringify(data));}
const save=async()=>window.DinVault.save(data);
function autosave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(()=>notice('保存できません。端末の空き容量と保管庫を確認してください')),350);}
function nav(where){if(!['home','comms','here','backstage','settings'].includes(where))return;
  active=where;document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='screen-'+where));
  $('screenTitle').textContent=where==='home'?'':where.toUpperCase();$('backHome').hidden=where==='home';$('toBackstage').hidden=where==='home'||where==='backstage'||where==='settings';
  $('appShell').classList.toggle('inside-comms',where==='comms');if(where==='settings')renderSettings();if(where==='here')applyTimeTheme();if(rooms[where])renderRoom(where);if(where==='comms')pullNotificationInbox().catch(()=>{});resizeHereComposer();}
function renderRoom(room){const r=rooms[room],box=$(r.thread);box.replaceChildren();let list=data[r.items];
  if(!list.length){box.append(make('p','empty-note',room==='comms'?'まだ通信履歴はありません。':room==='here'?'まだ記録はありません。':'チャッピーとの相談をここから始められます。'));}
  if(room==='comms'){
    let prev='';for(const m of list){const d=msgDay(m.at);if(d!==prev){box.append(make('div','day-divider',d));prev=d;}const w=make('div','chat-turn'+(m.sender==='me'?' mine':''));w.append(make('div','chat-meta',(m.sender==='me'?'YOU':'DIN')+'  /  '+msgTime(m.at)));w.append(make('div','chat-bubble',m.text||''));addPhoto(w,m.photo,'chat-photo');box.append(w);}
  }else if(room==='here'){
    let prev='';for(const m of list){const d=msgDay(m.at);if(d!==prev){box.append(make('div','day-divider',d));prev=d;}const w=make('article','here-turn'+(m.sender==='me'?' you':' din'));const head=make('div','here-head');head.append(make('span','speaker-dot'));head.append(make('strong','',m.sender==='me'?'YOU':'DIN'));const more=make('button','more-btn','···');more.type='button';more.title='日時と記録IDを確認';more.addEventListener('click',()=>{const info=(m.sender==='me'?'YOU':'DIN')+'\n'+(m.at||'日時不明')+'\n'+(m.id||'IDなし');if(confirm(info+'\n\n記録情報をコピーしますか？'))navigator.clipboard?.writeText(info).then(()=>notice('記録情報をコピーしました')).catch(()=>notice(info));});head.append(more);w.append(head);w.append(make('div','here-body',m.text||''));addPhoto(w,m.photo,'here-photo');box.append(w);}
  }else{
    for(const m of list){const w=make('article','back-turn'+(m.sender==='me'?' mine':''));w.append(make('div','back-head',(m.sender==='me'?'YOU':'CHAPPY')+'  /  '+msgTime(m.at)));w.append(make('div','back-body',m.text||''));addPhoto(w,m.photo,'here-photo');box.append(w);}
  }
  renderPhotoPreview(room);updateUsage();if(room==='here')resizeHereComposer();requestAnimationFrame(()=>$(r.scroll).scrollTop=$(r.scroll).scrollHeight);
}
function addPhoto(parent,photo,cls){if(typeof photo!=='string'||!photo.startsWith('data:image/jpeg;base64,'))return;const i=make('img',cls);i.src=photo;i.alt='添付された写真';i.loading='lazy';parent.append(i);}
function renderPhotoPreview(room){const r=rooms[room],node=$(r.preview),photo=data[r.photo];node.replaceChildren();node.hidden=!photo;if(!photo)return;addPhoto(node,photo,'');const b=make('button','', '写真を外す');b.type='button';b.addEventListener('click',async()=>{data[r.photo]=null;renderPhotoPreview(room);try{await save();}catch{notice('保存に失敗しました');}});node.append(b);}
async function readPhoto(file){if(!file.type.startsWith('image/')||file.size>18000000)throw Error('18MB以内の画像を選んでください');let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw Error('この画像形式は読み込めません');}
  try{let scale=Math.min(1,960/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);let photo='';for(const q of [.77,.62,.49,.36,.25]){photo=canvas.toDataURL('image/jpeg',q);if(photo.length<225000)break;}if(photo.length>225000)throw Error('圧縮後も画像が大きいため送信できません');return photo;}finally{bitmap.close?.();}}
for(const room of Object.keys(rooms)){
  const r=rooms[room];$(r.input).value=data[r.draft]||'';$(r.input).addEventListener('input',()=>{data[r.draft]=$(r.input).value;if(room==='here')resizeHereComposer();autosave();});
  const fileInput=$(room+'Photo');fileInput.addEventListener('change',async()=>{const f=fileInput.files?.[0];fileInput.value='';if(!f)return;try{data[r.photo]=await readPhoto(f);renderPhotoPreview(room);await save();notice('写真を添付しました。送信前は端末内だけに保存されます。');}catch(e){notice('写真を添付できません：'+e.message);}});
  document.querySelector('[data-send="'+room+'"]').addEventListener('click',()=>sendRoom(room));
}
// Grow only the HERE draft; long text scrolls without consuming the reading area.
function resizeHereComposer(){
 const viewport=window.visualViewport, shell=$('appShell');
 const keyboard=active==='here'&&window.innerWidth<=500&&viewport&&viewport.scale===1&&viewport.height<window.innerHeight-100;
 shell.classList.toggle('here-keyboard',Boolean(keyboard));
 if(keyboard)shell.style.setProperty('--here-viewport-height',viewport.height+'px');
 else shell.style.removeProperty('--here-viewport-height');
 const input=$('hereDraft');if(active!=='here'||!input.offsetWidth)return;
 input.style.height='auto';
 const cap=Math.max(56,Math.min(160,(viewport?.height||window.innerHeight)*.25));
 input.style.height=Math.min(cap,Math.max(56,input.scrollHeight))+'px';
}
window.addEventListener('resize',resizeHereComposer);
window.visualViewport?.addEventListener('resize',resizeHereComposer);
function usageFor(room){return data.usageTotals[room]||{input:0,output:0};}
function price(u){return (u.input*(Number(data.inputRate)||0)+u.output*(Number(data.outputRate)||0))/1000000;}
function usageText(u){return `IN ${u.input.toLocaleString()} / OUT ${u.output.toLocaleString()} tokens`};
function updateUsage(){let all={input:0,output:0};for(const room of Object.keys(rooms)){const u=usageFor(room);all.input+=u.input;all.output+=u.output;const node=$(room+'Usage');node.replaceChildren(make('span','',usageText(u)),make('span','',`≈ $${price(u).toFixed(4)}`));}
 const n=usageFor('notifications');all.input+=n.input;all.output+=n.output;$('usageDetails').replaceChildren(make('p','usage-lines',`合計：${usageText(all)} / ≈ $${price(all).toFixed(4)}\nDIN COMMS：${usageText(usageFor('comms'))}\nHERE：${usageText(usageFor('here'))}\nBACKSTAGE：${usageText(usageFor('backstage'))}\n自発通知判定（同期済みの分）：${usageText(n)}`));$('usageDetails').firstChild.style.whiteSpace='pre-wrap';}
function validWorker(u){try{const x=new URL(u);return x.protocol==='https:'&&x.hostname==='din-comms-api.bloomshade-2020.workers.dev'&&(x.pathname==='/'||x.pathname==='/chat')&&!x.search&&!x.hash;}catch{return false;}}
function apiURL(){return data.apiWorkerUrl.replace(/\/$/,'')+(new URL(data.apiWorkerUrl).pathname==='/chat'?'':'/chat');}
function dailyKey(){return 'vector-calls-'+new Date().toLocaleDateString('sv-SE')};function apiCallsToday(){try{return Math.max(0,Number(localStorage.getItem(dailyKey()))||0)}catch{return 0}}
function instructions(room){
 if(room==='backstage')return 'あなたはVECTORのBACKSTAGEでユーザーに協力するチャッピーです。ここはRP本文の外側です。人物になりきらず、設計・相談・資料の確認を日本語で支援してください。DIN COMMS/HEREのディン本人として発言しないでください。';
 const root=(data.apiPrompt||'').trim();const documents=data.documents.map(d=>'【'+d.name+'】\n'+d.content).join('\n\n');const memory=data.sceneMemory?'\n\n【現在地・共有メモ】\n'+data.sceneMemory:'';
 let all=root+(documents?'\n\n'+documents:'')+memory;
 if(!all.trim())throw Error('SETTINGS → 資料管理でプロジェクト指示を登録してください');
 if(all.length>49000)throw Error('資料が長すぎます。APIに送る資料を49,000文字以内に整理してください');
 return '架空のRPとして、指示と資料を優先してください。あなたはディン・ジャリンです。ユーザーが提示していない過去ログを読めるとは主張しないでください。HEREは生活と関係の本編・対面場面で、DIN COMMSはその本編から派生した同一人物による端末文字通信です。どちらも共有済みの出来事・交わした文面・送受信時刻を同じ本人の知識として受け継ぎます。通信を対面の台詞へ変換したり、BACKSTAGE・テストの内容をRPへ採用したりしないでください。端末通信では地の文・口頭台詞・外の時刻報告を含めず、本人が短く入力した文章だけを返す。HEREでは場面から自然に対面RPを継続し、台本や説明文にしない。現在のモード：'+(room==='comms'?'DIN COMMS（携帯文字通信）':'HERE（対面本編）')+'。\n\n'+all;
}
function isConnectionTest(text){return /^(?:外[。．:：\s]*).{0,110}(?:接続テスト|通信機能の接続テスト|API通信テスト)/.test(String(text||''));}
function sharedRPEvents(){
 const entries=[...data.apiMessages.map(m=>({...m,channel:'comms'})),...data.rp.map(m=>({...m,channel:'here'}))];
 return entries.filter(m=>!isConnectionTest(m.text)&&m.source!=='test'&&!(m.sender!=='me'&&/^(?:受信しました|通信確認|OK)[。.!！\s]*$/.test(String(m.text||'')))).sort((a,b)=>new Date(a.at)-new Date(b.at));
}
function sharedRPHistory(){return sharedRPEvents().slice(-24).map(m=>({role:m.sender==='me'?'user':'assistant',content:'['+(m.channel==='comms'?'DIN COMMS / 端末通信':'HERE / 対面本編')+' / '+(m.sender==='me'?'YOU':'DIN')+' / '+'保存日時: '+msgDay(m.at)+' '+msgTime(m.at)+'（'+(m.at||'日時不明')+'）'+'] '+String(m.text||'').slice(0,2200)+(m.photo?' [添付写真あり]':'')}));}
function notificationEvents(){return sharedRPEvents().slice(-14).map(m=>({id:m.id,channel:m.channel,sender:m.sender==='me'?'me':'din',at:m.at||null,text:String(m.text||'').slice(0,850)}));}
function notifyPayload(){return {scene:String(data.notificationScene||'').trim().slice(0,4000),events:notificationEvents()};}
function workerRoot(){return data.apiWorkerUrl.replace(/\/chat\/?$|\/$/,'');}
async function workerPost(path,body){if(!token)throw Error('先にDIN COMMSでアクセストークンを入力してください');const response=await fetch(workerRoot()+path,{method:'POST',cache:'no-store',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body||{})});let result;try{result=await response.json();}catch{throw Error('Cloudflareの返答がJSONではありません');}if(!response.ok)throw Error(result.error||'HTTP '+response.status);return result;}
async function syncNotificationState(){if(!data.notificationEnabled)return;const result=await workerPost('/notifications/update',notifyPayload());data.notificationLastSync=result.updatedAt;await save();updateNotifyStatus();}
function updateNotifyStatus(){const node=$('notificationStatus');if(!node)return;node.textContent=data.notificationEnabled?'通知：有効。直近の状態同期：'+(data.notificationLastSync?msgDay(data.notificationLastSync)+' '+msgTime(data.notificationLastSync):'未同期'):'通知：停止中。ChatGPTのタスクとは別の機能です。';}
async function pullNotificationInbox(){if(!data.notificationEnabled||!token||fetchingInbox)return;fetchingInbox=true;try{
 const result=await workerPost('/notifications/inbox',{});const incoming=Array.isArray(result.entries)?result.entries:[],ids=[];let changed=false;const u=result.usageTotals;if(u){const p=data.usageTotals.notifications;const prev=p.input+p.output;p.input=Math.max(p.input,Number(u.input)||0);p.output=Math.max(p.output,Number(u.output)||0);if(p.input+p.output>prev)changed=true;updateUsage();}
 for(const event of incoming){if(!event||typeof event.id!=='string'||typeof event.text!=='string')continue;ids.push(event.id);if(!data.apiMessages.some(m=>m.id===event.id)){data.apiMessages.push({id:event.id,sender:'din',at:event.at||new Date().toISOString(),text:event.text,source:'scheduled',usage:event.usage||{input_tokens:0,output_tokens:0}});changed=true;}}
 if(changed){data.apiMessages.sort((a,b)=>new Date(a.at)-new Date(b.at));await save();if(active==='comms')renderRoom('comms');}
 if(ids.length)await workerPost('/notifications/ack',{ids});
 }catch(e){$('notificationStatus').textContent='通知の受信確認ができません：'+e.message;}finally{fetchingInbox=false;}}
const toBytes64url=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function enablePushNotifications(){
 if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw Error('この端末ではWeb Pushを使用できません');
 if(!(window.navigator.standalone||window.matchMedia('(display-mode: standalone)').matches))throw Error('iPhoneのホーム画面に追加したVECTORから設定してください');
 if(!data.notificationScene.trim())throw Error('通知用の現在地・共有状況を保存してください');
 if(!token)throw Error('先にDIN COMMSでアクセストークンを入力してください');
 const config=await workerPost('/notifications/config',{});if(!config.configured)throw Error('Cloudflare側のVAPID設定が未完了です');
 let permission=Notification.permission;if(permission==='default')permission=await Notification.requestPermission();if(permission!=='granted')throw Error('iPhoneの通知が許可されていません');
 const registration=await navigator.serviceWorker.ready;
 let sub=await registration.pushManager.getSubscription();if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toBytes64url(config.vapidPublicKey)});
 await workerPost('/notifications/subscribe',{subscription:sub.toJSON()});
 try{const result=await workerPost('/notifications/enable',notifyPayload());data.notificationEnabled=true;data.notificationLastSync=result.updatedAt;await save();updateNotifyStatus();}catch(e){try{await sub.unsubscribe();}catch{}throw e;}
}
async function disablePushNotifications(){await workerPost('/notifications/disable',{});const reg=await navigator.serviceWorker?.ready;const sub=await reg?.pushManager?.getSubscription();if(sub)await sub.unsubscribe();data.notificationEnabled=false;data.notificationLastSync='';await save();updateNotifyStatus();}

async function sendRoom(room){if(busy||Date.now()-lastSubmit[room]<1400)return;lastSubmit[room]=Date.now();const submittedAt=new Date().toISOString();const r=rooms[room],text=$(r.input).value.trim(),photo=data[r.photo],state=$(room+'State');if(!text&&!photo){notice('文章か写真を入力してください');return;}if(!validWorker(data.apiWorkerUrl)){state.textContent='SETTINGSでCloudflare Worker URLを確認してください';return;}if(apiCallsToday()>=20){state.textContent='今日は20回の端末側テスト上限です（請求の強制上限ではありません）';return;}let inst;try{inst=instructions(room);}catch(err){state.textContent=err.message;return;}
 if(!token){const value=prompt('Cloudflare WorkerのDIN_ACCESS_TOKENを入力（OpenAI APIキーではありません）');if(value===null)return;if(value.length<24){state.textContent='トークンが短すぎます';return;}token=value;
 if(data.rememberAccessToken){data.savedAccessToken=token;try{await save();}catch{data.savedAccessToken='';state.textContent='トークンを保管庫に保存できませんでした。送信を中止します。';return;}}
 }
 busy=true;document.querySelectorAll('[data-send]').forEach(b=>b.disabled=true);state.textContent='返信を取得しています…';
 try{
 const history=room==='backstage'?data.backstageMessages.slice(-12).map(m=>({role:m.sender==='me'?'user':'assistant',content:String(m.text||'').slice(0,2600)})):sharedRPHistory();
 try{localStorage.setItem(dailyKey(),String(apiCallsToday()+1));}catch{}
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),90000);let response;try{response=await fetch(apiURL(),{method:'POST',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({message:text||'この添付写真を見てください。',image:photo||null,instructions:inst,history,channel:room,sentAt:submittedAt})});}finally{clearTimeout(timeout)}
 let result;try{result=await response.json()}catch{throw Error('APIからJSONを取得できませんでした')};if(!response.ok){if(response.status===401){token='';if(data.savedAccessToken){data.savedAccessToken='';await save().catch(()=>{});}}throw Error(result.error||'HTTP '+response.status)}
 if(typeof result.reply!=='string'||!result.reply.trim())throw Error('返答が空でした');
 const before=cloneData();const arr=data[r.items],sender={id:'v-'+uid(),sender:'me',at:submittedAt,text:text||'［写真］',photo:photo||null};const reply={id:'v-'+uid(),sender:room==='backstage'?'chappy':'din',at:result.repliedAt||new Date().toISOString(),text:result.reply,usage:result.usage||{input_tokens:0,output_tokens:0}};
 arr.push(sender,reply);data.usageTotals[room].input+=Number(reply.usage.input_tokens)||0;data.usageTotals[room].output+=Number(reply.usage.output_tokens)||0;data[r.draft]='';data[r.photo]=null;
 try{await save();}catch{Object.keys(data).forEach(k=>delete data[k]);Object.assign(data,before);state.textContent='返答は届きましたが保存に失敗しました。再送すると再課金される可能性があります。';return;}
 $(r.input).value='';renderRoom(room);state.textContent='';if(room!=='backstage'&&data.notificationEnabled)syncNotificationState().catch(e=>{state.textContent='返信と履歴は保存済み。通知状態の同期は失敗：'+e.message;});
 }catch(err){state.textContent='送信できませんでした：'+(err.name==='AbortError'?'90秒でタイムアウト':err.message)+'。下書きは残っています。';}finally{busy=false;document.querySelectorAll('[data-send]').forEach(b=>b.disabled=false)}
}
function renderSettings(){ $('workerUrl').value=data.apiWorkerUrl||'';$('projectInstructions').value=data.apiPrompt||'';$('sceneMemory').value=data.sceneMemory||'';$('rpUrl').value=data.rpUrl||'';$('notificationUrl').value=data.notificationUrl||'';$('hereTimeTheme').value=data.timeTheme||'auto';$('stayUnlocked').checked=Boolean(data.stayUnlocked);$('rememberToken').checked=Boolean(data.rememberAccessToken);$('tokenStatus').textContent=data.rememberAccessToken?(data.savedAccessToken?'トークンは暗号化して保存されています。':'次のAPI送信時に入力すると、暗号化して保存します。'):'次回の起動時には再入力が必要です。';$('sessionStatus').textContent=data.stayUnlocked?'この端末で再起動後も解除を維持する設定です。':'起動するたびにパスフレーズを入力します。';$('inputRate').value=data.inputRate??1;$('outputRate').value=data.outputRate??5;renderDocList();updateUsage();$('notificationScene').value=data.notificationScene||(data.sceneMemory||'').slice(0,4000);updateNotifyStatus();$('historyCounts').textContent=`DIN COMMS: ${data.apiMessages.length}件 / HERE: ${data.rp.length}件 / BACKSTAGE: ${data.backstageMessages.length}件 / 旧通信: ${data.comms.length}件`;}
function renderDocList(){const n=$('docList');n.replaceChildren();for(const d of data.documents){const row=make('div','document-row');row.append(make('span','',`${d.name}（${d.content.length.toLocaleString()}文字）`));const del=make('button','','削除');del.type='button';del.addEventListener('click',async()=>{if(!confirm(`${d.name} を削除しますか？`))return;data.documents=data.documents.filter(x=>x.id!==d.id);try{await save();renderDocList();}catch{notice('保存に失敗しました')}});row.append(del);n.append(row);}}
$('newDocument').addEventListener('change',async e=>{const fs=[...e.target.files||[]];e.target.value='';let loaded=0;for(const f of fs){if(!/\.(txt|md)$/i.test(f.name)||f.size>100000){notice('追加できるのは100KB以内の .md / .txt です');continue;}let content=await f.text();if(!content.trim())continue;data.documents.push({id:uid(),name:f.name.slice(0,120),content});loaded++;}if(loaded){try{await save();renderDocList();notice(`${loaded}件の資料を暗号化して保存しました`);}catch{notice('資料の保存に失敗しました')}}});
$('saveNotificationScene').addEventListener('click',async()=>{const old=data.notificationScene;data.notificationScene=$('notificationScene').value.trim();try{await save();if(data.notificationEnabled)await syncNotificationState();notice('通知用の現在地を保存しました');}catch(e){data.notificationScene=old;notice('保存または同期に失敗：'+e.message);}});
$('enableNotify').addEventListener('click',async()=>{const b=$('enableNotify');b.disabled=true;try{await enablePushNotifications();notice('VECTORの自発通知を有効にしました。送信は保証されず、条件判定で判断します。');}catch(e){notice('有効化できません：'+e.message);}finally{b.disabled=false;}});
$('testNotify').addEventListener('click',async()=>{try{const result=await workerPost('/notifications/test',{});notice(result.acceptedByPushService?'配信事業者が受け付けました。iPhoneに表示されるか確認してください。':'通知のテストを受け付けました');}catch(e){notice('通知テスト失敗：'+e.message);}});
$('disableNotify').addEventListener('click',async()=>{if(!confirm('VECTORの自発通知を停止し、Cloudflare側の通知用状態・購読・未受信通知を削除しますか？'))return;try{await disablePushNotifications();notice('自発通知を停止しました');}catch(e){notice('停止に失敗：'+e.message);}});
$('saveDocuments').addEventListener('click',async()=>{const p=$('projectInstructions').value,m=$('sceneMemory').value;if(p.length>50000||m.length>12000){notice('文字数を確認してください');return;}data.apiPrompt=p;data.sceneMemory=m;try{await save();notice('資料を保存しました');}catch{notice('保存に失敗しました')}});
$('saveWorker').addEventListener('click',async()=>{const u=$('workerUrl').value.trim();if(!validWorker(u)){notice('指定されたWorkerのURLを入力してください');return;}if(u!==data.apiWorkerUrl){token='';data.savedAccessToken='';}data.apiWorkerUrl=u;try{await save();renderSettings();notice('接続先を保存しました')}catch{notice('保存に失敗しました')}});
$('clearToken').addEventListener('click',async()=>{const old=data.savedAccessToken;token='';data.savedAccessToken='';try{await save();renderSettings();notice('トークンを削除しました。次の送信時に再入力してください');}catch{data.savedAccessToken=old;notice('保管庫からトークンを削除できませんでした')}});
$('rememberToken').addEventListener('change',async()=>{const wanted=$('rememberToken').checked,old=data.rememberAccessToken,oldSaved=data.savedAccessToken;data.rememberAccessToken=wanted;data.savedAccessToken=wanted?token:'';try{await save();renderSettings();notice(wanted?'トークンの記憶をONにしました':'トークンの記憶をOFFにしました');}catch{data.rememberAccessToken=old;data.savedAccessToken=oldSaved;$('rememberToken').checked=old;notice('設定を保存できませんでした')}});
$('stayUnlocked').addEventListener('change',async()=>{const el=$('stayUnlocked'),wanted=el.checked,old=data.stayUnlocked;el.disabled=true;try{await window.DinVault.rememberUnlock(wanted);data.stayUnlocked=wanted;await save();renderSettings();notice(wanted?'次回起動時もロック解除を保持します':'次回起動時にパスフレーズを要求します');}catch(err){data.stayUnlocked=old;try{await window.DinVault.rememberUnlock(old);await save();}catch{}el.checked=old;notice('設定できませんでした：'+(err?.message||'端末の保存機能を確認してください'));}finally{el.disabled=false;}});
$('toggleLegacy').addEventListener('click',()=>{const box=$('legacyArchive');box.hidden=!box.hidden;if(box.hidden)return;box.replaceChildren();if(!data.comms.length){box.append(make('p','footnote','旧通信アーカイブはありません'));return;}for(const m of data.comms.slice(-100)){const line=make('div','legacy-line');line.append(make('strong','',String(m.sender||'DIN').toUpperCase()+' · '+msgTime(m.at)));line.append(make('div','',String(m.text||m.body||'').slice(0,6000)));box.append(line);}if(data.comms.length>100)box.append(make('p','footnote','最新100件を表示しています。全件は暗号化バックアップに含まれます。'));});
$('saveRates').addEventListener('click',async()=>{for(const id of ['inputRate','outputRate']){const n=Number($(id).value);if(!Number.isFinite(n)||n<0||n>500){notice('仮単価の値を確認してください');return;}data[id]=n;}try{await save();updateUsage();notice('仮単価を保存しました')}catch{notice('保存に失敗しました')}});
$('saveTheme').addEventListener('click',async()=>{data.timeTheme=$('hereTimeTheme').value;try{await save();applyTimeTheme();notice('時間帯を保存しました')}catch{notice('保存に失敗しました')}});
function applyTimeTheme(){const hour=new Date().getHours();const name=data.timeTheme==='auto'?(hour<6||hour>=21?'night':hour<10?'morning':hour<17?'day':'evening'):data.timeTheme;$('screen-here').dataset.time=name;}
function validChatURL(value){if(!value)return true;try{const u=new URL(value);return u.protocol==='https:'&&['chatgpt.com','chat.openai.com'].includes(u.hostname);}catch{return false;}}
$('saveLinks').addEventListener('click',async()=>{const rp=$('rpUrl').value.trim(),nt=$('notificationUrl').value.trim();if(!validChatURL(rp)||!validChatURL(nt)){notice('ChatGPTのHTTPSリンクだけ登録できます');return;}data.rpUrl=rp;data.notificationUrl=nt;try{await save();notice('リンクを保存しました')}catch{notice('保存に失敗しました')}});
function openLink(kind){const link=data[kind];if(link&&validChatURL(link))window.open(link,'_blank','noopener,noreferrer');else notice('先にChatGPTのURLを登録してください');}
$('openRp').addEventListener('click',()=>openLink('rpUrl'));$('openNotif').addEventListener('click',()=>openLink('notificationUrl'));
$('exportBackup').addEventListener('click',async()=>{try{await window.DinVault.flush();const blob=new Blob([JSON.stringify(window.DinVault.encryptedBackup(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='vector-encrypted-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),6000);notice('暗号化バックアップを保存しました');}catch{notice('バックアップに失敗しました')}});
$('lockNow').addEventListener('click',()=>window.DinVault.lock());
document.querySelectorAll('[data-clear]').forEach(b=>b.addEventListener('click',async()=>{const room=b.dataset.clear;const r=rooms[room];if(!confirm(room.toUpperCase()+'の履歴を消去しますか？\n復元には事前のバックアップが必要です。'))return;const prior=data[r.items];data[r.items]=[];try{await save();renderRoom(room);renderSettings();notice('履歴を消去しました')}catch{data[r.items]=prior;notice('消去できませんでした')}}));
document.querySelectorAll('.open-panel').forEach(r=>{r.addEventListener('click',()=>{const p=$('panel-'+r.dataset.panel);p.hidden=!p.hidden;});});
document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.nav)));$('backHome').addEventListener('click',()=>nav('home'));$('toBackstage').addEventListener('click',()=>nav('backstage'));
$('hereExpand').addEventListener('click',()=>{$('editorText').value=$('hereDraft').value;$('fullEditor').hidden=false;$('editorText').focus()});function closeEditor(){const value=$('editorText').value;$('hereDraft').value=value;data.rpDraftText=value;$('fullEditor').hidden=true;resizeHereComposer();$('hereDraft').focus();autosave();}$('editorClose').addEventListener('click',closeEditor);$('editorDone').addEventListener('click',closeEditor);
renderSettings();renderRoom('comms');renderRoom('here');renderRoom('backstage');nav('home');document.addEventListener('visibilitychange',()=>{if(!document.hidden)pullNotificationInbox().catch(()=>{});});navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='VECTOR_INBOX')pullNotificationInbox().catch(()=>{});});if(new URLSearchParams(location.search).get('open')==='comms')nav('comms');pullNotificationInbox().catch(()=>{});
if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
};

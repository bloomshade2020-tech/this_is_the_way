/* VECTOR v0.6 — UI + private API prototype. Never put secrets in this file. */
window.DinAppStart = function DinAppStart(unlocked){
'use strict';
const $=id=>document.getElementById(id);
const initial={comms:[],rp:[],apiMessages:[],backstageMessages:[],apiWorkerUrl:'https://din-comms-api.bloomshade-2020.workers.dev',apiPrompt:'',documents:[],sceneMemory:'',apiDraftText:'',rpDraftText:'',backstageDraftText:'',apiDraftPhoto:null,rpDraftPhoto:null,backstageDraftPhoto:null,rpUrl:'',notificationUrl:'',timeTheme:'auto',inputRate:1,outputRate:5};
const data={...initial,...(unlocked&&typeof unlocked==='object'?unlocked:{})};delete data.oauthClientId;
for(const k of ['comms','rp','apiMessages','backstageMessages','documents'])if(!Array.isArray(data[k]))data[k]=[];
for(const k of ['apiDraftText','rpDraftText','backstageDraftText','apiPrompt','sceneMemory'])if(typeof data[k]!=='string')data[k]='';
let active='home',busy=false,token='',toastTimer=null,saveTimer=null;const lastSubmit={comms:0,here:0,backstage:0};
// Preserve totals even when an individual transcript is intentionally cleared.
if(!data.usageTotals||typeof data.usageTotals!=='object'){
 data.usageTotals={};for(const [room,k] of Object.entries({comms:'apiMessages',here:'rp',backstage:'backstageMessages'})){
  data.usageTotals[room]=data[k].reduce((a,m)=>{if(m.usage){a.input+=Number(m.usage.input_tokens)||0;a.output+=Number(m.usage.output_tokens)||0;}return a;},{input:0,output:0});
 }
}
for(const room of ['comms','here','backstage'])if(!data.usageTotals[room])data.usageTotals[room]={input:0,output:0};
const rooms={comms:{items:'apiMessages',draft:'apiDraftText',photo:'apiDraftPhoto',input:'commsDraft',preview:'commsPhotoPreview',scroll:'commsScroll',thread:'commsThread'},here:{items:'rp',draft:'rpDraftText',photo:'rpDraftPhoto',input:'hereDraft',preview:'herePhotoPreview',scroll:'hereScroll',thread:'hereThread'},backstage:{items:'backstageMessages',draft:'backstageDraftText',photo:'backstageDraftPhoto',input:'backstageDraft',preview:'backstagePhotoPreview',scroll:'backstageScroll',thread:'backstageThread'}};
const uid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():('v-'+Date.now()+'-'+Math.random().toString(36).slice(2));
const make=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
const msgTime=iso=>{const d=new Date(iso);return Number.isNaN(d.valueOf())?'--:--':d.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});};
const msgDay=iso=>{const d=new Date(iso);return Number.isNaN(d.valueOf())?'DATE':d.toLocaleDateString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'});};
function notice(t){const el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3600);}
function cloneData(){return JSON.parse(JSON.stringify(data));}
const save=async()=>window.DinVault.save(data);
function autosave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(()=>notice('保存できません。端末の空き容量と保管庫を確認してください')),350);}
function nav(where){if(!['home','comms','here','backstage','settings'].includes(where))return;
  active=where;document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='screen-'+where));
  $('screenTitle').textContent=where==='home'?'':where.toUpperCase();$('backHome').hidden=where==='home';$('toBackstage').hidden=where==='home'||where==='backstage'||where==='settings';
  $('appShell').classList.toggle('inside-comms',where==='comms');if(where==='settings')renderSettings();if(where==='here')applyTimeTheme();if(rooms[where])renderRoom(where);}
function renderRoom(room){const r=rooms[room],box=$(r.thread);box.replaceChildren();let list=data[r.items];
  if(!list.length){box.append(make('p','empty-note',room==='comms'?'まだ通信履歴はありません。':room==='here'?'まだ記録はありません。':'チャッピーとの相談をここから始められます。'));}
  if(room==='comms'){
    let prev='';for(const m of list){const d=msgDay(m.at);if(d!==prev){box.append(make('div','day-divider',d));prev=d;}const w=make('div','chat-turn'+(m.sender==='me'?' mine':''));w.append(make('div','chat-meta',(m.sender==='me'?'YOU':'DIN')+'  /  '+msgTime(m.at)));w.append(make('div','chat-bubble',m.text||''));addPhoto(w,m.photo,'chat-photo');box.append(w);}
  }else if(room==='here'){
    let prev='';for(const m of list){const d=msgDay(m.at);if(d!==prev){box.append(make('div','day-divider',d));prev=d;}const w=make('article','here-turn'+(m.sender==='me'?' you':' din'));const head=make('div','here-head');head.append(make('span','speaker-dot'));head.append(make('strong','',m.sender==='me'?'YOU':'DIN'));const more=make('button','more-btn','···');more.type='button';more.title='日時と記録IDを確認';more.addEventListener('click',()=>{const info=(m.sender==='me'?'YOU':'DIN')+'\n'+(m.at||'日時不明')+'\n'+(m.id||'IDなし');if(confirm(info+'\n\n記録情報をコピーしますか？'))navigator.clipboard?.writeText(info).then(()=>notice('記録情報をコピーしました')).catch(()=>notice(info));});head.append(more);w.append(head);w.append(make('div','here-body',m.text||''));addPhoto(w,m.photo,'here-photo');box.append(w);}
  }else{
    for(const m of list){const w=make('article','back-turn'+(m.sender==='me'?' mine':''));w.append(make('div','back-head',(m.sender==='me'?'YOU':'CHAPPY')+'  /  '+msgTime(m.at)));w.append(make('div','back-body',m.text||''));addPhoto(w,m.photo,'here-photo');box.append(w);}
  }
  renderPhotoPreview(room);updateUsage();requestAnimationFrame(()=>$(r.scroll).scrollTop=$(r.scroll).scrollHeight);
}
function addPhoto(parent,photo,cls){if(typeof photo!=='string'||!photo.startsWith('data:image/jpeg;base64,'))return;const i=make('img',cls);i.src=photo;i.alt='添付された写真';i.loading='lazy';parent.append(i);}
function renderPhotoPreview(room){const r=rooms[room],node=$(r.preview),photo=data[r.photo];node.replaceChildren();node.hidden=!photo;if(!photo)return;addPhoto(node,photo,'');const b=make('button','', '写真を外す');b.type='button';b.addEventListener('click',async()=>{data[r.photo]=null;renderPhotoPreview(room);try{await save();}catch{notice('保存に失敗しました');}});node.append(b);}
async function readPhoto(file){if(!file.type.startsWith('image/')||file.size>18000000)throw Error('18MB以内の画像を選んでください');let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw Error('この画像形式は読み込めません');}
  try{let scale=Math.min(1,960/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);let photo='';for(const q of [.77,.62,.49,.36,.25]){photo=canvas.toDataURL('image/jpeg',q);if(photo.length<225000)break;}if(photo.length>225000)throw Error('圧縮後も画像が大きいため送信できません');return photo;}finally{bitmap.close?.();}}
for(const room of Object.keys(rooms)){
  const r=rooms[room];$(r.input).value=data[r.draft]||'';$(r.input).addEventListener('input',()=>{data[r.draft]=$(r.input).value;autosave();});
  const fileInput=$(room+'Photo');fileInput.addEventListener('change',async()=>{const f=fileInput.files?.[0];fileInput.value='';if(!f)return;try{data[r.photo]=await readPhoto(f);renderPhotoPreview(room);await save();notice('写真を添付しました。送信前は端末内だけに保存されます。');}catch(e){notice('写真を添付できません：'+e.message);}});
  document.querySelector('[data-send="'+room+'"]').addEventListener('click',()=>sendRoom(room));
}
function usageFor(room){return data.usageTotals[room]||{input:0,output:0};}
function price(u){return (u.input*(Number(data.inputRate)||0)+u.output*(Number(data.outputRate)||0))/1000000;}
function usageText(u){return `IN ${u.input.toLocaleString()} / OUT ${u.output.toLocaleString()} tokens`};
function updateUsage(){let all={input:0,output:0};for(const room of Object.keys(rooms)){const u=usageFor(room);all.input+=u.input;all.output+=u.output;const node=$(room+'Usage');node.replaceChildren(make('span','',usageText(u)),make('span','',`≈ $${price(u).toFixed(4)}`));}
 $('usageDetails').replaceChildren(make('p','usage-lines',`合計：${usageText(all)} / ≈ $${price(all).toFixed(4)}\nDIN COMMS：${usageText(usageFor('comms'))}\nHERE：${usageText(usageFor('here'))}\nBACKSTAGE：${usageText(usageFor('backstage'))}`));$('usageDetails').firstChild.style.whiteSpace='pre-wrap';}
function validWorker(u){try{const x=new URL(u);return x.protocol==='https:'&&x.hostname==='din-comms-api.bloomshade-2020.workers.dev'&&(x.pathname==='/'||x.pathname==='/chat')&&!x.search&&!x.hash;}catch{return false;}}
function apiURL(){return data.apiWorkerUrl.replace(/\/$/,'')+(new URL(data.apiWorkerUrl).pathname==='/chat'?'':'/chat');}
function dailyKey(){return 'vector-calls-'+new Date().toLocaleDateString('sv-SE')};function apiCallsToday(){try{return Math.max(0,Number(localStorage.getItem(dailyKey()))||0)}catch{return 0}}
function instructions(room){
 if(room==='backstage')return 'あなたはVECTORのBACKSTAGEでユーザーに協力するチャッピーです。ここはRP本文の外側です。人物になりきらず、設計・相談・資料の確認を日本語で支援してください。DIN COMMS/HEREのディン本人として発言しないでください。';
 const root=(data.apiPrompt||'').trim();const documents=data.documents.map(d=>'【'+d.name+'】\n'+d.content).join('\n\n');const memory=data.sceneMemory?'\n\n【現在地・共有メモ】\n'+data.sceneMemory:'';
 let all=root+(documents?'\n\n'+documents:'')+memory;
 if(!all.trim())throw Error('SETTINGS → 資料管理でプロジェクト指示を登録してください');
 if(all.length>49000)throw Error('資料が長すぎます。APIに送る資料を49,000文字以内に整理してください');
 return '架空のRPとして、指示と資料を優先してください。あなたはディン・ジャリンです。ユーザーが提示していない過去ログを読めるとは主張しないでください。DIN COMMSは物理的に離れた間の端末通信、HEREは同じ場にいる対面での会話です。HEREでは地の文とセリフを含めて自然に応答し、台本や説明文にしないでください。現在のモード：'+(room==='comms'?'DIN COMMS（通信）':'HERE（対面）')+'。\n\n'+all;
}
function sharedRPHistory(){const entries=[...data.apiMessages.map(m=>({...m,channel:'DIN COMMS'})),...data.rp.map(m=>({...m,channel:'HERE'}))];return entries.sort((a,b)=>new Date(a.at)-new Date(b.at)).slice(-16).map(m=>({role:m.sender==='me'?'user':'assistant',content:'['+m.channel+'] '+String(m.text||'').slice(0,2600)+(m.photo?' [添付写真あり]':'')}));}
async function sendRoom(room){if(busy||Date.now()-lastSubmit[room]<1400)return;lastSubmit[room]=Date.now();const r=rooms[room],text=$(r.input).value.trim(),photo=data[r.photo],state=$(room+'State');if(!text&&!photo){notice('文章か写真を入力してください');return;}if(!validWorker(data.apiWorkerUrl)){state.textContent='SETTINGSでCloudflare Worker URLを確認してください';return;}if(apiCallsToday()>=20){state.textContent='今日は20回の端末側テスト上限です（請求の強制上限ではありません）';return;}let inst;try{inst=instructions(room);}catch(err){state.textContent=err.message;return;}
 if(!token){const value=prompt('Cloudflare WorkerのDIN_ACCESS_TOKENを入力（OpenAI APIキーではありません）');if(value===null)return;if(value.length<24){state.textContent='トークンが短すぎます';return;}token=value;}
 busy=true;document.querySelectorAll('[data-send]').forEach(b=>b.disabled=true);state.textContent='返信を取得しています…';
 try{
 const history=room==='backstage'?data.backstageMessages.slice(-12).map(m=>({role:m.sender==='me'?'user':'assistant',content:String(m.text||'').slice(0,2600)})):sharedRPHistory();
 try{localStorage.setItem(dailyKey(),String(apiCallsToday()+1));}catch{}
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),90000);let response;try{response=await fetch(apiURL(),{method:'POST',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({message:text||'この添付写真を見てください。',image:photo||null,instructions:inst,history,channel:room})});}finally{clearTimeout(timeout)}
 let result;try{result=await response.json()}catch{throw Error('APIからJSONを取得できませんでした')};if(!response.ok){if(response.status===401)token='';throw Error(result.error||'HTTP '+response.status)}
 if(typeof result.reply!=='string'||!result.reply.trim())throw Error('返答が空でした');
 const before=cloneData();const now=new Date().toISOString(),arr=data[r.items],sender={id:'v-'+uid(),sender:'me',at:now,text:text||'［写真］',photo:photo||null};const reply={id:'v-'+uid(),sender:room==='backstage'?'chappy':'din',at:new Date().toISOString(),text:result.reply,usage:result.usage||{input_tokens:0,output_tokens:0}};
 arr.push(sender,reply);data.usageTotals[room].input+=Number(reply.usage.input_tokens)||0;data.usageTotals[room].output+=Number(reply.usage.output_tokens)||0;data[r.draft]='';data[r.photo]=null;
 try{await save();}catch{Object.keys(data).forEach(k=>delete data[k]);Object.assign(data,before);state.textContent='返答は届きましたが保存に失敗しました。再送すると再課金される可能性があります。';return;}
 $(r.input).value='';renderRoom(room);state.textContent='';
 }catch(err){state.textContent='送信できませんでした：'+(err.name==='AbortError'?'90秒でタイムアウト':err.message)+'。下書きは残っています。';}finally{busy=false;document.querySelectorAll('[data-send]').forEach(b=>b.disabled=false)}
}
function renderSettings(){ $('workerUrl').value=data.apiWorkerUrl||'';$('projectInstructions').value=data.apiPrompt||'';$('sceneMemory').value=data.sceneMemory||'';$('rpUrl').value=data.rpUrl||'';$('notificationUrl').value=data.notificationUrl||'';$('hereTimeTheme').value=data.timeTheme||'auto';$('inputRate').value=data.inputRate??1;$('outputRate').value=data.outputRate??5;renderDocList();updateUsage();$('historyCounts').textContent=`DIN COMMS: ${data.apiMessages.length}件 / HERE: ${data.rp.length}件 / BACKSTAGE: ${data.backstageMessages.length}件 / 旧通信: ${data.comms.length}件`;}
function renderDocList(){const n=$('docList');n.replaceChildren();for(const d of data.documents){const row=make('div','document-row');row.append(make('span','',`${d.name}（${d.content.length.toLocaleString()}文字）`));const del=make('button','','削除');del.type='button';del.addEventListener('click',async()=>{if(!confirm(`${d.name} を削除しますか？`))return;data.documents=data.documents.filter(x=>x.id!==d.id);try{await save();renderDocList();}catch{notice('保存に失敗しました')}});row.append(del);n.append(row);}}
$('newDocument').addEventListener('change',async e=>{const fs=[...e.target.files||[]];e.target.value='';let loaded=0;for(const f of fs){if(!/\.(txt|md)$/i.test(f.name)||f.size>100000){notice('追加できるのは100KB以内の .md / .txt です');continue;}let content=await f.text();if(!content.trim())continue;data.documents.push({id:uid(),name:f.name.slice(0,120),content});loaded++;}if(loaded){try{await save();renderDocList();notice(`${loaded}件の資料を暗号化して保存しました`);}catch{notice('資料の保存に失敗しました')}}});
$('saveDocuments').addEventListener('click',async()=>{const p=$('projectInstructions').value,m=$('sceneMemory').value;if(p.length>50000||m.length>12000){notice('文字数を確認してください');return;}data.apiPrompt=p;data.sceneMemory=m;try{await save();notice('資料を保存しました');}catch{notice('保存に失敗しました')}});
$('saveWorker').addEventListener('click',async()=>{const u=$('workerUrl').value.trim();if(!validWorker(u)){notice('指定されたWorkerのURLを入力してください');return;}if(u!==data.apiWorkerUrl)token='';data.apiWorkerUrl=u;try{await save();notice('接続先を保存しました')}catch{notice('保存に失敗しました')}});
$('clearToken').addEventListener('click',()=>{token='';notice('次のAPI送信時にトークンを再入力します')});
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
$('hereExpand').addEventListener('click',()=>{$('editorText').value=$('hereDraft').value;$('fullEditor').hidden=false;$('editorText').focus()});function closeEditor(){const value=$('editorText').value;$('hereDraft').value=value;data.rpDraftText=value;$('fullEditor').hidden=true;autosave();}$('editorClose').addEventListener('click',closeEditor);$('editorDone').addEventListener('click',closeEditor);
renderSettings();renderRoom('comms');renderRoom('here');renderRoom('backstage');nav('home');
if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
};

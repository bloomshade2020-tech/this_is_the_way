  window.DinAppStart = function dinAppStart(vaultData) {
    (() => {
    'use strict';
    const STORAGE_KEY = 'din-terminal-v01';
    const initial = {comms:[], rp:[], note:'', rpUrl:'', notificationUrl:'', commsDraftText:'', pendingReply:null, apiMessages:[], apiDraftText:'', apiWorkerUrl:'', apiPrompt:''};
    let data = {...initial, ...(vaultData && typeof vaultData==='object' ? vaultData : {})};
    delete data.oauthClientId;
    if (!Array.isArray(data.comms)) data.comms=[];
    if (!Array.isArray(data.rp)) data.rp=[];
    if (!Array.isArray(data.apiMessages)) data.apiMessages=[];
    if (typeof data.commsDraftText !== 'string') data.commsDraftText='';
    if (!data.pendingReply || typeof data.pendingReply.text !== 'string') data.pendingReply=null;
    const el = id => document.getElementById(id);
    const $ = (selector, root=document) => root.querySelector(selector);
    const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
    const persist = () => { window.DinVault.save(data).catch(()=>toast('暗号化保存に失敗しました。保管庫を確認してください。')); return true; };
    const formatTime = t => { const d=new Date(t); return isNaN(d.getTime())?'--:--':d.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}); };
    const escapeText = (s) => String(s ?? '');
    let current = 'lock';
    const dockItems=[['home','ホーム','<path d="M3 10l9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>'],['comms','通信','<path d="M20 11a8 8 0 0 1-8 8 8.8 8.8 0 0 1-4-.9L3 21l2-4.5A8 8 0 1 1 20 11Z"/>'],['rp','RP','<path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h4"/>'],['out','外','<path d="M4 4h16v12H7l-3 4V4Z"/>']];
    $$('.dock').forEach(dock=>{dock.innerHTML=dockItems.map(([page,title,path])=>`<button type="button" data-go="${page}" aria-label="${title}" data-page="${page}"><svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>${title}</button>`).join('');});
    const go = page => {if(!el('screen-'+page))return;current=page; $$('.screen').forEach(s=>s.classList.toggle('active',s.id==='screen-'+page));$$('.dock button').forEach(b=>b.classList.toggle('active',b.dataset.page===(page==='api'?'comms':page)));if(page==='comms')renderComms();if(page==='rp')renderRp();if(page==='api')renderApiThread();if(page==='settings')renderSettings();if(page==='out')el('outNote').value=data.note||'';if(page==='lock')updatePreview();};
    document.addEventListener('click',e=>{const target=e.target.closest('[data-go]'); if(target)go(target.dataset.go);});
    el('homeLock').addEventListener('click',()=>go('lock'));
    el('unlockBtn').addEventListener('click',()=>go('home'));
    let startY=0;el('screen-lock').addEventListener('touchstart',e=>{startY=e.changedTouches[0].clientY;},{passive:true});el('screen-lock').addEventListener('touchend',e=>{if(startY-e.changedTouches[0].clientY>45)go('home');},{passive:true});
    const updateClock=()=>{let d=new Date();let time=d.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});el('statusTime').textContent=time;el('lockClock').textContent=time;el('lockDate').textContent=d.toLocaleDateString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).replaceAll('/','.').toUpperCase();};updateClock();setInterval(updateClock,30000);
    let toastId=0;
    function toast(msg){let n=el('toast');n.textContent=msg;n.classList.add('show');const id=++toastId;setTimeout(()=>{if(toastId===id)n.classList.remove('show');},3100);}
    function updatePreview(){let latest=data.comms.at(-1);el('lockPreview').textContent=latest ? ((latest.sender==='din'?'DIN':'YOU')+' / '+escapeText(latest.text).slice(0,85)) : 'まだ通信履歴はありません。\n過去の通信をアーカイブできます。API版との会話は「API試験」を開いてください。';}
    function addText(parent,cls,text,tag='div'){let node=document.createElement(tag);node.className=cls;node.textContent=escapeText(text);parent.append(node);return node;}
    function renderComms(){
      const t=el('thread');t.replaceChildren();let previousDay='';
      function addMessage(item,demo=false){
        const wrap=document.createElement('div');wrap.className='bubble-wrap'+(item.sender==='me'?' mine':'')+(demo?' demo':'');
        addText(wrap,'bubble-meta',demo?(item.sender==='me'?'YOU · SAMPLE':'DIN · SAMPLE'):(item.sender==='me'?'YOU · '+formatTime(item.at):'DIN · '+formatTime(item.at)));
        addText(wrap,'bubble',item.text);t.append(wrap);
      }
      if(!data.comms.length){
        const msg=document.createElement('div');msg.className='comms-empty-intro';
        addText(msg,'','NO TRANSMISSIONS YET','strong');
        addText(msg,'','右上の「＋」からChatGPTの通信文を貼り付けてみよう。下の吹き出しは表示例で、ディンの実際の発言ではありません。');t.append(msg);
        addMessage({sender:'din',text:'ここに、ディンから届いた通信が表示されます。'},true);
        addMessage({sender:'me',text:'こちらに、あなたが記録した返信が表示されます。'},true);
      }else{
        data.comms.forEach(item=>{
          const timestamp=new Date(item.at);
          const day=isNaN(timestamp.getTime())?'日付不明':timestamp.toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'short'});
          if(day!==previousDay){addText(t,'thread-day',day);previousDay=day;}
          addMessage(item);
        });
      }
      requestAnimationFrame(()=>{el('commsScroll').scrollTop=el('commsScroll').scrollHeight;});updatePreview();
    }
    function renderRp(){const r=el('rpLog');r.replaceChildren();if(!data.rp.length){let empty=document.createElement('div');empty.className='rp-empty';empty.textContent='まだRPの記録はありません。\n下に文章を入力すると、会話とは違う「本文形式」で表示を試せます。\n\n※ここではディンから返答は生成されません。';r.append(empty);}else{data.rp.forEach(item=>{let w=document.createElement('article');w.className='rp-entry'+(item.sender==='din'?' din':'');addText(w,'rp-speaker',item.sender==='din'?'DIN DJARIN':'YOU');addText(w,'rp-words',item.text);addText(w,'rp-time',formatTime(item.at));r.append(w);});}requestAnimationFrame(()=>{el('rpScroll').scrollTop=el('rpScroll').scrollHeight;});}
    let mode='comms',sender='din';
    function modalOpen(which){mode=which;sender='din';el('modalTitle').textContent=which==='rp'?'ディンの返答を取り込む':'通信を手動で記録';el('modalDesc').textContent=which==='rp'?'ChatGPTからコピーした返答などを、RP画面の表示確認用として手動登録できます。':'ChatGPTで受け取った通信や送った文章をここに手動記録できます。自動同期・送信はしません。';el('senderPick').hidden=which==='rp';el('messageDateField').hidden=which==='rp';el('modalTimestamp').value='';$$('.choice').forEach(c=>c.classList.toggle('selected',c.dataset.sender==='din'));el('modalInput').value='';el('overlay').classList.add('open');el('modalInput').focus();}
    function modalClose(){el('overlay').classList.remove('open');}
    el('addCommsHeader').addEventListener('click',()=>modalOpen('comms'));el('addDinRp').addEventListener('click',()=>modalOpen('rp'));
    $$('.choice').forEach(c=>c.addEventListener('click',()=>{sender=c.dataset.sender;$$('.choice').forEach(x=>x.classList.toggle('selected',x===c));}));
    el('cancelModal').addEventListener('click',modalClose);el('overlay').addEventListener('click',e=>{if(e.target===el('overlay'))modalClose();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')modalClose();});
    el('saveModal').addEventListener('click',()=>{const text=el('modalInput').value.trim();if(!text){toast('文章を入力してください');return;}
      const at=mode==='comms' && el('modalTimestamp').value?new Date(el('modalTimestamp').value):new Date();
      if(isNaN(at.getTime())){toast('日時を確認してください');return;}
      const record={id:Date.now(),sender:mode==='rp'?'din':sender,text,at:at.toISOString()};
      (mode==='rp'?data.rp:data.comms).push(record);
      if(mode==='comms')data.comms.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
      if(!persist())return;modalClose();if(mode==='rp')renderRp();else renderComms();toast('この端末に記録しました（送信はしていません）');
    });
    // v0.4: preserve the outgoing draft across an external app switch.
    el('commsDraft').value = data.commsDraftText;
    el('commsDraft').addEventListener('input',()=>{data.commsDraftText=el('commsDraft').value;persist();});
    function refreshPendingReply(){
      const pending=data.pendingReply;
      el('pendingReplyPanel').hidden=!pending;
      if(pending)el('pendingReplyText').textContent='前回の返信候補：「'+pending.text.slice(0,54)+(pending.text.length>54?'…':'')+'」\nChatGPTで送信できた？';
    }
    refreshPendingReply();
    const getReplyText=()=>el('commsDraft').value.trim();
    function notificationLinkReady(){
      if(!data.notificationUrl || !chatgptAllowed(data.notificationUrl)){
        toast('先に「設定」でChatGPT通知部屋のURLを登録してね');
        go('settings');return false;
      }
      return true;
    }
    function preparePendingReply(text, mode){
      data.commsDraftText=text;
      data.pendingReply={text,at:new Date().toISOString(),mode};
      if(!persist())return false;
      refreshPendingReply();return true;
    }
    async function copyReplyAndOpen(){
      const text=getReplyText();
      if(!text){toast('ディンへの返信を入力してね');return;}
      if(!notificationLinkReady())return;
      // Clipboard needs user activation. No network request and no URL query carries reply text.
      try {await navigator.clipboard.writeText(text);} catch(e){toast('コピーが許可されませんでした。右の「コピー」で試してね');return;}
      if(!preparePendingReply(text,'clipboard'))return;
      // Same-tab navigation avoids popup blocking on iPhone PWAs; sending remains a manual action.
      window.location.assign(data.notificationUrl);
    }
    el('replyViaChatgpt').addEventListener('click',copyReplyAndOpen);
    el('copyCommsDraft').addEventListener('click',()=>copyString(el('commsDraft').value));
    el('confirmReplySent').addEventListener('click',()=>{
      const pending=data.pendingReply;if(!pending)return;
      // Only a user confirmation may mark the ChatGPT-side send as completed.
      const id='reply-confirmed:'+pending.at;
      if(!data.comms.some(m=>m.id===id)){
        data.comms.push({id,sender:'me',text:pending.text,at:new Date().toISOString(),sendStatus:'user-confirmed'});
        data.comms.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
      }
      if(el('commsDraft').value.trim()===pending.text){el('commsDraft').value='';data.commsDraftText='';}
      data.pendingReply=null;persist();refreshPendingReply();renderComms();toast('送信済みとして端末内に記録しました（手動確認）');
    });
    el('cancelReplyPending').addEventListener('click',()=>{
      data.pendingReply=null;persist();refreshPendingReply();toast('送信扱いにはせず、下書きを残しました');
    });
    el('pasteDinReply').addEventListener('click',()=>{
      modalOpen('comms');
      el('modalTitle').textContent='ディンの通常返答を取り込む';
      el('modalDesc').textContent='ChatGPTでディンから返ってきた通常の返答をコピーして貼り付けてね。通常返答は旧ChatGPT版から自動取得されないため、手動で保存します。';
    });
    // The unsafe prefilled ChatGPT deep link was removed in v0.5.1; RP text is never added to URLs.

    el('saveRpDraft').addEventListener('click',()=>{const text=el('rpDraft').value.trim();if(!text){toast('下書きを入力してください');return;}data.rp.push({id:Date.now(),sender:'me',text,at:new Date().toISOString()});if(!persist())return;el('rpDraft').value='';renderRp();toast('画面に記録しました（ChatGPTへは未送信）');});
    async function copyString(str){if(!str){toast('コピーする内容がありません');return;}try{await navigator.clipboard.writeText(str);toast('コピーしました');}catch(e){toast('自動コピーできません。文章を選択してコピーしてください。');}}
    el('copyDraft').addEventListener('click',()=>copyString(el('rpDraft').value));
    el('copyOut').addEventListener('click',()=>copyString(el('outNote').value));
    el('saveOut').addEventListener('click',()=>{data.note=el('outNote').value;persist()&&toast('メモを保存しました');});
    const chatgptAllowed = url=>{try{const u=new URL(url);return u.protocol==='https:' && (u.hostname==='chatgpt.com'||u.hostname==='chat.openai.com');}catch{return false;}};
    function openExternal(which){const url=which==='rp'?data.rpUrl:data.notificationUrl;if(!url){toast('先に設定でChatGPTの部屋のURLを登録してね');return;}if(!chatgptAllowed(url)){toast('ChatGPTのHTTPS URLを入力してください');return;}window.open(url,'_blank','noopener,noreferrer');}
    el('rpExternal').addEventListener('click',()=>openExternal('rp'));el('openRp').addEventListener('click',()=>openExternal('rp'));el('openNotif').addEventListener('click',()=>openExternal('notification'));el('notifExternal').addEventListener('click',()=>openExternal('notification'));
    function renderSettings(){el('rpUrl').value=data.rpUrl||'';el('notificationUrl').value=data.notificationUrl||'';el('apiWorkerUrl').value=data.apiWorkerUrl||'';el('apiPrompt').value=data.apiPrompt||'';el('statComms').textContent=data.comms.length;el('statRp').textContent=data.rp.length;}
    el('saveSettings').addEventListener('click',()=>{const rp=el('rpUrl').value.trim(),nt=el('notificationUrl').value.trim();if((rp&&!chatgptAllowed(rp))||(nt&&!chatgptAllowed(nt))){toast('chatgpt.com のHTTPS URLを指定してください');return;}data.rpUrl=rp;data.notificationUrl=nt;persist()&&toast('リンクを保存しました');});
    el('exportData').addEventListener('click',async()=>{try{await window.DinVault.flush();const json=JSON.stringify(window.DinVault.encryptedBackup(),null,2);const blob=new Blob([json],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='din-comms-encrypted-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('暗号化バックアップを書き出しました。復元にはパスフレーズが必要です');}catch(err){toast('保存の完了を確認できませんでした。しばらくしてから再試行してください。');}});
    el('vaultLock').addEventListener('click',()=>window.DinVault.lock());
    el('resetData').addEventListener('click',()=>{if(!confirm('このブラウザ内の通信・RP・メモ・URLをすべて削除しますか？\nこの操作は取り消せません。'))return;data={...initial,comms:[],rp:[]};window.DinVault.save(data).then(()=>{renderSettings();renderComms();renderRp();updatePreview();toast('暗号化して初期化しました');}).catch(()=>toast('保存に失敗しました。データを確認してください。'));});
    // v0.5: separate API sandbox. No automatic migration or canonical RP state mutation.
    let apiAccessToken = '';  // kept in JS memory only; NEVER put this or OpenAI API key in GitHub, URL, or localStorage
    let apiBusy = false;
    const API_MAX_TEST_TURNS_PER_DAY = 20;  // local UI guard only; NOT a billing hard cap
    const apiLimitKey=()=> 'din-api-local-calls-'+new Date().toLocaleDateString('sv-SE');
    const apiCallsToday=()=> {try {return Math.max(0,Number(localStorage.getItem(apiLimitKey()))||0)}catch{return 0}};
    function apiWorkerValid(value){
      try {const u=new URL(value);return u.protocol==='https:' && /^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/i.test(u.hostname) && (u.pathname==='/'||u.pathname==='/chat') && !u.search && !u.hash;}
      catch{return false;}
    }
    function apiState(message){el('apiState').textContent=message;}
    function renderApiThread(){
      const t=el('apiThread');t.replaceChildren();
      if(!data.apiMessages.length){const note=document.createElement('div');note.className='comms-empty-intro';note.textContent='API版ディンのテスト専用画面です。\nまず設定でWorkerのURLと引き継ぎ資料を入力してね。\nChatGPT本編とは独立しています。';t.append(note)}
      else {let lastDay='';for(const m of data.apiMessages){const d=new Date(m.at);const day=isNaN(d.getTime())?'日時不明':d.toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'short'});if(lastDay!==day){addText(t,'thread-day',day);lastDay=day;}
        const wrap=document.createElement('div');wrap.className='bubble-wrap'+(m.sender==='me'?' mine':'');addText(wrap,'bubble-meta',(m.sender==='me'?'YOU':'API DIN')+' // '+formatTime(m.at));addText(wrap,'bubble',m.text);t.append(wrap);}}
      el('apiWorkerUrl') && (el('apiConnectionState').textContent=data.apiWorkerUrl?'API接続先登録済み':'API接続待ち');
      el('apiConnectionHelp').textContent=data.apiPrompt?'資料あり / テスト履歴は本編と分離':'資料未設定：設定にプロジェクト指示を貼ってね';
      updateApiUsage();requestAnimationFrame(()=>el('apiScroll').scrollTop=el('apiScroll').scrollHeight);
    }
    function updateApiUsage(){const totals=data.apiMessages.reduce((a,m)=>{if(m.usage){a.input+=Number(m.usage.input_tokens)||0;a.output+=Number(m.usage.output_tokens)||0;}return a;},{input:0,output:0});const est=(totals.input*1+totals.output*5)/1e6;el('apiTokenSummary').textContent='累積目安：入力 '+totals.input+' / 出力 '+totals.output+' tokens ｜ 約 $'+est.toFixed(4)+'（GPT-6 Solの概算・割引等は未反映）';}
    el('apiDraft').value=data.apiDraftText||'';
    el('apiDraft').addEventListener('input',()=>{data.apiDraftText=el('apiDraft').value;persist();});
    el('saveApiSettings').addEventListener('click',()=>{
      const endpoint=el('apiWorkerUrl').value.trim();const prompt=el('apiPrompt').value.trim();
      if(endpoint && !apiWorkerValid(endpoint)){toast('https://...workers.dev のURLを入力してください');return;}
      if(endpoint!==data.apiWorkerUrl)apiAccessToken='';
      data.apiWorkerUrl=endpoint;data.apiPrompt=prompt;persist();renderApiThread();toast('API設定をこの端末に保存しました');
    });
    el('resetApiSession').addEventListener('click',()=>{if(!confirm('APIテスト履歴だけを削除しますか？旧通信アーカイブとChatGPTのログは削除されません。'))return;data.apiMessages=[];persist();renderApiThread();toast('API試験履歴を削除しました');});
    async function callApi(){
      if(apiBusy)return;
      const text=el('apiDraft').value.trim();if(!text){toast('メッセージを入力してね');return;}
      if(!apiWorkerValid(data.apiWorkerUrl)){toast('設定からWorker URLを登録してね');return;}
      if(!data.apiPrompt.trim()){toast('まず設定で指示や資料を登録してね');return;}
      if(apiCallsToday()>=API_MAX_TEST_TURNS_PER_DAY){apiState('この端末では今日はテスト20回まで。明日再開してね（請求上限ではありません）');return;}
      if(!apiAccessToken){const entered=prompt('Cloudflare Workersに設定した DIN_ACCESS_TOKEN を入力してください。\nOpenAIのAPIキーではありません。入力値はこの端末に保存されません。');if(entered===null)return;if(entered.length<24){apiState('DIN_ACCESS_TOKEN は24文字以上のランダムな文字列にしてね');return;}apiAccessToken=entered;}
      apiBusy=true;el('sendApiMessage').disabled=true;apiState('API版ディンの返答を待っています…');
      try {
        const history=data.apiMessages.slice(-12).map(m=>({role:m.sender==='me'?'user':'assistant',content:m.text.slice(0,3000)}));
        // Count attempts locally BEFORE request, even for an error (best-effort guard).
        try{localStorage.setItem(apiLimitKey(),String(apiCallsToday()+1));}catch{}
        const url=data.apiWorkerUrl.replace(/\/$/,'')+(new URL(data.apiWorkerUrl).pathname==='/chat'?'':'/chat');
        const res=await fetch(url,{method:'POST',mode:'cors',cache:'no-store',headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiAccessToken},body:JSON.stringify({message:text,history,instructions:data.apiPrompt})});
        let result={};try{result=await res.json();}catch{}
        if(!res.ok)throw new Error(result.error||('HTTP '+res.status));
        if(typeof result.reply!=='string'||!result.reply.trim())throw new Error('返答テキストが空でした。Workerのログで応答を確認してください');
        const now=new Date().toISOString();data.apiMessages.push({id:'api-you-'+Date.now(),sender:'me',text,at:now});data.apiMessages.push({id:'api-din-'+Date.now(),sender:'din',text:result.reply.trim(),at:new Date().toISOString(),usage:result.usage||null});
        data.apiDraftText='';el('apiDraft').value='';persist();renderApiThread();apiState('返答を取得しました / 本編とは未同期');
      }catch(err){apiState('送信できませんでした：'+(err?.message||'通信エラー')+'。文章は残しています。');}
      finally{apiBusy=false;el('sendApiMessage').disabled=false;}
    }
    el('sendApiMessage').addEventListener('click',callApi);

    updatePreview();
    if('serviceWorker' in navigator && location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
  })();
  };

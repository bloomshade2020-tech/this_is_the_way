/* Setup is inert until an explicit click or a previously enrolled encrypted setting. */
(()=>{
 const BUILD='vector-shared-setup-v2-20261024';
 const module=()=>import('./local-shared-log/installer.mjs');
 const ready=()=>{if(window.VectorAppBuild===BUILD&&window.VectorVaultBuild===BUILD)navigator.serviceWorker?.controller?.postMessage({type:'VECTOR_SHARED_READY',build:BUILD});};
 if(location.protocol==='https:')navigator.serviceWorker?.register('./sw.js').catch(()=>{});
 navigator.serviceWorker?.addEventListener('controllerchange',ready);window.addEventListener('load',ready);
 window.VectorSharedSetup={
 async beforeStart(data){if(data.sharedLogClient)await (await module()).install(data,window.DinVault);},
 attach(durable,request){
  const host=document.querySelector('#screen-settings .settings-scroll');if(!host)return;
  const box=document.createElement('section');box.className='settings-group';box.id='sharedLogSetup';
  box.innerHTML='<h2>共通ログ</h2><p>初期設定はOFF。HERE・COMMS・BACKSTAGE・外の相談の新しい本文を同じ文書に別ラベルで保存します。BACKSTAGEと外の相談はDinの記憶へ直接渡しません。過去履歴・写真・自動メモは対象外です。</p><button id="sharedDevice">端末登録コードを表示</button><p id="sharedDeviceCode"></p><label><input id="sharedConsent" type="checkbox">この保存範囲を許可する</label><button id="sharedInstall">所有者設定を確認してこの端末で開始</button><button id="sharedPause">端末の送信を停止（保存待ちを保持）</button><button id="roomDrain">部屋替え前の保存待ちを照合</button><p id="sharedStatus" role="status"></p><details><summary>外の相談を本文として記録</summary><p>今の相談で明示的に選んだ本文だけ。過去履歴の一括取込には使いません。</p><select id="outsideSpeaker"><option value="me">YOU</option><option value="chappy">CHAPPY</option></select><textarea id="outsideText"></textarea><button id="outsideSave">選択した本文を保存</button></details>';
  host.append(box);const $=id=>box.querySelector('#'+id);let busy=false;
  const act=fn=>async()=>{if(busy)return;busy=true;try{await fn();}catch(e){$('sharedStatus').textContent=e.message;}finally{busy=false;}};
  $('sharedDevice').onclick=act(async()=>{await durable.commit(next=>{next.sharedLogDeviceNamespace||='device-'+crypto.randomUUID();});$('sharedDeviceCode').textContent=durable.snapshot().sharedLogDeviceNamespace;$('sharedStatus').textContent='このコードを所有者の文書設定に登録してください。まだ送信は始まりません。';});
  $('sharedInstall').onclick=act(async()=>{if(!$('sharedConsent').checked)throw Error('保存範囲を確認してください');await (await module()).enrollClient({durable,request,consent:'four-scopes-new-text-only'});location.reload();});
  $('roomDrain').onclick=act(async()=>{if(!window.VectorSharedLogLocal?.room)throw Error('共通ログの更新と設定が必要です');const r=await window.VectorSharedLogLocal.room.acknowledge();$('sharedStatus').textContent=r.status==='drained'?'この端末の保存待ちを確認しました。部屋切替は所有者設定で行います。':'照合は未確認です。';});
  $('sharedPause').onclick=act(async()=>{await durable.commit(next=>{if(next.sharedLogClient)next.sharedLogClient.exportEnabled=false;});$('sharedStatus').textContent='この端末の新たな送信を停止しました。進行中の送信結果は後で確認します。サーバー全体の停止は所有者設定で行ってください。';});
  $('outsideSave').onclick=act(async()=>{if(!durable.snapshot().sharedLogClient?.capture)throw Error('共通ログ設定を先に完了してください');const text=$('outsideText').value;if(!text)throw Error('本文を入力してください');const room=await window.VectorSharedLogLocal?.room?.tagOriginal();await durable.commit(next=>{next.outsideMessages||=[];next.outsideMessages.push({id:crypto.randomUUID(),at:new Date().toISOString(),sender:$('outsideSpeaker').value,text,...(room?{sharedRoom:room}:{})});});$('outsideText').value='';$('sharedStatus').textContent='外の相談として暗号化保存しました。送信結果とは別です。';});
  $('sharedStatus').textContent=durable.snapshot().sharedLogClient?'登録済み。本文保存と送信確認は別々に保持します。':'OFF（未登録）';
 }
 };
})();

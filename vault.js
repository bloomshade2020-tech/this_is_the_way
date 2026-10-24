window.VectorVaultBuild='vector-shared-setup-v2-20261024';
/* VECTOR v0.6.1 local encrypted vault.
   PBKDF2-SHA256 (310,000 iterations) -> AES-GCM 256-bit.
   Passphrase is NEVER persisted. Optional remembered sessions store a non-extractable AES CryptoKey in IndexedDB on the trusted device; this is a convenience/security tradeoff.
   Existing plaintext localStorage is deleted only AFTER verify-encrypt-check succeeds.
   Encryption-at-rest is not protection from malicious code while vault is open. */
(() => {
  'use strict';
  const VAULT_KEY='din-comms-v051-encrypted-vault';
  const LEGACY_KEY='din-terminal-v01';
  const SESSION_DB='vector-trusted-device-v1', SESSION_STORE='keys', SESSION_ID='vault';
  const PBKDF2_ITERS=310000;
  const enc=new TextEncoder(),dec=new TextDecoder();
  const get=id=>document.getElementById(id);
  let key=null, envelope=null, stateEnvelope=null, pending=Promise.resolve(),closing=false,started=false;
  const toB64=b=>{const bytes=new Uint8Array(b);let str='';for(let i=0;i<bytes.length;i+=16384){str+=String.fromCharCode(...bytes.subarray(i,i+16384));}return btoa(str);};
  const fromB64=str=>Uint8Array.from(atob(str),ch=>ch.charCodeAt(0));
  const random=length=>crypto.getRandomValues(new Uint8Array(length));
  const derive=async(pass,salt,iters)=>{
    const material=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:iters,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  };
  const validEnvelope=obj=>Boolean(obj&&obj.type==='din-comms-vault'&&obj.version===1&&typeof obj.salt==='string'&&typeof obj.iv==='string'&&typeof obj.data==='string'&&obj.iterations>=200000&&obj.iterations<=1000000&&obj.salt.length<150&&obj.iv.length<100&&obj.data.length<15000000);
  const seal=async(payload,k,salt,iters)=>{
    const iv=random(12),bytes=enc.encode(JSON.stringify(payload));
    const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,bytes);
    return {type:'din-comms-vault',version:1,kdf:'PBKDF2-SHA256',cipher:'AES-256-GCM',iterations:iters,salt:toB64(salt),iv:toB64(iv),data:toB64(cipher),updatedAt:new Date().toISOString()};
  };
  const open=async(e,k)=>{
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(e.iv)},k,fromB64(e.data));
    const data=JSON.parse(dec.decode(plain));
    if(!data || typeof data!=='object' || Array.isArray(data))throw new Error('データ形式が正しくありません');
    return data;
  };
  const commit=v=>{if(!validEnvelope(v))throw Error('VAULT_CAPACITY_EXCEEDED');const raw=JSON.stringify(v);if(enc.encode(raw).length>12_000_000)throw Error('VAULT_CAPACITY_EXCEEDED');localStorage.setItem(VAULT_KEY,raw);envelope=v;stateEnvelope=raw;};
  // All candidate tabs serialize every vault mutation, including recovery.
  const WRITE_LOCK='vector-encrypted-vault-write-v1';
  const checkBase=expected=>{if(localStorage.getItem(VAULT_KEY)!==expected)throw Error('STALE_VAULT_REOPEN_REQUIRED');};
  const withWriteLock=fn=>navigator.locks?.request
    ? navigator.locks.request(WRITE_LOCK,{mode:'exclusive'},fn)
    : fn(); // Ordinary app remains usable; shared-log installation requires locks.
  const status=s=>{get('vaultStatus').textContent=s;};
  // Same-origin IndexedDB can persist a non-extractable CryptoKey via structured clone.
  // This prevents casual key export, NOT decrypt-capable access by malicious same-origin JS
  // or by someone using an unlocked device. Explicit manual lock deletes this entry.
  async function sessionDb(){
    if(!('indexedDB' in window))throw Error('このブラウザは端末内のロック解除保持に対応していません');
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(SESSION_DB,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(SESSION_STORE))req.result.createObjectStore(SESSION_STORE);};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('端末内の保存領域を開けません'));
      req.onblocked=()=>reject(Error('保存領域が他の画面で使用中です'));
    });
  }
  async function sessionAction(kind,value){
    const db=await sessionDb();
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction(SESSION_STORE,kind==='get'?'readonly':'readwrite');
      const req=kind==='get'?tx.objectStore(SESSION_STORE).get(SESSION_ID):kind==='put'?tx.objectStore(SESSION_STORE).put(value,SESSION_ID):tx.objectStore(SESSION_STORE).delete(SESSION_ID);
      let result;
      req.onsuccess=()=>{result=req.result;};
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error||Error('端末内の保存に失敗しました'));
      tx.onabort=()=>reject(tx.error||Error('端末内の保存が中断されました'));
    });}finally{db.close();}
  }
  const removeSession=()=>sessionAction('delete');
  async function rememberUnlock(enabled){
    if(enabled){
      if(!key||!envelope)throw Error('まず保管庫を解除してください');
      await sessionAction('put',{key,salt:envelope.salt,version:1});
      const tested=await sessionAction('get');
      if(!tested?.key||tested.salt!==envelope.salt){await removeSession().catch(()=>{});throw Error('解除情報を確認できませんでした');}
    }else await removeSession();
  }

  async function startApp(data){
    if(started)return;
    if(data.stayUnlocked){
      try{await rememberUnlock(true);}catch(err){
        // App can still open normally. Do not silently claim restart-unlock is enabled.
        data.stayUnlocked=false;
        // Startup fallback is memory-only. Do not save a stale decrypted snapshot
        // before the app installs its guarded persistence queue.
        // A later ordinary guarded save may persist the effective false setting.
        alert('この端末でログイン状態を維持できませんでした。次回はパスフレーズの入力が必要です。');
      }
    }
    await window.VectorSharedSetup?.beforeStart(data);
    started=true;
    document.body.classList.remove('vault-locked');
    get('vaultPass').value='';get('vaultConfirm').value='';
    window.DinAppStart(data);
    // No inactivity timer. Browser process restart uses the explicitly saved device key only.
  }
  async function flush(){await pending;}
  async function lock(){
    if(closing)return;closing=true;
    document.body.classList.add('vault-locked');
    try{await flush();await removeSession();key=null;location.reload();}
    catch(err){
      // A failed device-key deletion MUST NOT be reported as a successful manual lock.
      key=null;closing=false;
      alert('端末内のロック解除情報の削除を確認できませんでした。手動ロックは完了していません。端末を他人に渡さず、再度お試しください。');
    }
  }
  const vault={
    save(data){
      if(!key || !envelope || closing)return Promise.reject(new Error('Vault locked'));
      const json=JSON.stringify(data);
      pending=pending.catch(()=>{}).then(()=>withWriteLock(async()=>{
        const expected=stateEnvelope;checkBase(expected);
        const updated=await seal(JSON.parse(json),key,fromB64(envelope.salt),envelope.iterations);
        checkBase(expected);
        // No legacy plaintext written at any point.
        commit(updated);
      }));
      return pending;
    },
    async flush(){await flush();},
    writeBaseToken(){return stateEnvelope;},
    sharedLogWriteGuardReady(){return Boolean(navigator.locks?.request);},
    encryptedBackup(){if(!envelope || !key)throw new Error('保管庫を先に開いてください');return JSON.parse(JSON.stringify(envelope));},
    lock,
    rememberUnlock,
  };
  window.DinVault=vault;
  function modeSetup(migrate){
    get('vaultTitle').textContent=migrate?'旧データを暗号化して移行':'個人用保管庫を作成';
    get('vaultDescription').textContent=migrate?'以前の通信履歴やAPI設定を、この端末で暗号化して引き継ぎます。旧データは暗号化して復号確認できた後に削除します。':'今後の会話・資料を暗号化するパスフレーズを作成します。';
    get('vaultConfirmArea').hidden=false;
    get('vaultPass').setAttribute('autocomplete','new-password');
    get('vaultResetArea').hidden=true;
    get('vaultSubmit').textContent=migrate?'暗号化して移行':'保管庫を作成';
    get('vaultWarning').textContent='12文字以上の強いパスフレーズを設定して控えてください。忘れると復元できません。APIキーやCloudflareのアクセストークンと同じにしないでください。';
  }
  function modeUnlock(){
    get('vaultTitle').textContent='VECTORを開く';
    get('vaultDescription').textContent='保存済みの資料と通信履歴は暗号化されています。パスフレーズで解除してください。';
    get('vaultConfirmArea').hidden=true;
    get('vaultPass').setAttribute('autocomplete','current-password');
    get('vaultResetArea').hidden=false;
    get('vaultSubmit').textContent='ロックを解除';
  }
  async function create(pass,migrate){
    const expected=localStorage.getItem(VAULT_KEY);
    if(expected!==null)throw Error('STALE_VAULT_REOPEN_REQUIRED');
    let legacy={};
    if(migrate){
      try{legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||'{}');}catch{throw new Error('旧データを読み取れません。消さずに残しました。');}
      if(!legacy || typeof legacy!=='object' || Array.isArray(legacy))throw new Error('旧データの形式が違います。');
    }
    delete legacy.oauthClientId;
    const salt=random(16),iters=PBKDF2_ITERS,k=await derive(pass,salt,iters);
    const fresh=await seal(legacy,k,salt,iters);
    // Verify before replacing state / removing legacy plaintext.
    await open(fresh,k);
    const verified=await withWriteLock(async()=>{
      checkBase(expected);commit(fresh);
      const savedRaw=localStorage.getItem(VAULT_KEY);
      const saved=await open(JSON.parse(savedRaw),k);checkBase(savedRaw);
      if(migrate)localStorage.removeItem(LEGACY_KEY);
      return saved;
    });
    key=k;
    await startApp(verified);
  }
  async function unlock(pass){
    let e;const raw=localStorage.getItem(VAULT_KEY);
    try{e=JSON.parse(raw||'{}');}catch{throw new Error('保存データが壊れています。');}
    if(!validEnvelope(e))throw new Error('暗号化データの形式が正しくありません。');
    const k=await derive(pass,fromB64(e.salt),e.iterations);
    const data=await open(e,k);key=k;envelope=e;stateEnvelope=raw;
    // If a legacy key still exists after restoring a vault, discard it after successful decryption.
    if(localStorage.getItem(LEGACY_KEY)!==null)localStorage.removeItem(LEGACY_KEY);
    await startApp(data);
  }
  async function tryAutoUnlock(){
    const raw=localStorage.getItem(VAULT_KEY);
    if(!raw||started)return;
    let entry;
    try{entry=await sessionAction('get');}catch{return;}
    if(!entry?.key)return;
    try{
      const e=JSON.parse(raw);
      if(!validEnvelope(e)||entry.salt!==e.salt)throw Error('古い解除情報です');
      const data=await open(e,entry.key);
      if(data.stayUnlocked!==true)throw Error('端末のロック解除維持が無効です');
      key=entry.key;envelope=e;stateEnvelope=raw;
      await startApp(data);
    }catch{
      key=null;envelope=null;
      await removeSession().catch(()=>{});
      status('保存した解除情報が利用できないため、パスフレーズを入力してください。');
    }
  }
  function init(){
    if(!window.crypto?.subtle){status('暗号化APIが使えません。HTTPSで起動してください。');get('vaultSubmit').disabled=true;return;}
    const migration=!localStorage.getItem(VAULT_KEY) && localStorage.getItem(LEGACY_KEY)!==null;
    const hasVault=localStorage.getItem(VAULT_KEY)!==null;
    if(hasVault){modeUnlock();tryAutoUnlock().catch(()=>{});}else modeSetup(migration);
    get('vaultForm').addEventListener('submit',async e=>{
      e.preventDefault();const pass=get('vaultPass').value;
      if(pass.length<12){status('パスフレーズは12文字以上にしてください。');return;}
      if(!hasVault && pass!==get('vaultConfirm').value){status('確認用パスフレーズが一致していません。');return;}
      const button=get('vaultSubmit');button.disabled=true;status('暗号化・認証処理中…');
      try{if(hasVault)await unlock(pass);else await create(pass,migration);}
      catch(err){status('開けませんでした：'+(hasVault?'パスフレーズまたは保存データを確認してください。':String(err?.message||err)));}
      finally{button.disabled=false;get('vaultPass').value='';get('vaultConfirm').value='';}
    });
    // Recovery without a passphrase is cryptographically impossible. Offer a scoped wipe,
    // not a Safari-wide data clearing instruction (same-origin Pages may share storage).
    get('vaultResetBtn').addEventListener('click',async()=>{
      const expected=localStorage.getItem(VAULT_KEY);
      if(expected===null){status('初期化する暗号化保管庫がありません。');return;}
      if(!confirm('注意：DIN COMMS内の暗号化済みの通信履歴・API試験履歴・設定を完全に失います。パスフレーズなしでは復旧できません。続けますか？'))return;
      const typed=prompt('最終確認：端末内の保管庫を初期化する場合だけ、半角英字で RESET と入力してください。');
      if(typed!=='RESET'){status('初期化をキャンセルしました。');return;}
      // Wipe ONLY DIN COMMS encrypted vault. Do not clear origin-wide web storage,
      // Worker secrets, browser credentials or other hosted app storage.
      try{await withWriteLock(async()=>{checkBase(expected);await removeSession();checkBase(expected);localStorage.removeItem(VAULT_KEY);});location.reload();}
      catch(err){status('初期化できませんでした。端末の空き容量やSafari設定を確認してください。');}
    });
    get('vaultRestoreBtn').addEventListener('click',()=>get('vaultImportFile').click());
    get('vaultImportFile').addEventListener('change',async e=>{
      const expected=localStorage.getItem(VAULT_KEY);
      const file=e.target.files?.[0];if(!file)return;
      if(file.size>12_000_000){status('ファイルが大きすぎます。');return;}
      try{
        const obj=JSON.parse(await file.text());
        if(!validEnvelope(obj))throw new Error('VECTOR対応の暗号化バックアップではありません。');
        if(!confirm('現在の暗号化保管庫をバックアップ内容で上書きします。現在の記録は復元できなくなる可能性があります。続けますか？'))return;
        // Protect against accidental overwrites if the user has not backed up.
        await withWriteLock(async()=>{checkBase(expected);
          // Fresh identity prevents ABA: an old E0 tab cannot overwrite E0 restored later.
          const restored=JSON.stringify({...obj,restoredRevision:toB64(random(16))});
          if(enc.encode(restored).length>12_000_000)throw Error('VAULT_CAPACITY_EXCEEDED');
          await removeSession();checkBase(expected);
          localStorage.setItem(VAULT_KEY,restored);
        });
        // Note: importing a backup does not restore old Gmail API access.
        location.reload();
      }catch(err){status('復元できません：'+(err?.message||'ファイル形式を確認してください。'));}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

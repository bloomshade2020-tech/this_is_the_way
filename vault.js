/* DIN COMMS v0.5.1 local encrypted vault.
   PBKDF2-SHA256 (310,000 iterations) -> AES-GCM 256-bit.
   Passphrase and AES key are kept only in JS memory while unlocked.
   Existing plaintext localStorage is deleted only AFTER verify-encrypt-check succeeds.
   Encryption-at-rest is not protection from malicious code while vault is open. */
(() => {
  'use strict';
  const VAULT_KEY='din-comms-v051-encrypted-vault';
  const LEGACY_KEY='din-terminal-v01';
  const PBKDF2_ITERS=310000;
  const enc=new TextEncoder(),dec=new TextDecoder();
  const get=id=>document.getElementById(id);
  let key=null, envelope=null, pending=Promise.resolve(),closing=false;
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
  const commit=v=>{localStorage.setItem(VAULT_KEY,JSON.stringify(v));envelope=v;};
  const status=s=>{get('vaultStatus').textContent=s;};
  function startApp(data){
    document.body.classList.remove('vault-locked');
    get('vaultPass').value='';get('vaultConfirm').value='';
    window.DinAppStart(data);
    // When returning from another app after two minutes, discard in-memory keys and re-lock.
    let hiddenAt=0;
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden)hiddenAt=Date.now();
      else if(hiddenAt && Date.now()-hiddenAt>120000)void lock();
    });
  }
  async function flush(){await pending;}
  async function lock(){
    if(closing)return;closing=true;
    document.body.classList.add('vault-locked');
    try{await flush();}finally{key=null;location.reload();}
  }
  const vault={
    save(data){
      if(!key || !envelope || closing)return Promise.reject(new Error('Vault locked'));
      const json=JSON.stringify(data);
      pending=pending.catch(()=>{}).then(async()=>{
        const updated=await seal(JSON.parse(json),key,fromB64(envelope.salt),envelope.iterations);
        // No legacy plaintext written at any point.
        commit(updated);
      });
      return pending;
    },
    async flush(){await flush();},
    encryptedBackup(){if(!envelope || !key)throw new Error('保管庫を先に開いてください');return JSON.parse(JSON.stringify(envelope));},
    lock,
  };
  window.DinVault=vault;
  function modeSetup(migrate){
    get('vaultTitle').textContent=migrate?'旧データを暗号化して移行':'個人用保管庫を作成';
    get('vaultDescription').textContent=migrate?'以前の通信履歴やAPI設定を、この端末で暗号化して引き継ぎます。旧データは暗号化して復号確認できた後に削除します。':'今後の会話・資料を暗号化するパスフレーズを作成します。';
    get('vaultConfirmArea').hidden=false;
    get('vaultSubmit').textContent=migrate?'暗号化して移行':'保管庫を作成';
    get('vaultWarning').textContent='12文字以上の強いパスフレーズを設定して控えてください。忘れると復元できません。APIキーやCloudflareのアクセストークンと同じにしないでください。';
  }
  function modeUnlock(){
    get('vaultTitle').textContent='DIN COMMSを開く';
    get('vaultDescription').textContent='保存済みの資料と通信履歴は暗号化されています。パスフレーズで解除してください。';
    get('vaultConfirmArea').hidden=true;
    get('vaultSubmit').textContent='ロックを解除';
  }
  async function create(pass,migrate){
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
    commit(fresh);
    const verified=await open(JSON.parse(localStorage.getItem(VAULT_KEY)),k);
    if(migrate)localStorage.removeItem(LEGACY_KEY);
    key=k;
    startApp(verified);
  }
  async function unlock(pass){
    let e;
    try{e=JSON.parse(localStorage.getItem(VAULT_KEY)||'{}');}catch{throw new Error('保存データが壊れています。');}
    if(!validEnvelope(e))throw new Error('暗号化データの形式が正しくありません。');
    const k=await derive(pass,fromB64(e.salt),e.iterations);
    const data=await open(e,k);key=k;envelope=e;
    // If a legacy key still exists after restoring a vault, discard it after successful decryption.
    if(localStorage.getItem(LEGACY_KEY)!==null)localStorage.removeItem(LEGACY_KEY);
    startApp(data);
  }
  function init(){
    if(!window.crypto?.subtle){status('暗号化APIが使えません。HTTPSで起動してください。');get('vaultSubmit').disabled=true;return;}
    const migration=!localStorage.getItem(VAULT_KEY) && localStorage.getItem(LEGACY_KEY)!==null;
    const hasVault=localStorage.getItem(VAULT_KEY)!==null;
    if(hasVault)modeUnlock();else modeSetup(migration);
    get('vaultForm').addEventListener('submit',async e=>{
      e.preventDefault();const pass=get('vaultPass').value;
      if(pass.length<12){status('パスフレーズは12文字以上にしてください。');return;}
      if(!hasVault && pass!==get('vaultConfirm').value){status('確認用パスフレーズが一致していません。');return;}
      const button=get('vaultSubmit');button.disabled=true;status('暗号化・認証処理中…');
      try{if(hasVault)await unlock(pass);else await create(pass,migration);}
      catch(err){status('開けませんでした：'+(hasVault?'パスフレーズまたは保存データを確認してください。':String(err?.message||err)));}
      finally{button.disabled=false;get('vaultPass').value='';get('vaultConfirm').value='';}
    });
    get('vaultRestoreBtn').addEventListener('click',()=>get('vaultImportFile').click());
    get('vaultImportFile').addEventListener('change',async e=>{
      const file=e.target.files?.[0];if(!file)return;
      if(file.size>12_000_000){status('ファイルが大きすぎます。');return;}
      try{
        const obj=JSON.parse(await file.text());
        if(!validEnvelope(obj))throw new Error('DIN COMMSの暗号化バックアップではありません。');
        if(!confirm('現在の暗号化保管庫をバックアップ内容で上書きします。現在の記録は復元できなくなる可能性があります。続けますか？'))return;
        // Protect against accidental overwrites if the user has not backed up.
        localStorage.setItem(VAULT_KEY,JSON.stringify(obj));
        // Note: importing a backup does not restore old Gmail API access.
        location.reload();
      }catch(err){status('復元できません：'+(err?.message||'ファイル形式を確認してください。'));}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

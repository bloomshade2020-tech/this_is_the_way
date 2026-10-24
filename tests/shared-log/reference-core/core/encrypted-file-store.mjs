// Local test adapter only. One owner per file; not a browser/vault integration.
import {readFile,open,rename} from 'node:fs/promises';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {dirname} from 'node:path';
import {initialState} from './shared-log.mjs';
export class EncryptedFileStore {
 constructor(path,key){if(key.length!==32)throw Error('KEY_LENGTH');this.path=path;this.key=key;}
 async load(){
  let raw;try{raw=await readFile(this.path,'utf8');}catch(e){if(e.code==='ENOENT')return initialState();throw e;}
  const v=JSON.parse(raw);
  if(!v || typeof v!=='object' || Array.isArray(v) ||
     Object.keys(v).sort().join(',')!=='data,iv,tag' ||
     typeof v.iv!=='string' || !/^[0-9a-f]{24}$/.test(v.iv) ||
     typeof v.tag!=='string' || !/^[0-9a-f]{32}$/.test(v.tag) ||
     typeof v.data!=='string' || !/^(?:[0-9a-f]{2})+$/.test(v.data)) throw Error('INVALID_ENVELOPE');
  const d=createDecipheriv('aes-256-gcm',this.key,Buffer.from(v.iv,'hex'),{authTagLength:16});
  d.setAuthTag(Buffer.from(v.tag,'hex'));
  const state=JSON.parse(Buffer.concat([d.update(Buffer.from(v.data,'hex')),d.final()]).toString('utf8'));
  if(state.version!==1 || !Array.isArray(state.entries))throw Error('INVALID_STORE');return state;
 }
 async save(state){
  const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.key,iv,{authTagLength:16});
  const data=Buffer.concat([c.update(JSON.stringify(state),'utf8'),c.final()]);
  const tmp=this.path+'.'+randomBytes(8).toString('hex')+'.tmp';
  const f=await open(tmp,'wx',0o600);
  try{await f.writeFile(JSON.stringify({iv:iv.toString('hex'),tag:c.getAuthTag().toString('hex'),data:data.toString('hex')}));await f.sync();}finally{await f.close();}
  await rename(tmp,this.path);const dir=await open(dirname(this.path),'r');try{await dir.sync();}finally{await dir.close();}
 }
}

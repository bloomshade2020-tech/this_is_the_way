import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createProjection,installLocal} from '../../local-shared-log/integration.mjs';
const {create}=createRequire(import.meta.url)('../../durable-state.js');
test('no default document, automatic activation, model-memory builder, or network transport',()=>{
 const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 assert(!html.includes('local-shared-log'));
 assert.throws(()=>createProjection({logId:'mock',namespace:'mock',collections:[]}),/INVALID_TARGET/);
 assert.throws(()=>installLocal({vault:{}}),/ALL_VAULT_WRITERS_GUARD_REQUIRED/);
 for(const f of ['core.mjs','integration.mjs','docs-adapter.mjs','chat-persistence.mjs']){
  const source=fs.readFileSync(new URL('../../local-shared-log/'+f,import.meta.url),'utf8');
  assert(!/\bfetch\s*\(/.test(source));
 }
});
test('scope changes on an existing ID cannot silently rewrite its original classification',async()=>{
 const projection=createProjection({documentId:'synthetic',logId:'mock',namespace:'mock',collections:[{key:'records',map:r=>({source:'vector',speaker:r.sender,channel:'here',scope:r.scope,kind:'original',occurredAt:r.at,body:r.text})}]});
 let disk={records:[]};const durable=create(structuredClone(disk),async next=>disk=next,projection);
 await durable.commit(next=>next.records.push({id:'one',text:' exact original ',at:'2026-10-24T00:00:00Z',sender:'me',scope:'outer'}));
 await assert.rejects(durable.commit(next=>next.records[0].scope='inner'),/EDIT_MAPPING_UNSET/);
 assert.equal(disk.sharedLogOutbox.entries[0].event.scope,'outer');
 assert.equal(disk.records[0].scope,'outer');
});

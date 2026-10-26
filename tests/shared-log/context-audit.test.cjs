const {test}=require('node:test'),assert=require('node:assert/strict');
const audit=require('../../context-audit.js');
const revision='snapshot_'+'a'.repeat(64),checkedAt='2026-10-26T00:00:00.000Z';
const receipt=()=>({status:'ready',revision,checkedAt,coverage:{fullHistory:false,eligibleChunks:12,includedChunks:3,omittedChunks:9,reasons:[{code:'NO_QUERY_MATCH',chunks:7},{code:'CONTEXT_BUDGET',chunks:2}]}});
const target={messageId:'synthetic-reply',channel:'comms'};
const message=(value,extra={})=>({id:target.messageId,sender:'din',text:'Synthetic original',generationAudit:value,...extra});
test('manual receipt is bounded, detached, linked to one reply and survives JSON restore',()=>{
 const input=receipt(),saved=audit.manual(input,target);input.coverage.reasons[0].chunks=1;
 assert.equal(saved.coverage.reasons[0].chunks,7);assert.equal(audit.inspect(message(JSON.parse(JSON.stringify(saved))),'comms').state,'recorded');
 assert.equal(audit.inspect(message(saved,{id:'different-reply'}),'comms').state,'invalid');
 assert.equal(audit.inspect(message(saved),'here').state,'invalid');
 assert.equal(audit.inspect(message(saved,{source:'scheduled'}),'comms').state,'invalid');
 assert.equal(audit.inspect(message(saved,{sender:'me'}),'comms').state,'not-applicable');
 assert.equal(audit.inspect(message(saved),'backstage').state,'not-applicable');
 assert.equal(audit.inspect(message(Object.fromEntries(Object.entries(saved).reverse())),'comms').state,'recorded');
});
test('missing and historical receipts stay unrecorded; unrelated latest status is never used',()=>{
 assert.equal(audit.manual(undefined,target).state,'not-recorded');assert.equal(audit.manual(null,target).state,'not-recorded');
 assert.equal(audit.inspect({id:'historical',sender:'din',sharedContext:{...receipt()}},'comms').state,'not-recorded');
 assert.match(audit.describe({id:'historical',sender:'din'},'here'),/未記録/);
 assert.equal(audit.manual(receipt(),{...target,channel:'backstage'}),undefined);
});
test('invalid, excessive and sensitive extra metadata is discarded without retaining payload',()=>{
 const bad=[false,[],{},'raw', {...receipt(),status:'pending'}, {...receipt(),revision:'arbitrary'}, {...receipt(),checkedAt:'not a date'}, {...receipt(),checkedAt:'2026-02-30T00:00:00.000Z'},
  {...receipt(),prompt:'SYNTHETIC_EXTRA_PRIVATE_TEXT'}, {...receipt(),authorization:'SYNTHETIC_FORBIDDEN_VALUE'}, {...receipt(),padding:'x'.repeat(5000)},
  {...receipt(),coverage:{...receipt().coverage,includedChunks:-1}}, {...receipt(),coverage:{...receipt().coverage,eligibleChunks:12001}},
  {...receipt(),coverage:{...receipt().coverage,omittedChunks:10}}, {...receipt(),coverage:{...receipt().coverage,reasons:[{code:{toString:null}}]}},
  {...receipt(),coverage:{...receipt().coverage,reasons:[{code:'UNKNOWN',chunks:2}]}}, {...receipt(),coverage:{...receipt().coverage,reasons:[{code:'NO_QUERY_MATCH',chunks:99}]}},
  {...receipt(),coverage:{...receipt().coverage,reasons:[{code:'NO_QUERY_MATCH',chunks:1},{code:'NO_QUERY_MATCH',chunks:1}]}},
  {...receipt(),coverage:{...receipt().coverage,sourceBody:'SYNTHETIC_EXTRA_PRIVATE_TEXT'}}];
 const cyclic={};cyclic.self=cyclic;bad.push(cyclic);
 for(const input of bad){const saved=audit.manual(input,target);assert.equal(saved.state,'invalid');assert.deepEqual(Object.keys(saved),['version','messageId','channel','origin','state']);assert(!JSON.stringify(saved).includes('SYNTHETIC_'));}
});
test('inbox records only the provided shared revision, not contextVersion or receipt timestamp',()=>{
 const partial=audit.notification({id:'notice',sharedContextRevision:revision,contextVersion:'legacy-context',at:checkedAt});
 assert.equal(partial.state,'revision-only');assert.equal(audit.inspect(message(partial,{id:'notice',source:'scheduled'}),'comms').state,'revision-only');
 assert(!Object.hasOwn(partial,'checkedAt'));assert(!Object.hasOwn(partial,'coverage'));
 assert.equal(audit.notification({id:'old',contextVersion:revision,at:checkedAt}).state,'not-recorded');
 assert.equal(audit.notification({id:'invalid',sharedContextRevision:'x'.repeat(5000)}).state,'invalid');
 assert.match(audit.describe(message(partial,{id:'notice',source:'scheduled'}),'comms'),/版だけ/);
});
test('stored malformed data or cross-path receipts are never shown as recorded',()=>{
 const valid=audit.manual(receipt(),target);
 for(const patch of [{version:2},{messageId:'other'},{channel:'here'},{origin:'autonomous'},{state:'revision-only'},{extra:'SYNTHETIC_SECRET'}, {coverage:{}}])assert.equal(audit.inspect(message({...valid,...patch}),'comms').state,'invalid');
 assert.match(audit.describe(message({...valid,revision:'<script>SYNTHETIC</script>'}),'comms'),/確認できない/);
 assert(!audit.describe(message({...valid,revision:'<script>SYNTHETIC</script>'}),'comms').includes('<script>'));
});
test('audit metadata never changes canonical event/hash or notification context serialization',async()=>{
 const {createProjection}=await import('../../local-shared-log/integration.mjs');const {makeEvent}=await import('../../local-shared-log/core.mjs');
 const body={id:target.messageId,sender:'din',at:checkedAt,text:'  Synthetic original\n\t😀  '};
 const mapping=r=>({source:'vector',speaker:r.sender,channel:'comms',scope:'inner',kind:'original',occurredAt:r.at,body:r.text});
 const p=createProjection({documentId:'synthetic-doc',logId:'synthetic-log',namespace:'synthetic-device',collections:[{key:'apiMessages',map:mapping}]});
 const before={apiMessages:[]},next={apiMessages:[{...body,generationAudit:audit.manual(receipt(),target)}]};await p.prepare(next,before);
 const expected=await makeEvent({...mapping(body),logId:'synthetic-log',namespace:'synthetic-device',sourceRecordId:'apiMessages:'+body.id});
 assert.deepEqual(next.sharedLogOutbox.entries[0].event,expected);
 const {build}=require('../../notification-context.js');
 const opts={version:'synthetic-version',clientId:'synthetic-client',sequence:1,availability:'complete',coverage:{here:{knownEmpty:true},comms:{knownEmpty:false}}};
 const plain=build({apiMessages:[body]},[{...body,channel:'comms'}],opts);
 const audited=build(next,[{...next.apiMessages[0],channel:'comms'}],opts);assert.deepEqual(audited,plain);assert(!JSON.stringify(audited).includes(revision));
});

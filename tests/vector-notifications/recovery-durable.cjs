const assert=require('node:assert/strict'),{create}=require('../../durable-state'),{create:control}=require('../../notification-control');
(async()=>{
 let calls=0,fail=true,disk={notificationEnabled:true,notificationControl:{owner:'synthetic-owner-000000001',sequence:0,pending:{}}};
 const view=structuredClone(disk),d=create(view,async n=>{if(fail)throw Error('quota');disk=structuredClone(n)});const c=control(d,async()=>{calls++;return {}},()=> 'synthetic-new-owner-0000001');
 await assert.rejects(c.mutate('/notifications/disable'),/quota/);assert.equal(calls,0);assert.equal(d.snapshot().notificationEnabled,true);assert.deepEqual(d.snapshot().notificationControl.pending,{});
 fail=false;const e=control(d,async()=>{calls++;fail=true;return {}},()=> 'synthetic-new-owner-0000001');await assert.rejects(e.mutate('/notifications/disable'),/quota/);assert.equal(calls,1);assert(e.uncertain());assert(disk.notificationControl.pending[1]);console.log('PASS save before dispatch failure sends nothing; response success/local receipt write failure stays durable pending');
 let guardOK=true;fail=false;const f=control(d,async()=>{throw Error('must not dispatch')},()=> 'synthetic-new-owner-0000001');guardOK=false;await assert.rejects(f.mutate('/notifications/disable',{},()=>{if(!guardOK)throw Error('locked')}),/locked/);assert.equal(calls,1);console.log('PASS lock/cancel guard before control mutation');
})().catch(e=>{console.error(e);process.exitCode=1});

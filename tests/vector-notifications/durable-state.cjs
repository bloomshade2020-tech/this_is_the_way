const assert=require('node:assert/strict');const {create}=require('../../durable-state');
const clone=x=>structuredClone(x);const base=()=>({apiMessages:[],rp:[],draft:'old',settings:{theme:'a'},usage:{input:0}});const pause=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
(async()=>{
 let view=base(),disk=clone(view),first=pause(),writes=0,ack=0;const s=create(view,async candidate=>{if(++writes===1)await first.promise;disk=clone(candidate)});
 const chat=s.commit(n=>n.apiMessages.push({id:'chat',text:'reply'})).catch(()=>{});
 const notice=s.commit(n=>n.apiMessages.push({id:'notification',text:'notice'})).then(()=>ack++);
 first.reject(Error('disk full'));await Promise.all([chat,notice]);assert.equal(ack,1);assert.deepEqual(view.apiMessages.map(x=>x.id),['notification']);
 view.draft='new';view.settings.theme='b';await s.save();assert.deepEqual(disk.apiMessages.map(x=>x.id),['notification']);assert.equal(disk.draft,'new');
 // A queued settings snapshot from before a received notification cannot erase it.
 const got=s.commit(n=>n.apiMessages.push({id:'next',text:'N'}));view.settings.theme='c';const setting=s.save();await Promise.all([got,setting]);assert.equal(disk.apiMessages.length,2);
 // Later typing during encryption is not overwritten by commit publication.
 let gate=pause();const s2=create(view,async n=>{await gate.promise;disk=clone(n)});const clearing=s2.commit(n=>{n.draft=''});await Promise.resolve();view.draft='interruption';gate.resolve();await clearing;assert.equal(view.draft,'interruption');await s2.save();assert.equal(disk.draft,'interruption');
 await s2.close();await assert.rejects(s2.commit(n=>n.apiMessages.push({id:'late'})),/closing/);assert.equal(disk.apiMessages.length,2);
 // Failed receipt never acknowledges, retry after two failures succeeds and survives restart.
 view=base();disk=clone(view);let faults=2;const s3=create(view,async n=>{if(faults-->0)throw Error('quota');disk=clone(n)});
 for(let i=0;i<2;i++)await assert.rejects(s3.commit(n=>n.apiMessages.push({id:'retry',text:'R'})));assert.equal(disk.apiMessages.length,0);
 await s3.commit(n=>n.apiMessages.push({id:'retry',text:'R'}));const restarted=create(clone(disk),async n=>disk=clone(n));await restarted.save();assert.equal(disk.apiMessages[0].id,'retry');
 console.log('PASS: P1 exact save ordering; settings snapshot; typing during save; lock; two failures/retry/restart');
})().catch(e=>{console.error(e);process.exitCode=1});

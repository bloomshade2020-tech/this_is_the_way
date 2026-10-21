/* Local candidate: state mutations reach the encrypted vault through one commit queue. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keyed=a=>Array.isArray(a)&&a.every(x=>x&&typeof x.id==='string')&&new Set(a.map(x=>x.id)).size===a.length;
function diff(a,b,path=[],out=[]){
 if(equal(a,b))return out;
 if(keyed(a)&&keyed(b)){
  const old=new Map(a.map(x=>[x.id,x])),next=new Map(b.map(x=>[x.id,x]));
  for(const [id,v] of old)if(!next.has(id))out.push({path,kind:'remove',id,before:v});
  for(const [id,v] of next)if(!equal(old.get(id),v))out.push({path,kind:'item',id,before:old.get(id),after:v});
 }else if(a&&b&&!Array.isArray(a)&&!Array.isArray(b)&&typeof a==='object'&&typeof b==='object'){
  for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],[...path,k],out);
 }else out.push({path,kind:'value',before:a,after:b});
 return out;
}
function apply(state,ops,guard=false){
 for(const op of ops){let parent=state;for(const k of op.path.slice(0,-1))parent=parent[k]??=( {} );const key=op.path.at(-1);
  if(op.kind==='value'){if(guard&&!equal(parent[key],op.before)&&!equal(parent[key],op.after))continue;if(op.after===undefined)delete parent[key];else parent[key]=clone(op.after);}
  else{const list=parent[key];if(!Array.isArray(list))throw Error('Invalid record collection');const i=list.findIndex(x=>x.id===op.id);
   if(op.kind==='remove'){if(i>=0&&equal(list[i],op.before))list.splice(i,1);}
   else if(i<0)list.push(clone(op.after));else if(equal(list[i],op.before)||equal(list[i],op.after))list[i]=clone(op.after);else throw Error('Record ID conflict');
  }
 }return state;
}
function create(view,write,hooks={}){
 let committed=clone(view),tail=Promise.resolve(),closed=false;
 function enqueue(edit){if(closed)return Promise.reject(Error('Vault closing'));const run=tail.catch(()=>{}).then(async()=>{
  const before=clone(committed),candidate=clone(committed);const result=edit(candidate);hooks.prepare?.(candidate,before);await write(clone(candidate));committed=candidate;
  // Only committed deltas are published. Later typing/settings remain in the view.
  apply(view,diff(before,candidate),true);hooks.committed?.(clone(candidate),before);return result;
 });tail=run;return run;}
 return {commit:enqueue,save(){const ops=diff(committed,clone(view));return enqueue(next=>apply(next,ops));},snapshot:()=>clone(committed),
 async flush(){await tail;},async close(){closed=true;await tail;},reopen(){closed=false;}};
}
root.VectorDurableState={create,diff,apply};if(typeof module!=='undefined')module.exports=root.VectorDurableState;
})(typeof window==='undefined'?globalThis:window);

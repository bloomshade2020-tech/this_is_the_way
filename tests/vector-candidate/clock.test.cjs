const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../workers/din-comms-api/src/index.js'),'utf8').replace('export default {','globalThis.worker = {');
function setup(at){
 const RealDate=Date;class Clock extends RealDate{constructor(...args){super(...(args.length?args:[at]));}static now(){return RealDate.parse(at);}}
 const calls=[];
 const context=vm.createContext({Date:Clock,TextEncoder,TextDecoder,Response,Request,URL,crypto:require('node:crypto').webcrypto,console,
 fetch:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');calls.push(JSON.parse(options.body));return Response.json({output:[{type:'message',content:[{type:'output_text',text:'ローカルテスト返答'}]}]});}});
 vm.runInContext(source,context);
 return {context,calls,request:async(sentAt)=>{
 const response=await context.worker.fetch(new Request('https://example.invalid/chat',{method:'POST',headers:{Origin:'https://bloomshade2020-tech.github.io',Authorization:'Bearer '+'x'.repeat(32),'Content-Type':'application/json'},body:JSON.stringify({message:'架空のローカルテスト',instructions:'架空の場面：夕方。時刻を進めない。',channel:'comms',sentAt,history:[{role:'user',content:'[保存日時: 2020/01/01 00:00 JST] 過去の架空テスト'}]})}),{DIN_ACCESS_TOKEN:'x'.repeat(32),OPENAI_API_KEY:'mock-only',VECTOR_KV:new Proxy({},{get(){throw Error('KV access forbidden in tests')}})});
 assert.equal(response.status,200);return response.json();}};
}
for(const [at,expected] of [['2026-10-21T14:59:59Z','2026/10/21 23:59:59 JST'],['2026-10-21T15:00:00Z','2026/10/22 00:00:00 JST'],['2026-12-31T15:00:00Z','2027/01/01 00:00:00 JST'],['2024-02-29T15:00:00Z','2024/03/01 00:00:00 JST']]){
 test('server JST boundary '+at,async()=>{const s=setup(at);const response=await s.request('1999-12-31T23:59:00-05:00');assert.equal(response.receivedAt,new Date(at).toISOString());const p=s.calls[0];assert.ok(p.instructions.includes(expected));assert.match(p.instructions,/現在時刻の基準はサーバー受信時刻/);assert.match(p.instructions,/時計ずれ/);assert.match(p.instructions,/実時計の経過だけで物語内の時間を進めたり/);assert.match(p.instructions,/通常のRP・DIN COMMSには時刻報告/);assert.match(p.instructions,/架空の場面：夕方/);assert.equal(p.input[0].content,'[保存日時: 2020/01/01 00:00 JST] 過去の架空テスト');assert.equal(p.store,false);});
}
for(const invalid of [undefined,null,123,'','garbage','2026-10-21','2026-10-21T12:00:00','2026-02-30T12:00:00Z','2026-13-01T12:00:00Z','2026-10-21T24:00:00Z','2026-10-21T12:00:00+99:00'])test('invalid client time '+String(invalid),async()=>{const s=setup('2026-12-31T15:00:00Z');await s.request(invalid);assert.match(s.calls[0].instructions,/端末の送信時刻は未提供または無効/);assert.match(s.calls[0].instructions,/2027\/01\/01 00:00:00 JST/);});
test('explicit offsets and leap-day valid; future client time not authoritative',async()=>{const s=setup('2026-10-21T15:00:00Z');assert.equal(vm.runInContext("clientTimestamp('2024-02-29T09:00:00+09:00')",s.context),'2024-02-29T00:00:00.000Z');await s.request('2099-01-01T00:00:00Z');assert.match(s.calls[0].instructions,/2026\/10\/22 00:00:00 JST/);assert.match(s.calls[0].instructions,/現在時刻の基準にしない/);});

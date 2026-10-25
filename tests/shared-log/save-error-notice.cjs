const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../../app.js'),'utf8');
const autosave=app.slice(app.indexOf('function autosave()'),app.indexOf('function nav('));
async function simulate(message){const notices=[];const context={save:async()=>{throw Error(message);},notice:text=>notices.push(text),clearTimeout:()=>{},setTimeout:fn=>{fn();return 1;}};vm.createContext(context);vm.runInContext('let saveTimer;'+autosave+'autosave();',context);await Promise.resolve();await Promise.resolve();return notices;}
test('ID autosave failure explains identity guard and protects the visible draft without blaming capacity',async()=>{
 const notices=await simulate('DUPLICATE_SOURCE_ID');assert.equal(notices.length,1);assert.match(notices[0],/記録ID/);assert.match(notices[0],/下書きを控え/);assert.match(notices[0],/閉じない/);assert.doesNotMatch(notices[0],/空き容量|削除|初期化/);
});
test('unclassified save failure does not invent storage diagnosis or expose raw exception data',async()=>{
 const notices=await simulate('synthetic-private-error-detail');assert.equal(notices.length,1);assert.match(notices[0],/保存できません/);assert.match(notices[0],/下書きを控え/);assert.doesNotMatch(notices[0],/空き容量|synthetic-private-error-detail|削除|初期化/);
});

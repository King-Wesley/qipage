'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createDailyService,normalizeCopy}=require('../daily-service.cjs');
const copy={tagline:'让日常慢慢发光',note:'留一点空白，让今天的新风景轻轻走进来。',quote:'把眼前的小事认真安放，平凡的日子也会透出光。'};
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qipage-copy-test-'));let date='2026-10-27T02:00:00Z',fail=false,calls=0;
 const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 const network=async(url,options={})=>{
   if(url.includes('HPImageArchive'))return json({images:[{url:'/th?id=test.jpg',title:'山湖',copyright:'测试摄影'}]});
   if(url.includes('/th?'))return new Response(Buffer.from([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}});
   const body=JSON.parse(options.body);
   if(url.endsWith('/v1/tools/search'))return json({results:[]});
   let content={ok:true};
   if(body.messages[0].content.includes('每日配文编辑')){calls++;if(fail)throw new Error('offline');content=copy;}
   if(body.messages[0].content.includes('桌面壁纸'))content={id:JSON.parse(body.messages[1].content).candidates[0].id,reason:'干净的画面适合阅读'};
   return json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]});
 };
 const create=()=>createDailyService({root,fetchImpl:network,now:()=>new Date(date),schedule:false});
 const service=create();service.updateConfig({apiKey:'test-api-key-never-real'});
 t.after(()=>{service.close();fs.rmSync(root,{recursive:true,force:true});});
 return{root,service,create,day:value=>date=value,fail:()=>fail=true,calls:()=>calls};
}
test('daily copy generates once, survives restart and refreshes on a new Shanghai day',async t=>{
 const f=fixture(t);await f.service.refresh();assert.equal(f.calls(),1);assert.deepEqual(f.service.getState().copy,copy);assert.equal(f.service.getState().copyDate,'2026-10-27');
 await f.service.refresh();assert.equal(f.calls(),1);
 const restored=f.create();await restored.refresh();assert.equal(f.calls(),1);restored.close();
 f.day('2026-10-27T16:01:00Z');await f.service.refresh();assert.equal(f.calls(),2);assert.equal(f.service.getState().copyDate,'2026-10-28');
});
test('failed copy generation retains the prior copy and its true date',async t=>{
 const f=fixture(t);await f.service.refresh();f.day('2026-10-28T02:00:00Z');f.fail();await f.service.refresh();
 const state=f.service.getState();assert.equal(state.copyDate,'2026-10-27');assert.deepEqual(state.copy,copy);assert.match(state.copyMessage,/保留 2026-10-27/);assert.equal(state.wallpaperDate,'2026-10-28');
});
test('existing same-day news cache without copy is upgraded rather than silently skipped',async t=>{
 const f=fixture(t);await f.service.refresh();const file=path.join(f.root,'.private/daily.json'),saved=JSON.parse(fs.readFileSync(file));delete saved.copy;delete saved.copyDate;fs.writeFileSync(file,JSON.stringify(saved));
 const restored=f.create();await restored.refresh();assert.equal(f.calls(),2);assert.equal(restored.getState().copyDate,'2026-10-27');restored.close();
});
test('copy rejects HTML, URLs, empty fields, non-strings and overlong model output',()=>{
 for(const invalid of [{...copy,note:'<img src=x onerror=alert(1)>'},{...copy,quote:'https://example.org/read-this'},{...copy,tagline:''},{...copy,note:42},{...copy,quote:'长'.repeat(81)}])assert.throws(()=>normalizeCopy(invalid));
 assert.deepEqual(normalizeCopy(copy),copy);
});

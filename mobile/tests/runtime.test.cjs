'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {buildSync}=require('esbuild');
const output=path.join(__dirname,'../.test-build/runtime.cjs');
buildSync({entryPoints:[path.join(__dirname,'entry.js')],bundle:true,platform:'node',format:'cjs',outfile:output,
  inject:[path.join(__dirname,'../src/buffer-global.js')],alias:{'node:fs':path.join(__dirname,'../src/shims/fs.js'),'node:path':path.join(__dirname,'../src/shims/path.js'),'node:crypto':path.join(__dirname,'../src/shims/crypto.js')}});
function runtime(){delete require.cache[output];return require(output);}
const key='test-key-never-real';
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const instant='2026-10-27T02:00:00Z';
function mockNetwork(url,options={}){
  if(url.includes('HPImageArchive'))return Promise.resolve(response({images:[{url:'/th?id=test.jpg',title:'山湖',copyright:'测试摄影'}]}));
  if(url.includes('/th?'))return Promise.resolve(new Response(Buffer.from([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}}));
  const body=JSON.parse(options.body);assert.equal(options.headers.Authorization,'Bearer '+key);
  if(url.endsWith('/v1/tools/search'))return Promise.resolve(response({results:[{title:'今日科技进展',url:'https://example.org/news',date:'2026-10-27T01:00:00Z',summary:'可验证资料'}]}));
  let content={ok:true};
  if(body.messages[0].content.includes('新闻编辑'))content={news:[{id:'n0',summary:'只使用候选事实的摘要',why:'与关注领域相关'}]};
  if(body.messages[0].content.includes('桌面壁纸'))content={id:JSON.parse(body.messages[1].content).candidates[0].id,reason:'干净的山湖风景'};
  return Promise.resolve(response({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]}));
}
test('phone refresh persists key, news and binary wallpaper across cold starts',async()=>{
  const first=runtime();let saved='';let writes=0;
  const store={read:async()=>({value:saved}),write:async({value})=>{saved=value;writes++;}};
  await first.initializeStorage(store);
  const daily=first.createDailyService({root:'/phone',schedule:false,now:()=>new Date(instant),fetchImpl:mockNetwork});
  daily.updateConfig({apiKey:key,topics:'人工智能'});await first.flush();
  assert.equal(daily.getConfig().configured,true);assert.equal(JSON.stringify(daily.getConfig()).includes(key),false);
  await daily.test();await daily.refresh();await first.flush();
  assert.equal(daily.getState().news.length,1);assert.equal(daily.getState().newsDate,'2026-10-27');
  assert.deepEqual([...first.readFileSync(daily.wallpaperPath)],[255,216,255,217]);assert.ok(writes>=3);
  daily.close();
  const second=runtime();await second.initializeStorage(store);
  const restored=second.createDailyService({root:'/phone',schedule:false,now:()=>new Date(instant),fetchImpl:mockNetwork});
  assert.equal(restored.getConfig().configured,true);assert.equal(restored.getState().news.length,1);
  assert.deepEqual([...second.readFileSync(restored.wallpaperPath)],[255,216,255,217]);
  restored.updateConfig({clearApiKey:true});await second.flush();assert.equal(restored.getConfig().configured,false);restored.close();
  const third=runtime();await third.initializeStorage(store);
  const removed=third.createDailyService({root:'/phone',schedule:false});assert.equal(removed.getConfig().configured,false);removed.close();
});
test('failed storage save is reported, and retry can persist',async()=>{
  const mobile=runtime();let fail=true,saved='';
  await mobile.initializeStorage({read:async()=>({value:'{}'}),write:async({value})=>{if(fail)throw new Error('disk full');saved=value;}});
  const daily=mobile.createDailyService({root:'/phone',schedule:false});
  daily.updateConfig({topics:'机器人'});await assert.rejects(mobile.flush(),/存储写入失败/);
  fail=false;daily.updateConfig({topics:'机器人'});await mobile.flush();assert.ok(saved.includes('config.json'));daily.close();
});
test('native transport preserves JSON and binary responses and HTTP errors',async()=>{
  const mobile=runtime();
  for(const [status,bytes,type] of [[200,Buffer.from('{"ok":true}'),'application/json'],[200,Buffer.from([255,216,255,217]),'image/jpeg'],[401,Buffer.from('{"error":"denied"}'),'application/json']]){
    const result=await mobile.nativeFetch('https://api.deepseek.com/chat/completions',{method:'POST',body:'{}',headers:{Authorization:'Bearer test'}},{request:async input=>{assert.equal(input.body,'{}');return{status,data:bytes.toString('base64'),headers:{'Content-Type':type}};}});
    assert.equal(result.ok,status===200);assert.equal(result.status,status);assert.deepEqual(Buffer.from(await result.arrayBuffer()),bytes);
  }
});
test('transport rejects foreign hosts, insecure URLs and canceled requests',async()=>{
  const mobile=runtime();let called=false;const http={request:async()=>{called=true;}};
  for(const url of ['http://api.deepseek.com/x','https://bing.com.evil.org/x','https://api.deepseek.com@evil.org/x','https://api.deepseek.com:444/x'])await assert.rejects(mobile.nativeFetch(url,{},http));
  const controller=new AbortController();controller.abort();await assert.rejects(mobile.nativeFetch('https://api.deepseek.com/x',{signal:controller.signal},http));assert.equal(called,false);
});
test('APK assets exclude desktop backend, credentials and repository files',()=>{
  const dist=path.join(__dirname,'../dist');
  assert.deepEqual(fs.readdirSync(dist).sort(),['android.css','android.js','app.js','assets','daily.css','daily.js','index.html','style.css'].sort());
  const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');assert.ok(html.indexOf('android.js')<html.indexOf('daily.js'));
  const app=fs.readFileSync(path.join(dist,'app.js'),'utf8');assert.ok(app.includes('window.qipageOpenUrl('));assert.ok(app.includes('QipageStyle'));assert.ok(html.includes('data-clock-style="analog"'));assert.equal(app.includes('adaptiveContrast'),false);
  const daily=fs.readFileSync(path.join(dist,'daily.js'),'utf8');assert.ok(daily.includes("url.protocol!=='blob:'"));
});

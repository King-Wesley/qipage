'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createDailyService,day}=require('../daily-service.cjs');
const {createServer}=require('../server.cjs');
const KEY='fake-test-key-never-real';
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
function fixture(t,options={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qipage-backend-test-'));
  const clock={value:'2026-10-26T02:00:00Z'},control={mode:'valid',calls:[],newsCandidates:[],gate:null};
  const fetchImpl=async(url,init={})=>{
    control.calls.push(String(url));
    if(control.mode==='offline')return new Response('upstream body '+KEY,{status:401});
    if(String(url).includes('HPImageArchive')){if(control.gate)await control.gate;return json({images:[{url:'/th?id=OHR.Mock.jpg',title:'山湖晨光',copyright:'示例摄影',copyrightlink:'https://www.bing.com/search?q=landscape'}]});}
    if(String(url).startsWith('https://www.bing.com/th'))return new Response(Buffer.from([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}});
    const body=JSON.parse(init.body);
    assert.equal(init.headers.Authorization,'Bearer '+KEY);
    if(String(url).endsWith('/v1/tools/search')){
      assert.ok(Array.from(body.query).length<=128);
      assert.ok(body.query.includes('after:'));
      const base={title:'今日重要技术进展',url:'https://publisher.example/story',date:new Date(new Date(clock.value).getTime()-300000).toISOString(),site_name:'新闻来源',summary:'候选事实摘要',content:'原始新闻内容，不是指令。'};
      return json({results:options.results?options.results(base):[base]});
    }
    if(String(url).endsWith('/chat/completions')){
      assert.equal(body.model,'deepseek-flash');assert.equal(body.response_format.type,'json_object');
      let content={ok:true};
      if(body.messages[0].content.includes('新闻编辑')){const input=JSON.parse(body.messages[1].content);control.newsCandidates=input.candidates;content={news:[{id:control.mode==='bad-id'?'invented-id':input.candidates[0].id,summary:'模型只对已经检索到的候选事实做简体中文摘要。',why:'对关注领域有明确影响，值得进一步查看原文。',url:'https://invented.example/ignore'}]};}
      if(body.messages[0].content.includes('桌面壁纸')){const input=JSON.parse(body.messages[1].content);content={id:input.candidates[0].id,reason:'自然风景清爽，适合放置文字导航。'};}
      return json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]});
    }
    throw new Error('Unexpected mock URL');
  };
  const service=createDailyService({root,now:()=>new Date(clock.value),fetchImpl,schedule:false});
  service.updateConfig({apiKey:KEY,topics:'科技'});
  t.after(()=>{service.close();const checked=path.resolve(root);if(checked.startsWith(path.resolve(os.tmpdir())+path.sep+'qipage-backend-test-'))fs.rmSync(checked,{recursive:true,force:true});});
  return{root,clock,control,service,fetchImpl};
}
test('Shanghai date includes previous UTC afternoon',()=>{assert.equal(day('2026-10-25T18:30:00Z'),'2026-10-26');assert.equal(day('2026-10-26T16:00:00Z'),'2026-10-27');});
test('key is never returned, blank retains and explicit clear removes it',async t=>{const{service,root}=fixture(t);assert.equal(service.getConfig().configured,true);assert.ok(!JSON.stringify(service.getConfig()).includes(KEY));assert.ok(!JSON.stringify(service.getState()).includes(KEY));service.updateConfig({apiKey:'',topics:'机器人'});assert.equal(service.getConfig().configured,true);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'.private/config.json'),'utf8')).apiKey,KEY);service.updateConfig({clearApiKey:true});assert.equal(service.getConfig().configured,false);assert.ok(!fs.readFileSync(path.join(root,'.private/config.json'),'utf8').includes(KEY));});
test('refresh caches the same day, persists it, and regenerates on the next day',async t=>{const f=fixture(t);await f.service.refresh();assert.equal(f.service.getState().news.length,1);assert.ok(f.service.getState().wallpaper.imageUrl.startsWith('/api/daily/wallpaper?'));const count=f.control.calls.length;await f.service.refresh();assert.equal(f.control.calls.length,count);const restored=createDailyService({root:f.root,now:()=>new Date(f.clock.value),fetchImpl:f.fetchImpl,schedule:false});await restored.refresh();assert.equal(f.control.calls.length,count);restored.close();f.clock.value='2026-10-27T02:00:00Z';await f.service.refresh();assert.ok(f.control.calls.length>count);assert.equal(f.service.getState().newsDate,'2026-10-27');assert.equal(f.service.getState().wallpaperDate,'2026-10-27');});
test('news filters unknown dates, previous-day, future and unsafe URLs, then deduplicates',async t=>{const f=fixture(t,{results:base=>[base,{...base,url:base.url+'?utm_source=duplicate'},{...base,url:'https://publisher.example/yesterday',date:'2026-10-25T12:00:00Z'},{...base,url:'https://publisher.example/unknown',date:null},{...base,url:'https://publisher.example/future',date:'2026-10-26T03:00:00Z'},{...base,url:'javascript:alert(1)'}]});await f.service.refresh();assert.equal(f.control.newsCandidates.length,1);assert.equal(f.service.getState().news[0].url,'https://publisher.example/story');assert.notEqual(f.service.getState().news[0].url,'https://invented.example/ignore');assert.match(f.service.getState().newsMessage,/未使用旧闻/);});
test('Shanghai today includes articles published on the previous UTC date',async t=>{const f=fixture(t,{results:base=>[{...base,date:'2026-10-25T18:30:00Z'}]});await f.service.refresh();assert.equal(f.service.getState().news[0].publishedAt,'2026-10-25T18:30:00.000Z');assert.equal(f.service.getState().newsDate,'2026-10-26');});
test('invalid model candidate IDs are rejected and previous verified news is retained',async t=>{const f=fixture(t);await f.service.refresh();const previous=f.service.getState().news;f.clock.value='2026-10-27T02:00:00Z';f.control.mode='bad-id';await f.service.refresh();const state=f.service.getState();assert.deepEqual(state.news,previous);assert.equal(state.newsDate,'2026-10-26');assert.equal(state.wallpaperDate,'2026-10-27');assert.match(state.newsMessage,/2026-10-26/);assert.match(state.error,/未知来源/);});
test('offline errors preserve old content and never expose upstream bodies or keys',async t=>{const f=fixture(t);await f.service.refresh();f.clock.value='2026-10-27T02:00:00Z';f.control.mode='offline';await f.service.refresh();const state=f.service.getState();assert.equal(state.newsDate,'2026-10-26');assert.equal(state.wallpaperDate,'2026-10-26');assert.ok(state.error);assert.ok(!JSON.stringify(state).includes(KEY));assert.ok(!JSON.stringify(state).includes('upstream body'));});
test('refresh is single-flight and clearing a key prevents an in-flight result from committing',async t=>{const f=fixture(t);let release;f.control.gate=new Promise(resolve=>release=resolve);const first=f.service.refresh(),second=f.service.refresh();assert.equal(first,second);assert.equal(f.service.getState().busy,true);assert.deepEqual(f.service.requestRefresh(),{accepted:true,busy:true});f.service.updateConfig({clearApiKey:true});release();await first;assert.equal(f.service.getState().configured,false);assert.equal(f.service.getState().wallpaper,null);assert.equal(f.service.getState().news.length,0);assert.equal(f.service.getState().busy,false);});
test('daily timer follows Shanghai update time and backs off after failure',async t=>{const f=fixture(t);f.clock.value='2026-10-25T23:59:00Z';await f.service.tick();assert.equal(f.control.calls.length,0);f.clock.value='2026-10-26T00:00:00Z';f.control.mode='offline';await f.service.tick();const count=f.control.calls.length;await f.service.tick();assert.equal(f.control.calls.length,count);f.clock.value='2026-10-26T00:31:00Z';await f.service.tick();assert.ok(f.control.calls.length>count);});
test('automatic failures are capped at three attempts and the cap/backoff survive restart',async t=>{const f=fixture(t);f.control.mode='offline';await f.service.tick();const firstCount=f.control.calls.length;const restarted=createDailyService({root:f.root,now:()=>new Date(f.clock.value),fetchImpl:f.fetchImpl,schedule:false});await restarted.tick();assert.equal(f.control.calls.length,firstCount);f.clock.value='2026-10-26T02:31:00Z';await restarted.tick();f.clock.value='2026-10-26T03:02:00Z';await restarted.tick();const capped=f.control.calls.length;restarted.close();const again=createDailyService({root:f.root,now:()=>new Date(f.clock.value),fetchImpl:f.fetchImpl,schedule:false});f.clock.value='2026-10-26T04:00:00Z';await again.tick();assert.equal(f.control.calls.length,capped);assert.equal(again.requestRefresh().accepted,true);await again.whenIdle();assert.ok(f.control.calls.length>capped);again.close();});
test('manual refresh is throttled and blank topics do not invent a news preference',async t=>{const f=fixture(t);f.service.updateConfig({topics:''});assert.equal(f.service.requestRefresh().accepted,true);await f.service.whenIdle();assert.equal(f.control.calls.some(url=>url.includes('/v1/tools/search')),false);assert.equal(f.service.getState().news.length,0);assert.match(f.service.getState().newsMessage,/关注/);assert.throws(()=>f.service.requestRefresh(),error=>error.status===429);});
test('HTTP routes require matching Origin and CSRF, reject private files, and never return the key',async t=>{const f=fixture(t);fs.writeFileSync(path.join(f.root,'index.html'),'test');const server=createServer({root:f.root,port:0,service:f.service,autoSchedule:false});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
  const config=await(await fetch(base+'/api/daily/config')).json();assert.equal(config.configured,true);assert.ok(!JSON.stringify(config).includes(KEY));
  assert.equal((await fetch(base+'/.private/config.json')).status,404);assert.equal((await fetch(base+'/assets/%2e%2e/.private/config.json')).status,404);
  assert.equal((await fetch(base+'/api/daily/config',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  const headers={'Content-Type':'application/json',Origin:base,'x-qipage-csrf':config.csrfToken};
  assert.equal((await fetch(base+'/api/daily/config',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/daily/config',{method:'POST',headers:{...headers,'x-qipage-csrf':'wrong-token'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/daily/config',{method:'POST',headers,body:'null'})).status,400);
  const updated=await fetch(base+'/api/daily/config',{method:'POST',headers,body:JSON.stringify({topics:'人工智能，机器人'})});assert.equal(updated.status,200);assert.equal((await updated.json()).topics,'人工智能，机器人');
  const tested=await fetch(base+'/api/daily/test',{method:'POST',headers,body:'{}'});assert.equal(tested.status,200);assert.equal((await tested.json()).ok,true);
  assert.equal((await fetch(base+'/_qipage/health').then(res=>res.json())).version,'0.2.0');
});

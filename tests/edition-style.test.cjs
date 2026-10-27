'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
test('clock controls, daily wallpaper and DeepSeek settings coexist after the merge',async()=>{
  const root=path.join(__dirname,'..'),errors=[],log=new VirtualConsole();log.on('jsdomError',error=>errors.push(error));
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://qipage.test',runScripts:'outside-only',virtualConsole:log});
  const win=dom.window;win.structuredClone=structuredClone;win.setInterval=()=>0;win.setTimeout=()=>0;
  win.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};win.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  win.fetch=async url=>({ok:true,json:async()=>String(url).endsWith('/config')?{configured:false,csrfToken:'test',model:'deepseek-flash',topics:'',newsCount:5,updateTime:'08:00',enabled:true,wallpaperStyle:''}:{configured:true,enabled:true,busy:false,news:[],wallpaper:null,copy:{tagline:'今天也去发现美好',note:'世界很大，今天从喜欢的地方出发。',quote:'沿途的小小风景，也值得慢慢收藏。'},copyDate:'2020-01-01',copyMessage:'使用上次内容'}});
  win.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'daily.js'),'utf8'));
  await new Promise(setImmediate);
  const doc=win.document;doc.querySelector('button[data-clock-style="analog"]').click();doc.querySelector('button[data-scene="daily"]').click();
  assert.equal(doc.getElementById('greeting-note').textContent,'世界很大，今天从喜欢的地方出发。');win.eval('updateTime()');assert.equal(doc.getElementById('greeting-note').textContent,'世界很大，今天从喜欢的地方出发。');assert.match(doc.getElementById('daily-copy-status').textContent,/上次 AI 配文.*2020/);assert.equal(doc.getElementById('daily-tagline').textContent,'今天也去发现美好');assert.equal(doc.body.dataset.clockStyle,'analog');assert.match(doc.getElementById('scene-label').textContent,/每日甄选/);
  doc.getElementById('daily-top-button').click();await new Promise(setImmediate);
  assert.equal(doc.getElementById('daily-settings-dialog').open,true);assert.match(doc.getElementById('daily-key-status').textContent,/尚未配置/);
  assert.equal(doc.getElementById('daily-model').value,'deepseek-flash');assert.equal(errors.length,0);
  dom.window.close();
});

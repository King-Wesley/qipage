const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..');
function page(saved,failSave=false){
  const errors=[];const log=new VirtualConsole();log.on('jsdomError',error=>errors.push(error));
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://qipage.test/',runScripts:'outside-only',virtualConsole:log});
  const win=dom.window;win.structuredClone=structuredClone;win.setInterval=()=>0;win.clearInterval=()=>{};
  win.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  win.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  if(saved)win.localStorage.setItem('qipage-v1',JSON.stringify(saved));
  if(failSave)Object.defineProperty(win.Storage.prototype,'setItem',{value(){throw new Error('QuotaExceeded');}});
  win.eval(fs.readFileSync(path.join(root,'style-config.js'),'utf8'));
  win.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));
  return{win,dom,errors,doc:win.document,stored:()=>JSON.parse(win.localStorage.getItem('qipage-v1'))};
}
test('full page starts with old preferences and bookmarks; every clock style can be selected and restored',()=>{
  const original={settings:{name:'小王',scene:'forest',theme:'light',dim:45},links:[{id:'mine',name:'我的网址',url:'https://example.org/',category:'常用'}]};
  const {win,dom,doc,errors,stored}=page(original);
  assert.equal(doc.body.dataset.clockStyle,'minimal');assert.equal(doc.documentElement.style.getPropertyValue('--clock-color'),'#ffffff');
  for(const style of ['cards','stacked','analog','minimal']){
    doc.querySelector(`button[data-clock-style="${style}"]`).click();
    assert.equal(doc.body.dataset.clockStyle,style);assert.equal(stored().settings.clockStyle,style);
    assert.equal(doc.querySelectorAll('button[data-clock-style][aria-pressed="true"]').length,1);
  }
  assert.equal(stored().settings.scene,'forest');assert.equal(stored().settings.dim,45);assert.equal(stored().links[0].id,'mine');
  assert.equal(doc.querySelector('.tile-name').textContent,'我的网址');assert.equal(stored().settings.theme,undefined);
  const reopened=page(stored());assert.equal(reopened.doc.body.dataset.clockStyle,'minimal');
  assert.equal(errors.length,0);reopened.dom.window.close();dom.window.close();
});
test('seconds/second hand, custom colors and panel mode respond to controls and persist across reload',()=>{
  const {win,dom,doc,errors,stored}=page();
  doc.querySelector('button[data-clock-style="analog"]').click();
  const seconds=doc.getElementById('clock-show-seconds');seconds.checked=true;seconds.dispatchEvent(new win.Event('change'));
  assert.equal(doc.getElementById('second-hand').hasAttribute('hidden'),false);assert.notEqual(doc.getElementById('second-hand').style.display,'none');
  const color=doc.getElementById('clock-color-input');color.value='#c6ddff';color.dispatchEvent(new win.Event('input'));
  assert.equal(doc.documentElement.style.getPropertyValue('--clock-color'),'#c6ddff');
  doc.querySelector('button[data-panel-style="solid"]').click();assert.equal(doc.body.dataset.panelStyle,'solid');
  doc.querySelector('button[data-hour-format="12"]').click();assert.ok(doc.getElementById('clock-period').textContent);assert.equal(doc.getElementById('clock-period').hidden,false);
  const restored=page(stored());assert.equal(restored.doc.body.dataset.clockStyle,'analog');assert.equal(restored.doc.getElementById('clock-show-seconds').checked,true);
  assert.equal(restored.doc.documentElement.style.getPropertyValue('--clock-color'),'#c6ddff');
  seconds.checked=false;seconds.dispatchEvent(new win.Event('change'));assert.equal(doc.getElementById('second-hand').hasAttribute('hidden'),true);
  assert.equal(errors.length,0);restored.dom.window.close();dom.window.close();
});
test('reset only changes styles and clicking unrelated controls never changes clock style',()=>{
  const {dom,doc,stored}=page({settings:{name:'测试',scene:'dusk',dim:50,clockStyle:'cards',clockColor:'#ffe0ae'},links:[{id:'one',name:'保留',url:'https://example.org',category:'常用'}]});
  doc.getElementById('settings-open').click();assert.equal(doc.getElementById('settings-dialog').open,true);
  assert.equal(doc.body.dataset.clockStyle,'cards');doc.querySelector('button[data-category="工作"]').click();assert.equal(doc.body.dataset.clockStyle,'cards');
  doc.getElementById('reset-style').click();assert.equal(doc.body.dataset.clockStyle,'minimal');assert.equal(stored().settings.clockColor,'#ffffff');
  assert.equal(stored().settings.scene,'dusk');assert.equal(stored().settings.dim,50);assert.equal(stored().links[0].id,'one');dom.window.close();
});
test('storage failure rolls back selected style and shows a visible error',()=>{
  const {dom,doc}=page(undefined,true);doc.querySelector('button[data-clock-style="cards"]').click();
  assert.equal(doc.body.dataset.clockStyle,'minimal');assert.match(doc.getElementById('toast').textContent,/无法保存/);dom.window.close();
});
test('automatic wallpaper contrast observers and black/white theme controls are removed',()=>{
  const script=fs.readFileSync(path.join(root,'app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'style.css'),'utf8');
  assert.equal(script.includes('adaptiveContrast'),false);assert.equal(script.includes('MutationObserver'),false);
  assert.equal(html.includes('data-theme='),false);assert.equal(css.includes('[data-adaptive-text'),false);
});

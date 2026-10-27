import {Capacitor,registerPlugin} from '@capacitor/core';
import {createDailyService} from '../../daily-service.cjs';
import {initializeStorage,flush,readFileSync} from './shims/fs.js';
import {nativeFetch} from './network.js';
const store=registerPlugin('QipageStore');
let service,wallpaperUrl=null,wallpaperStamp=null;
export const ready=(async()=>{
  if(!Capacitor.isNativePlatform())throw new Error('请安装栖页 APK 后使用每日内容。');
  await initializeStorage(store);
  service=createDailyService({root:'/qipage',fetchImpl:nativeFetch});
  service.start();
  const help=document.getElementById('daily-key-help');
  if(help)help.textContent='密钥使用安卓系统密钥加密后保存在此应用内，不会同步到 GitHub。卸载应用会清除。';
  document.querySelector('#daily-update-time')?.closest('section')?.querySelector('.field-help')?.replaceChildren(document.createTextNode('应用打开时按设定时间检查更新；退出后不常驻，重新打开会补更新。联网更新会使用你的 API 额度。'));
  return service;
})();
// Install synchronously so daily.js always waits for storage initialization.
window.qipageDaily={
  async api(path,body) {
    const daily=await ready;
    if(path==='/config') {
      const result=body===undefined?daily.getConfig():daily.updateConfig(body);
      await flush();return result;
    }
    if(path==='/test'){await flush();return daily.test();}
    if(path==='/refresh'){
      await flush();const accepted=daily.requestRefresh();
      return accepted;
    }
    if(path===''){
      await flush();const state=daily.getState();
      if(state.wallpaper){
        const stamp=state.generatedAt+state.wallpaper.id;
        if(stamp!==wallpaperStamp){
          if(wallpaperUrl)URL.revokeObjectURL(wallpaperUrl);
          wallpaperUrl=URL.createObjectURL(new Blob([readFileSync(daily.wallpaperPath)],{type:'image/jpeg'}));wallpaperStamp=stamp;
        }
        state.wallpaper.imageUrl=wallpaperUrl;
      }
      return state;
    }
    throw new Error('接口不存在。');
  }
};
ready.catch(()=>{console.error('Qipage initialization failed');});
function tick(){ready.then(daily=>daily.tick()).catch(()=>{});}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
// Keep remote pages outside the trusted app WebView; never attach the native bridge to them.
document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');
  if(!link||event.defaultPrevented)return;
  const url=new URL(link.href,location.href);
  if(['http:','https:'].includes(url.protocol)&&url.origin!==location.origin){event.preventDefault();void store.openUrl({url:url.href}).catch(()=>alert('未找到可打开网址的浏览器。'));}
});
window.qipageOpenUrl=url=>store.openUrl({url}).catch(()=>alert('未找到可打开网址的浏览器。'));
window.addEventListener('qipage:back',()=>{
  const dialog=document.querySelector('dialog[open]');
  if(dialog)dialog.close();
});


if(!localStorage.getItem('qipage-android-welcomed')){
  const welcome=document.createElement('dialog');welcome.className='android-welcome';
  welcome.innerHTML='<span class="eyebrow">栖页 · ANDROID</span><h2>喜欢的世界，随身携带。</h2><p>时钟、收藏和内置风景已经准备好，离线也能使用。</p><p>想看每日精选？连接你自己的 DeepSeek 账号即可。密钥加密保存在手机上，联网更新会使用你的 API 额度。</p><button class="drawer-done" id="android-start">开始使用 →</button>';
  document.body.append(welcome);welcome.showModal();
  const done=()=>{localStorage.setItem('qipage-android-welcomed','1');welcome.close();};
  welcome.querySelector('button').onclick=done;
  welcome.addEventListener('cancel',()=>localStorage.setItem('qipage-android-welcomed','1'));
}

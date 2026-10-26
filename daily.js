(function dailyEdition(){
  const get=id=>document.getElementById(id);
  const dialog=get('daily-settings-dialog');
  let config=null,state=null,pollTimer=null,loadingConfig=false,newsSignature='';
  function matchWallpaper(event){
    const {rgb,dark}=event.detail||{};
    if(!Array.isArray(rgb)||rgb.length!==3||rgb.some(value=>!Number.isFinite(value)))return;
    const panel=get('daily-panel'),mix=(weight,base)=>rgb.map(value=>Math.round(Math.max(0,Math.min(255,value))*weight+base*(1-weight)));
    const surface=dark?mix(.48,12):mix(.24,250);
    const accent=dark?mix(.38,218):mix(.25,48);
    panel.dataset.surfaceTheme=dark?'dark':'light';
    panel.style.setProperty('--daily-surface',`rgba(${surface.join(',')},${dark?.79:.84})`);
    panel.style.setProperty('--daily-accent-rgb',accent.join(','));
    panel.style.setProperty('--daily-border',dark?'rgba(224,240,224,.22)':'rgba(255,255,255,.68)');
    panel.style.setProperty('--daily-ink',dark?'#f0f5ef':'#20382c');
    panel.style.setProperty('--daily-muted',dark?'#c2d1c6':'#52675a');
  }
  document.addEventListener('qipage:wallpaper-tone',matchWallpaper);
  try{const saved=document.documentElement.dataset.wallpaperPalette;if(saved)matchWallpaper({detail:JSON.parse(saved)});}catch{}
  const dateNow=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function plainDate(value){return value?value.replaceAll('-',' / '):'';}
  function formatTime(value){if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return '';return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);}
  async function api(path,body){
    const options={cache:'no-store',headers:{Accept:'application/json'}};
    if(body!==undefined){options.method='POST';options.headers['Content-Type']='application/json';options.headers['x-qipage-csrf']=config?.csrfToken||'';options.body=JSON.stringify(body);}
    const response=await fetch('/api/daily'+path,options);
    let data;try{data=await response.json();}catch{throw new Error('每日服务尚未启动，请重新启动栖页本地服务。');}
    if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'请求未完成，请稍后重试。');
    return data;
  }
  function message(id,text,success){const el=get(id);el.textContent=text;el.className='daily-form-status '+(text?(success?'success':'error'):'');}
  function setBusy(value){['daily-save','daily-test','daily-remove-key'].forEach(id=>get(id).disabled=value);}
  function fillConfig(){
    get('daily-key-status').textContent=config.configured?'已配置密钥':'尚未配置';
    get('daily-key-status').classList.toggle('connected',config.configured);
    get('daily-api-key').placeholder=config.configured?'已保存；留空可保留原密钥':'粘贴你的 DeepSeek API Key';
    get('daily-model').value=config.model||'deepseek-flash';get('daily-topics').value=config.topics||'';
    get('daily-news-count').value=String(config.newsCount||5);get('daily-update-time').value=config.updateTime||'08:00';
    get('daily-enabled').checked=config.enabled!==false;get('daily-wallpaper-style').value=config.wallpaperStyle||'';
    get('daily-use-wallpaper').checked=settings.scene==='daily'||!config.configured;
    get('daily-remove-key').hidden=!config.configured;
  }
  async function loadConfig(){
    if(loadingConfig)return;
    loadingConfig=true;setBusy(true);
    try{config=await api('/config');fillConfig();}catch(error){message('daily-save-status',error.message,false);}finally{loadingConfig=false;setBusy(false);}
  }
  async function openSettings(){
    document.querySelectorAll('dialog[open]').forEach(d=>{if(d!==dialog)d.close();});
    if(!dialog.open)dialog.showModal();message('daily-save-status','',true);message('daily-test-result','',true);
    await loadConfig();
  }
  function renderWallpaper(){
    if(settings.scene!=='daily')return;
    const paper=state?.wallpaper;
    if(!paper?.imageUrl){
      document.querySelector('.landscape').style.backgroundImage='url("assets/lake.jpg")';
      get('scene-label').textContent='每日甄选 · 准备中';return;
    }
    const url=new URL(paper.imageUrl,location.origin);
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/daily/wallpaper'))return;
    url.searchParams.set('v',state.generatedAt||state.wallpaperDate||state.date||dateNow());
    document.querySelector('.landscape').style.backgroundImage=`url("${url.href}")`;
    const old=state.wallpaperDate&&state.wallpaperDate!==dateNow();
    get('scene-label').textContent=(old?'上次甄选 · ':'每日甄选 · ')+(paper.title||'新风景');
    const credit=document.querySelector('.photo-credit a');credit.hidden=false;credit.textContent='Bing';
    credit.href=safeUrl(paper.sourceUrl)||'https://www.bing.com/';credit.title=paper.copyright||'Bing 每日壁纸';
    document.querySelector('.credit-divider').hidden=false;
  }
  function renderNews(){
    const list=get('daily-news-list');
    const entries=Array.isArray(state?.news)?state.news:[];
    const signature=JSON.stringify(entries),changed=signature!==newsSignature;
    if(changed){list.replaceChildren();newsSignature=signature;}
    if(changed)entries.forEach((news,index)=>{
      const href=safeUrl(news.url);if(!href)return;
      const row=document.createElement('article');row.className='daily-news-item';
      const number=document.createElement('span');number.className='daily-news-number';number.textContent=String(index+1).padStart(2,'0');
      const body=document.createElement('div');body.className='daily-news-body';
      const title=document.createElement('a');title.className='daily-news-title';title.textContent=news.title;title.href=href;title.target='_blank';title.rel='noopener noreferrer';
      const summary=document.createElement('p');summary.className='daily-news-summary';summary.textContent=news.summary||'';
      const source=document.createElement('div');source.className='daily-news-source';
      const origin=document.createElement('span');origin.textContent=news.source||new URL(href).hostname;
      const time=document.createElement('time');time.dateTime=news.publishedAt||'';time.textContent=formatTime(news.publishedAt);
      const link=document.createElement('a');link.href=href;link.textContent='阅读原文 ↗';link.target='_blank';link.rel='noopener noreferrer';source.append(origin,time,link);
      body.append(title,summary,source);
      if(news.why){const details=document.createElement('details');details.className='daily-news-why';const heading=document.createElement('summary');heading.textContent='为什么值得看';const why=document.createElement('p');why.textContent=news.why;details.append(heading,why);body.append(details);}
      row.append(number,body);list.append(row);
    });
    const empty=get('daily-empty');empty.hidden=entries.length>0;
    get('daily-connect').textContent=state?.configured?'调整关注领域 ↗':'连接 DeepSeek ↗';
    get('daily-empty-message').textContent=state?.newsMessage||(state?.configured?'填写你的关注领域，再点击“现在更新”，让 DeepSeek 开始筛选。':'连接 DeepSeek，填写关注领域，每天为你选出值得读的几条新闻。');
  }
  function renderState(){
    if(!state)return;
    const today=dateNow(),old=state.newsDate&&state.newsDate!==today;
    get('daily-date').textContent=state.newsDate?(old?'上次精选 · ':'')+plainDate(state.newsDate):plainDate(today);
    get('daily-state').textContent=state.busy?'DeepSeek 正在筛选…':!state.configured?'等待连接 DeepSeek':state.enabled===false?'自动更新已暂停':old?'保留上次内容，等待今日更新':state.news?.length?'已为你筛选 '+state.news.length+' 条':'等待每日更新';
    get('daily-refresh').disabled=Boolean(state.busy);
    const notices=[];if(state.error)notices.push(state.error);if(old)notices.push('以下是 '+state.newsDate+' 的上次结果，不是今日新闻。');
    get('daily-error').hidden=!notices.length;get('daily-error').textContent=notices.join(' ');
    get('daily-next-update').textContent=state.nextUpdateAt&&state.enabled?'下次 · '+formatTime(state.nextUpdateAt):'';
    const paper=state.wallpaper;
    get('daily-wallpaper-note').textContent=paper?((state.wallpaperDate!==today?'上次壁纸':'今日壁纸')+' · '+(paper.title||'每日甄选')+(paper.reason?' — '+paper.reason:'')):(state.wallpaperMessage||'从近期 Bing 每日图片中，为你挑一张新风景。');
    renderNews();renderWallpaper();
  }
  async function loadState(){
    clearTimeout(pollTimer);
    try{state=await api('');renderState();}catch(error){get('daily-state').textContent='每日服务未连接';get('daily-empty-message').textContent=error.message;get('daily-error').hidden=false;get('daily-error').textContent=error.message;}
    pollTimer=setTimeout(loadState,state?.busy?3000:60000);
  }
  async function saveForm(){
    if(!config)throw new Error('请等待配置读取完成后再保存。');
    const body={model:get('daily-model').value,topics:get('daily-topics').value.trim(),newsCount:Number(get('daily-news-count').value),updateTime:get('daily-update-time').value,enabled:get('daily-enabled').checked,wallpaperStyle:get('daily-wallpaper-style').value.trim()};
    const key=get('daily-api-key').value.trim();if(key)body.apiKey=key;
    const saved=await api('/config',body);
    const next=await api('/config');config=next;get('daily-api-key').value='';
    const use=get('daily-use-wallpaper').checked;
    if(use){settings.scene='daily';save();applySettings();}else if(settings.scene==='daily'){settings.scene='lake';save();applySettings();}
    fillConfig();get('daily-use-wallpaper').checked=use;await loadState();return saved;
  }
  get('daily-config-form').addEventListener('submit',async event=>{
    event.preventDefault();setBusy(true);message('daily-save-status','正在保存…',true);
    try{await saveForm();message('daily-save-status',config.configured?'设置已保存。可点“现在更新”生成第一份每日内容。':'设置已保存，填写 API Key 后即可连接。',true);}catch(error){message('daily-save-status',error.message,false);}finally{setBusy(false);}
  });
  get('daily-test').addEventListener('click',async()=>{
    setBusy(true);message('daily-test-result','正在保存并测试连接…',true);
    try{await saveForm();const result=await api('/test',{});message('daily-test-result',result.message||'连接成功，可以开始生成每日内容。',true);}catch(error){message('daily-test-result',error.message,false);}finally{setBusy(false);}
  });
  get('daily-remove-key').addEventListener('click',async()=>{
    if(!config)return;setBusy(true);
    try{await api('/config',{clearApiKey:true});config=await api('/config');get('daily-api-key').value='';fillConfig();message('daily-save-status','已移除本机保存的 API Key。',true);await loadState();}catch(error){message('daily-save-status',error.message,false);}finally{setBusy(false);}
  });
  get('daily-refresh').addEventListener('click',async()=>{
    if(!state?.configured){await openSettings();return;}
    get('daily-refresh').disabled=true;
    try{if(!config)config=await api('/config');await api('/refresh',{});state.busy=true;renderState();await loadState();}catch(error){toast(error.message);get('daily-refresh').disabled=false;}
  });
  ['daily-settings-button','daily-connect','daily-top-button','daily-open-from-settings'].forEach(id=>get(id)?.addEventListener('click',openSettings));
  get('daily-settings-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{get('daily-api-key').value='';});
  document.addEventListener('qipage:appearance',()=>{
    if(settings.scene!=='daily'){const credit=document.querySelector('.photo-credit a');credit.textContent='Unsplash';credit.href='https://unsplash.com';credit.removeAttribute('title');}
    renderWallpaper();
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadState();});
  loadState();
})();

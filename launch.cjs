const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {spawn}=require('node:child_process');
const url='http://127.0.0.1:4173/';
function ready(){return new Promise(resolve=>{const req=http.get(url+'_qipage/health',res=>{let data='';res.on('data',part=>data+=part);res.on('end',()=>{try{resolve(JSON.parse(data).app==='qipage-local');}catch{resolve(false);}});});req.on('error',()=>resolve(false));req.setTimeout(600,()=>{req.destroy();resolve(false);});});}
(async()=>{
  if(!await ready()){
    const service=spawn(process.execPath,[path.join(__dirname,'server.cjs')],{detached:true,windowsHide:true,stdio:'ignore'});service.on('error',()=>{});service.unref();
    for(let i=0;i<40&&!await ready();i++)await new Promise(resolve=>setTimeout(resolve,100));
    if(!await ready())throw new Error('Could not start Qipage at port 4173. The port may be in use.');
  }
  const locations=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(folder=>path.join(folder,'Google/Chrome/Application/chrome.exe'));
  const chrome=locations.find(file=>fs.existsSync(file));
  if(!chrome)throw new Error('Google Chrome was not found. Please open '+url+' in Chrome.');
  const browser=spawn(chrome,[url],{detached:true,stdio:'ignore',windowsHide:false});browser.on('error',error=>console.error(error.message));browser.unref();
  console.log('Qipage is ready: '+url);
})().catch(error=>{console.error(error.message);process.exitCode=1;});

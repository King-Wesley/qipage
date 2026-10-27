'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createDailyService,DailyError}=require('./daily-service.cjs');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
function createServer({root=__dirname,port=4173,service=createDailyService({root}),autoSchedule=true}={}){
  function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
  async function body(req){const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>8192)throw new DailyError('请求内容过大。',413);chunks.push(chunk);}let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new DailyError('请求格式应为 JSON。',400);}if(!input||typeof input!=='object'||Array.isArray(input))throw new DailyError('请求内容应为 JSON 对象。',400);return input;}
  const server=http.createServer(async(req,res)=>{
    const actualPort=server.address()?.port||port,host=req.headers.host;
    if(![`127.0.0.1:${actualPort}`,`localhost:${actualPort}`].includes(host)){json(res,403,{error:'此服务仅供本机访问。'});return;}
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://'+host).pathname);}catch{json(res,400,{error:'地址格式无效。'});return;}
    try{
      if(pathname==='/_qipage/health'){if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'请求方法不支持。'});return;}json(res,200,{app:'qipage-local',version:'0.2.0',port:actualPort});return;}
      if(pathname.startsWith('/api/daily')){
        if(req.method==='POST'){
          if(req.headers.origin!=='http://'+host||!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')||req.headers['x-qipage-csrf']!==service.csrfToken){json(res,403,{error:'请从本地网页重新打开设置后再试。'});return;}
          const input=await body(req);
          if(pathname==='/api/daily/config'){json(res,200,service.updateConfig(input));return;}
          if(pathname==='/api/daily/test'){json(res,200,await service.test());return;}
          if(pathname==='/api/daily/refresh'){json(res,202,service.requestRefresh());return;}
          json(res,404,{error:'接口不存在。'});return;
        }
        if(req.method!=='GET'){json(res,405,{error:'请求方法不支持。'});return;}
        if(pathname==='/api/daily/config'){json(res,200,service.getConfig());return;}
        if(pathname==='/api/daily'){json(res,200,service.getState());return;}
        if(pathname==='/api/daily/wallpaper'){if(!fs.existsSync(service.wallpaperPath)){json(res,404,{error:'每日壁纸尚未生成。'});return;}res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(service.wallpaperPath).pipe(res);return;}
        json(res,404,{error:'接口不存在。'});return;
      }
      if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'请求方法不支持。'});return;}
      const file=path.resolve(root,pathname==='/'?'index.html':pathname.slice(1)),relative=path.relative(root,file);
      if(!file.startsWith(root+path.sep)||!['index.html','style.css','app.js','daily.js','daily.css'].includes(relative)&&!(file.startsWith(path.join(root,'assets')+path.sep)&&/\.(jpe?g|png|webp)$/i.test(file))){json(res,404,{error:'文件不存在。'});return;}
      fs.readFile(file,(error,data)=>{if(error){json(res,404,{error:'文件不存在。'});return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);});
    }catch(error){json(res,error instanceof DailyError?error.status:500,{error:error instanceof DailyError?error.message:'操作未完成，请稍后重试。'});}
  });
  server.on('listening',()=>{if(autoSchedule)service.start();});server.on('close',()=>service.close());return server;
}
if(require.main===module){const port=Number(process.env.PORT)||4173;createServer({port}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+'/'));}
module.exports={createServer};

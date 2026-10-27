const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const port = Number(process.env.PORT) || 4173;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
http.createServer((req,res)=>{
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405).end();return; }
  let pathname;
  try {pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400).end();return;}
  if(pathname==='/_qipage/health'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({app:'qipage-local',port}));return;}
  const file=path.resolve(root,pathname==='/'?'index.html':pathname.slice(1));
  if(!file.startsWith(root+path.sep)||!['index.html','style.css','app.js','style-config.js'].includes(path.relative(root,file))&&!file.startsWith(path.join(root,'assets')+path.sep)){res.writeHead(404).end();return;}
  fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:data);
  });
}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+'/'));

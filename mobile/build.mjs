import {build} from 'esbuild';
import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('..'),out=path.resolve('dist');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const file of ['style.css','daily.css','assets'])await cp(path.join(root,file),path.join(out,file),{recursive:true});
let html=await readFile(path.join(root,'index.html'),'utf8');
html=html.replace('<script src="app.js" defer></script>','<script src="android.js" defer></script>\n  <script src="app.js" defer></script>');
html=html.replace('</head>','<link rel="stylesheet" href="android.css">\n</head>');
await writeFile(path.join(out,'index.html'),html);
let daily=await readFile(path.join(root,'daily.js'),'utf8');
daily=daily.replace("async function api(path,body){","async function api(path,body){\n    if(window.qipageDaily)return window.qipageDaily.api(path,body);");
daily=daily.replace("if(url.origin!==location.origin||!url.pathname.startsWith('/api/daily/wallpaper'))return;","if(window.qipageDaily){if(url.protocol!=='blob:'||url.origin!==location.origin)return;}else if(url.origin!==location.origin||!url.pathname.startsWith('/api/daily/wallpaper'))return;");
daily=daily.replace("url.searchParams.set('v',state.generatedAt||state.wallpaperDate||state.date||dateNow());","if(url.protocol!=='blob:')url.searchParams.set('v',state.generatedAt||state.wallpaperDate||state.date||dateNow());");
await writeFile(path.join(out,'daily.js'),daily);
let app=await readFile(path.join(root,'app.js'),'utf8');
app=app.replace('window.location.assign(ENGINES[settings.engine].url+encodeURIComponent(value))',"window.qipageOpenUrl(ENGINES[settings.engine].url+encodeURIComponent(value))");
await writeFile(path.join(out,'app.js'),app);
await cp('src/android.css',path.join(out,'android.css'));
await build({entryPoints:['src/android.js'],bundle:true,platform:'browser',format:'iife',target:'chrome100',outfile:path.join(out,'android.js'),
  inject:['src/buffer-global.js'],alias:{'node:fs':'./src/shims/fs.js','node:path':'./src/shims/path.js','node:crypto':'./src/shims/crypto.js'},
  legalComments:'eof'});
console.log('Built Android assets from desktop source; no secrets or desktop files included.');

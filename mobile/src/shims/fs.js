import {Buffer} from 'buffer';
const files=new Map();
const persistentNames=['config.json','daily.json','wallpaper.jpg'];
let store,queue=Promise.resolve(),writeError=null;
const name=file=>String(file).split('/').pop();
function persist() {
  // Capture each revision before queuing so a refresh cannot race a settings save.
  const snapshot={};
  for(const [file,data] of files)if(persistentNames.includes(file))snapshot[file]=data.toString('base64');
  const operation=queue.then(()=>store.write({value:JSON.stringify(snapshot)}));
  // Continue serializing after a failure, but report it to the caller through flush().
  queue=operation.catch(error=>{writeError=error;});
}
export async function initializeStorage(plugin) {
  store=plugin;
  const result=await store.read();
  const saved=JSON.parse(result.value||'{}');
  for(const key of persistentNames)if(typeof saved[key]==='string')files.set(key,Buffer.from(saved[key],'base64'));
}
export async function flush() {
  await queue;
  if(writeError){const error=writeError;writeError=null;throw new Error('手机存储写入失败，请重试。',{cause:error});}
}
export function mkdirSync() {}
export function existsSync(file) {return files.has(name(file));}
export function readFileSync(file,encoding) {
  if(!existsSync(file))throw new Error('ENOENT');
  const data=files.get(name(file));return encoding?data.toString(encoding):Buffer.from(data);
}
export function writeFileSync(file,data) {files.set(name(file),Buffer.from(data));}
export function renameSync(from,to) {
  const data=files.get(name(from));if(!data)throw new Error('ENOENT');
  files.set(name(to),data);files.delete(name(from));persist();
}
export default {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync};

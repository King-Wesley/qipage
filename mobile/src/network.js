import {registerPlugin} from '@capacitor/core';
const transport=registerPlugin('QipageStore');
import {Buffer} from 'buffer';
export function allowedRemoteUrl(input) {
  const url=new URL(input);
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw new Error('不支持的远程地址。');
  if(url.hostname!=='api.deepseek.com'&&url.hostname!=='bing.com'&&!url.hostname.endsWith('.bing.com'))throw new Error('不支持的远程地址。');
  return url;
}
export async function nativeFetch(input,options={},http=transport) {
  const url=allowedRemoteUrl(input);
  if(options.signal?.aborted)throw new Error('请求已取消。');
  const response=await http.request({
    url:url.href,method:options.method||'GET',headers:options.headers||{},
    ...(options.body?{body:options.body}:{}),
    responseType:'arraybuffer',connectTimeout:15000,readTimeout:45000,disableRedirects:true
  });
  if(options.signal?.aborted)throw new Error('请求已取消。');
  const bytes=Buffer.from(response.data,'base64');
  // Match the desktop service's response limit before exposing bytes to it.
  if(bytes.length>10485760)throw new Error('上游返回的内容过大。');
  const headers=new Headers(response.headers);
  return {ok:response.status>=200&&response.status<300,status:response.status,headers,
    arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
}

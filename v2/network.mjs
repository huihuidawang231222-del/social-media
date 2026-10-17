import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export function parseProxy(value){
  if(!value)return undefined;
  const parts=String(value).trim().split(';');
  const selected=parts.find(p=>p.startsWith('https='))||parts.find(p=>p.startsWith('http='))||parts[0];
  const address=selected.replace(/^(https?|socks)=/,'');
  const server=/^[a-z][a-z\d+.-]*:\/\//i.test(address)?address:'http://'+address;
  const url=new URL(server);
  if(!['http:','https:','socks5:'].includes(url.protocol)||url.username||url.password||!['','/'].includes(url.pathname)||url.search||url.hash)throw new Error('代理地址格式无效：请使用 http://主机:端口 或 socks5://主机:端口');
  return {server:url.protocol+'//'+url.host};
}
async function readRegistry(name){
  const {stdout}=await exec('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings','/v',name],{windowsHide:true,timeout:3000});
  return stdout.match(new RegExp(name+'\\s+REG_\\w+\\s+(.+)'))?.[1]?.trim();
}
export async function browserProxy({env=process.env,platform=process.platform,read=readRegistry}={}){
  if(env.COLLECTOR_PROXY)return parseProxy(env.COLLECTOR_PROXY);
  if(platform!=='win32')return undefined;
  try{if(Number(await read('ProxyEnable'))!==1)return undefined;return parseProxy(await read('ProxyServer'));}
  catch{return undefined;}
}

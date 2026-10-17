import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import '../extension/core.js';
export const Core=globalThis.CommentCollectorCore;
export function validateConfig(input) {
  if(!['bilibili','xiaohongshu','douyin'].includes(input.platform)) throw new Error('请选择支持的平台');
  const keywords=[...new Set(String(input.keywords || '').split(/[\n,，]/).map(s=>s.trim()).filter(Boolean))];
  if(!keywords.length || keywords.length>10 || keywords.some(s=>s.length>100)) throw new Error('请输入1–10个关键词，每个不超过100字');
  if(input.authorized!==true) throw new Error('请确认你有权采集这些内容');
  const integer=(key,value,min,max)=>{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${key}必须为${min}–${max}的整数`);return n;};
  const custom={};
  for(const key of ['item','text','author','time','likes']) {const v=String(input.custom?.[key] || '').trim();if(v.length>500)throw new Error('选择器过长');custom[key]=v;}
  if(input.mode && !['demo','live'].includes(input.mode))throw new Error('未知运行模式');
  return {mode:input.mode || 'live',platform:input.platform,keywords,filter:String(input.filter || '').slice(0,500),maxPosts:integer('帖子数',input.maxPosts??10,1,50),perPost:integer('每帖评论数',input.perPost??100,1,500),intervalMs:integer('间隔',input.intervalMs??4000,3000,30000),custom};
}
export function createTask(input) {
  return {id:randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),config:validateConfig(input),status:'queued',phase:'search',searchIndex:0,searchRound:0,posts:[],comments:[],events:[],message:'等待执行'};
}
export function log(task,message) {task.message=message;task.updatedAt=new Date().toISOString();task.events.push({at:task.updatedAt,message});task.events=task.events.slice(-100);}
export function publicTask(task) {
  const {comments,...rest}=task;
  return {...rest,commentCount:comments.length,posts:task.posts.map(({url,...post})=>post)};
}
export function postUrl(platform,value) {
  try {
    const u=new URL(value);if(u.protocol!=='https:')return null;
    if(Core.platform(u.hostname)!==platform)return null;
    if(platform==='bilibili'&&!/^\/video\/(BV[\da-z]+|av\d+)\/?$/i.test(u.pathname))return null;
    if(platform==='xiaohongshu'&&!/^\/(explore|search_result|discovery\/item)\/[\da-f]+\/?$/i.test(u.pathname))return null;
    if(platform==='douyin'&&!/^\/video\/\d+\/?$/.test(u.pathname)) {
      const id=u.searchParams.get('modal_id');if(!/^\d+$/.test(id || ''))return null;
      return 'https://www.douyin.com/video/'+id;
    }
    u.hash='';return u.href;
  } catch{return null;}
}
export function addPosts(task,urls) {
  const known=new Set(task.posts.map(p=>p.source_url));let added=0;
  for(const value of urls) {
    const url=postUrl(task.config.platform,value);if(!url)continue;
    const canonical=new URL(Core.canonical(url));
    if(task.config.platform==='xiaohongshu')canonical.pathname=canonical.pathname.replace(/^\/(search_result|discovery\/item)\//,'/explore/').replace(/\/$/,'');
    const source_url=canonical.href;if(known.has(source_url)){
      const existing=task.posts.find(p=>p.source_url===source_url);
      if(task.config.platform==='xiaohongshu'&&existing.status==='pending'&&!new URL(existing.url).searchParams.has('xsec_token')&&new URL(url).searchParams.has('xsec_token'))existing.url=url;
      continue;
    }
    if(task.posts.length>=task.config.maxPosts)break;
    known.add(source_url);task.posts.push({url,source_url,status:'pending',count:0,round:0,idle:0,error:''});added++;
  } return added;
}
export function addComments(task,post,rows) {
  const filtered=Core.filter(rows,task.config.filter);
  const normalized=filtered.map(row=>({...row,platform:task.config.platform,source_url:post.source_url,collected_at:row.collected_at || new Date().toISOString(),verification_status:'unverified',license_status:'not_reviewed'}));
  const known=new Set(task.comments.map(Core.key));const fresh=[];
  for(const row of normalized) {const key=Core.key(row);if(!known.has(key)&&post.count+fresh.length<task.config.perPost){known.add(key);fresh.push(row);}}
  task.comments.push(...fresh);post.count+=fresh.length;return fresh.length;
}
export class DiskStore {
  constructor(directory){this.directory=directory;this.queue=Promise.resolve();}
  async load(){await mkdir(this.directory,{recursive:true,mode:0o700});try{const data=JSON.parse(await readFile(path.join(this.directory,'tasks.json'),'utf8'));if(!Array.isArray(data))throw new Error('任务文件格式错误');return data;}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  save(tasks){const data=JSON.stringify(tasks);this.queue=this.queue.catch(()=>{}).then(async()=>{await mkdir(this.directory,{recursive:true,mode:0o700});const file=path.join(this.directory,'tasks.json');await writeFile(file+'.tmp',data,{mode:0o600});await rename(file+'.tmp',file);});return this.queue;}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateConfig,createTask,postUrl,addPosts,addComments,DiskStore} from '../v2/model.mjs';
import {Runner,AccessRequired} from '../v2/runner.mjs';
import {BrowserRouter,LiveBrowser,matchesSearch} from '../v2/browser.mjs';
import {makeServer} from '../v2/server.mjs';
const input={platform:'bilibili',keywords:'广州,双休',authorized:true,maxPosts:2,perPost:3,intervalMs:3000};
test('XHS search route and signed result URLs stay tied to the actual keyword and post',()=>{
  const keyword='广州 双休';
  assert.equal(matchesSearch('https://www.xiaohongshu.com/search_result_ai?keyword='+encodeURIComponent(encodeURIComponent(keyword)),keyword),true);
  assert.equal(matchesSearch('https://www.xiaohongshu.com/explore?keyword='+encodeURIComponent(keyword),keyword),false);
  assert.equal(matchesSearch('https://www.xiaohongshu.com/search_result_ai?keyword=other',keyword),false);
  const t=createTask({...input,platform:'xiaohongshu',maxPosts:1});
  const base='https://www.xiaohongshu.com';const id='0123456789abcdef01234567';
  addPosts(t,[`${base}/explore/${id}`,`${base}/search_result/${id}?xsec_token=synthetic&xsec_source=pc_search`,`${base}/user/profile/${id}`]);
  assert.equal(t.posts.length,1);assert.ok(t.posts[0].url.includes('xsec_token=synthetic'));assert.equal(t.posts[0].source_url,`${base}/explore/${id}`);
});
test('V2 navigation timeout pauses for user inspection without automatic retries',async()=>{
  const browser=new LiveBrowser('unused');browser.ensure=async()=>{};let calls=0;
  browser.page={async goto(){calls++;const e=new Error('Timeout 30000ms exceeded');e.name='TimeoutError';throw e;}};
  await assert.rejects(()=>browser.search('xiaohongshu','测试'),e=>e instanceof AccessRequired&&e.message.includes('页面加载超过30秒'));assert.equal(calls,1);
});
test('V2 navigation recovery checks login before retrying and bounds unstable navigation',async()=>{
  const browser=new LiveBrowser('unused');browser.wait=async()=>{};
  let calls=0,waits=0;
  browser.page={async evaluate(){calls++;if(calls===1)throw new Error('Execution context was destroyed, most likely because of a navigation');return calls===2?'':['post'];},async waitForLoadState(){waits++;}};
  assert.deepEqual(await browser.links(),['post']);assert.equal(calls,3);assert.equal(waits,1);
  calls=0;browser.page.evaluate=async()=>{if(++calls===1)throw new Error('Execution context was destroyed');return '请登录';};
  await assert.rejects(()=>browser.links(),e=>e instanceof AccessRequired&&e.message==='请登录');assert.equal(calls,2);
  calls=0;browser.page.evaluate=async()=>{calls++;throw new Error('Execution context was destroyed');};
  await assert.rejects(()=>browser.links(),e=>e instanceof AccessRequired&&e.message.includes('仍在跳转'));assert.equal(calls,2);
  calls=0;browser.page.evaluate=async()=>{calls++;throw new Error('Invalid selector');};
  await assert.rejects(()=>browser.links(),/Invalid selector/);assert.equal(calls,1);
});
const store=()=>({data:[],async load(){return structuredClone(this.data);},async save(tasks){this.data=structuredClone(tasks);}});
async function settled(r){for(let i=0;i<300;i++){if(!r.busy)return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('任务没有结束');}
class FakeBrowser {
  constructor(){this.round=0;this.opens=[];this.fail=false;this.block=false;}
  async ensure(){}async close(){}async search(){}async scrollSearch(){}async wait(){}async checkAccess(){if(this.block)throw new AccessRequired('请登录');}
  async links(){return ['https://www.bilibili.com/video/BVDEMO1','https://www.bilibili.com/video/BVDEMO2'];}
  async open(url){this.opens.push(url);this.round=0;if(this.fail&&url.endsWith('2'))throw new Error('模拟失败');}
  async extract(){return [{comment_id:String(this.round),author:'合成用户',text:'合成测试'+this.round}];}
  async scrollComments(){this.round++;}
}
test('V2 validates scope, task limits and explicit authorization',()=>{
  assert.equal(validateConfig(input).keywords.length,2);
  for(const changes of [{authorized:false},{platform:'evil'},{maxPosts:51},{perPost:501},{intervalMs:1},{keywords:''},{mode:'evil'}])assert.throws(()=>validateConfig({...input,...changes}));
});
test('V2 only queues target platform posts, deduplicates signed links and limits discoveries',()=>{
  assert.equal(postUrl('douyin','https://www.douyin.com/?modal_id=123'),'https://www.douyin.com/video/123');
  assert.equal(postUrl('bilibili','https://www.bilibili.com.evil.test/video/BV1'),null);
  assert.equal(postUrl('bilibili','https://space.bilibili.com/123'),null);
  assert.equal(postUrl('bilibili','http://www.bilibili.com/video/BV1'),null);
  const t=createTask(input);assert.equal(addPosts(t,['https://www.bilibili.com/video/BV1?track=1','https://www.bilibili.com/video/BV1?track=2','https://www.bilibili.com/video/BV2','https://www.bilibili.com/video/BV3']),2);
});
test('V2 comment caps and source normalization hold across resume',()=>{
  const t=createTask({...input,filter:'双休'});addPosts(t,['https://www.bilibili.com/video/BV1']);const p=t.posts[0];
  const rows=Array.from({length:8},(_,i)=>({text:'双休'+i,author:'合成',comment_id:String(i),source_url:'https://evil.test'}));
  assert.equal(addComments(t,p,rows),3);assert.equal(addComments(t,p,rows),0);assert.ok(t.comments.every(r=>r.source_url===p.source_url));
});
test('V2 runs search -> per-post extraction -> completed and retries failures without duplication',async()=>{
  const b=new FakeBrowser();b.fail=true;const r=new Runner(store(),b);await r.init();const t=await r.create(input);await settled(r);
  assert.equal(r.get(t.id).status,'completed');assert.equal(r.get(t.id).comments.length,3);assert.equal(r.get(t.id).posts[1].status,'failed');
  b.fail=false;await r.action(t.id,'retry');await settled(r);assert.equal(r.get(t.id).comments.length,6);assert.equal(r.get(t.id).posts.filter(p=>p.status==='done').length,2);
});
test('V2 pauses on login and continues the same task after user action',async()=>{
  const b=new FakeBrowser();b.block=true;const r=new Runner(store(),b);await r.init();const t=await r.create(input);await settled(r);
  assert.equal(r.get(t.id).status,'waiting_login');assert.equal(b.opens.length,0);
  b.block=false;await r.action(t.id,'resume');await settled(r);assert.equal(r.get(t.id).status,'completed');assert.equal(r.get(t.id).comments.length,6);
});
test('V2 login gate holds the whole queue so later jobs do not replace the verification window',async()=>{
  const b=new FakeBrowser();b.block=true;const r=new Runner(store(),b);await r.init();const first=await r.create(input);await settled(r);const second=await r.create(input);await settled(r);
  assert.equal(r.get(first.id).status,'waiting_login');assert.equal(r.get(second.id).status,'queued');assert.equal(b.opens.length,0);
  b.block=false;await r.action(first.id,'resume');await settled(r);assert.equal(r.get(first.id).status,'completed');assert.equal(r.get(second.id).status,'completed');
});
test('V2 resumes persisted progress after restart without recollecting completed posts',async()=>{
  const s=store(),b=new FakeBrowser();const t=createTask(input);addPosts(t,await b.links());t.searchIndex=2;t.status='running';t.posts[0].status='done';t.posts[0].count=1;t.comments=[{platform:'bilibili',source_url:t.posts[0].source_url,text:'合成旧评论',author:'合成'}];s.data=[t];
  const r=new Runner(s,b);await r.init();assert.equal(r.get(t.id).status,'paused');await r.action(t.id,'resume');await settled(r);assert.equal(b.opens.length,1);assert.equal(r.get(t.id).comments.length,4);
});
test('V2 user pause saves in-flight results and cancellation retains data',async()=>{
  const b=new FakeBrowser();let release;const ready=new Promise(resolve=>{b.extract=async()=>{resolve();return new Promise(done=>{release=()=>done([{text:'合成正在读取',author:'合成'}]);});};});
  const r=new Runner(store(),b);await r.init();const t=await r.create(input);await ready;await r.action(t.id,'pause');release();await settled(r);assert.equal(r.get(t.id).status,'paused');assert.equal(r.get(t.id).comments.length,1);
  await r.action(t.id,'cancel');assert.equal(r.get(t.id).status,'cancelled');assert.equal(r.get(t.id).comments.length,1);
});
test('V2 atomic disk persistence survives concurrent save requests',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'collector-v2-'));try{const s=new DiskStore(dir);await Promise.all([s.save([{id:'first'}]),s.save([{id:'last'}])]);assert.equal((await s.load())[0].id,'last');assert.equal(JSON.parse(await readFile(path.join(dir,'tasks.json'),'utf8')).length,1);}finally{await rm(dir,{recursive:true,force:true});}
});
test('V2 platform hold blocks live creation, login and resume without browser access',async()=>{
  const browser=new FakeBrowser();let accesses=0;browser.ensure=async()=>{accesses++;};browser.login=async()=>{accesses++;};
  const r=new Runner(store(),browser);await r.init();const old=createTask(input);old.status='paused';r.tasks.push(old);
  const {server,token}=makeServer(r,{blockedPlatforms:['bilibili']});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port,headers={'x-collector-token':token,'Content-Type':'application/json'};
  try{
    for(const [url,body]of [['/api/tasks',input],['/api/login',{platform:'bilibili'}],[`/api/tasks/${old.id}/resume`,{}],[`/api/tasks/${old.id}/retry`,{}]]){
      const response=await fetch(base+url,{method:'POST',headers,body:JSON.stringify(body)});assert.equal(response.status,409);assert.ok((await response.json()).error.includes('风控'));
    }
    assert.equal(accesses,0);assert.equal(r.tasks.length,1);assert.equal(old.status,'paused');
    assert.equal((await fetch(base+`/api/tasks/${old.id}/export`,{headers})).status,200);
    const response=await fetch(base+'/api/tasks',{method:'POST',headers,body:JSON.stringify({...input,mode:'demo'})});assert.equal(response.status,201);await settled(r);
  }finally{await r.shutdown();await new Promise(resolve=>server.close(resolve));}
});
test('V2 HTTP API demo flow, exports and local origin protections',async()=>{
  const r=new Runner(store(),new BrowserRouter('/unused-demo'));await r.init();const {server,token}=makeServer(r);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  try {
    assert.equal((await fetch(base+'/api/tasks')).status,403);
    assert.equal((await fetch(base+'/api/tasks',{headers:{'x-collector-token':token,Origin:'https://evil.test'}})).status,403);
    const page=await fetch(base);assert.ok((await page.text()).includes(token));assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    const headers={'x-collector-token':token,'Content-Type':'application/json'};
    const response=await fetch(base+'/api/tasks',{method:'POST',headers,body:JSON.stringify({...input,mode:'demo'})});assert.equal(response.status,201);const t=await response.json();await settled(r);
    const list=await(await fetch(base+'/api/tasks',{headers})).json();assert.equal(list.tasks[0].status,'completed');assert.equal(list.tasks[0].commentCount,6);assert.equal(list.tasks[0].comments,undefined);assert.equal(list.tasks[0].posts[0].url,undefined);
    const json=await(await fetch(base+`/api/tasks/${t.id}/export`,{headers})).json();assert.equal(json.mode,'demo');assert.ok(json.comments.every(c=>c.text.startsWith('[合成演示]')));
    const csv=await(await fetch(base+`/api/tasks/${t.id}/export?format=csv`,{headers})).text();assert.ok(csv.includes('source_url'));assert.ok(csv.includes('[合成演示]'));
    assert.equal((await fetch(base+'/private/v2/tasks.json',{headers})).status,404);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

// Runs the actual content script on a synthetic DOM. No browser/site access.
const {parseHTML}=require(process.env.LINKEDOM_MODULE || 'linkedom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
async function fixture(host,html,shadow=false) {
  const {document,HTMLElement}=parseHTML(html).window;
  HTMLElement.prototype.getClientRects=()=>[{}]; // No layout engine in this test.
  if(shadow) {
    const root=document.querySelector('bili-comment-renderer').attachShadow({mode:'open'});
    root.innerHTML='<bili-comment-user-info></bili-comment-user-info><div id="content"><i>置顶</i><bili-rich-text></bili-rich-text></div><bili-comment-action-buttons-renderer></bili-comment-action-buttons-renderer>';
    root.querySelector('bili-comment-user-info').attachShadow({mode:'open'}).innerHTML='<b id="user-name">模拟戊</b>';
    root.querySelector('bili-rich-text').attachShadow({mode:'open'}).innerHTML='<style>:host{color:red}</style><p id="contents">Shadow测试<img alt="[笑哭]"></p>';
    root.querySelector('bili-comment-action-buttons-renderer').attachShadow({mode:'open'}).innerHTML='<div id="pubdate">2026-10-17</div><div id="like"><span id="count">12</span></div>';
  }
  let listener,saved=[],scrolls=0,scheduled;
  const url=new URL('https://'+host+'/video/synthetic');
  const ctx=vm.createContext({document,location:{hostname:url.hostname,href:url.href},URL,console,innerHeight:800,getComputedStyle:()=>({overflowY:'visible'}),window:{scrollBy:()=>scrolls++},setTimeout:fn=>{scheduled=fn;return 1;},clearTimeout:()=>{scheduled=null;},chrome:{runtime:{onMessage:{addListener:fn=>{listener=fn;}},sendMessage:async req=>{const all=ctx.CommentCollectorCore.merge(saved,req.rows);const added=all.slice(saved.length,saved.length+req.remaining);saved.push(...added);return {added:added.length,total:saved.length};}}}});
  for(const file of ['core.js','content.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),ctx);
  const command=(action,options={authorized:true,limit:500,custom:{}})=>new Promise(resolve=>listener({type:'socialComments',action,options},{},resolve));
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  return {command,rows:()=>saved,clear:()=>{saved=[];},scrolls:()=>scrolls,scheduled:()=>scheduled,tick};
}
(async()=>{
  for(const [host,html,count,shadow] of [
    ['www.xiaohongshu.com','<div class="comment-item"><span class="author"><b class="name">模拟甲</b></span><div class="content">双休测试</div><i class="date">昨天</i></div>',1,false],
    ['www.douyin.com','<div data-e2e="comment-item"><b data-e2e="comment-user-name">模拟乙</b><span data-e2e="comment-content">双休测试</span></div>',1,false],
    ['www.bilibili.com','<div class="reply-item"><b class="user-name">模拟丙</b><span class="reply-content">双休测试</span><div class="sub-reply-item"><b class="sub-user-name">模拟丁</b><span class="reply-content">子评论测试</span></div></div>',2,false],
    ['www.bilibili.com','<bili-comment-renderer></bili-comment-renderer>',1,true]
  ]) {
    const f=await fixture(host,html,shadow);
    assert.ok(!(await f.command('scan')).error);assert.equal(f.rows().length,count);
    await f.command('scan');assert.equal(f.rows().length,count,'deduplicate');
    if(shadow){const row=f.rows()[0];assert.equal(row.text,'Shadow测试[笑哭]');assert.equal(row.author,'模拟戊');assert.equal(row.likes_raw,'12');assert.equal(row.published_at_raw,'2026-10-17');}
    if(count===2){assert.equal(f.rows()[0].text,'双休测试');assert.equal(f.rows()[1].author,'模拟丁');}
    assert.ok((await f.command('scan',{authorized:false})).error);
    assert.ok((await f.command('scan',{authorized:true,limit:1,custom:{item:'['}})).error);
    f.clear();await f.command('scan',{authorized:true,limit:1,keywords:'不存在的关键词',custom:{}});assert.equal(f.rows().length,0);
    await f.command('start',{authorized:true,limit:1,custom:{}});await f.tick();assert.equal(f.rows().length,1);assert.equal((await f.command('status')).running,false);
    f.clear();await f.command('start',{authorized:true,limit:500,custom:{}});await f.tick();assert.equal(f.scrolls(),1);assert.ok(f.scheduled());
    await f.command('stop');assert.equal(f.scheduled(),null);assert.equal((await f.command('status')).running,false);
    console.log('PASS offline DOM '+host+(shadow?' / nested Shadow DOM':''));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});

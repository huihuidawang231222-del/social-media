// Synthetic DOM integration tests; never contacts social platforms.
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    for(const [host,html,expected] of [
      ['www.xiaohongshu.com','<div class="comment-item"><span class="author"><b class="name">模拟甲</b></span><div class="content">双休测试</div><i class="date">昨天</i></div>',1],
      ['www.douyin.com','<div data-e2e="comment-item"><b data-e2e="comment-user-name">模拟乙</b><span data-e2e="comment-content">双休测试</span></div>',1],
      ['www.bilibili.com','<div class="reply-item"><b class="user-name">模拟丙</b><span class="reply-content">双休测试</span><div class="sub-reply-item"><b class="sub-user-name">模拟丁</b><span class="reply-content">子评论测试</span></div></div>',2],
      ['www.bilibili.com','<bili-comment-renderer></bili-comment-renderer>',1]
    ]) {
      const context=await browser.newContext();const page=await context.newPage();
      await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));
      await page.goto('https://'+host+'/video/synthetic');
      if(html.includes('bili-comment-renderer')) await page.evaluate(()=>{
        const r=document.querySelector('bili-comment-renderer').attachShadow({mode:'open'});
        r.innerHTML='<bili-comment-user-info></bili-comment-user-info><div id="content"><i>置顶</i><bili-rich-text></bili-rich-text></div><bili-comment-action-buttons-renderer></bili-comment-action-buttons-renderer>';
        r.querySelector('bili-comment-user-info').attachShadow({mode:'open'}).innerHTML='<b id="user-name">模拟戊</b>';
        r.querySelector('bili-rich-text').attachShadow({mode:'open'}).innerHTML='<style>:host{color:red}</style><p id="contents">Shadow测试<img alt="[笑哭]"></p>';
        r.querySelector('bili-comment-action-buttons-renderer').attachShadow({mode:'open'}).innerHTML='<div id="pubdate">2026-10-17</div><div id="like"><span id="count">12</span></div>';
      });
      await page.addScriptTag({path:path.join(__dirname,'core.js')});
      await page.evaluate(()=>{
        window.saved=[];window.listener=null;
        window.chrome={runtime:{onMessage:{addListener:f=>window.listener=f},sendMessage:async req=>{const rows=CommentCollectorCore.merge(window.saved,req.rows);const added=rows.slice(window.saved.length,window.saved.length+req.remaining);window.saved.push(...added);return {added:added.length,total:window.saved.length};}}};
        window.command=(action,options={authorized:true,limit:500,custom:{}})=>new Promise(resolve=>listener({type:'socialComments',action,options},{},resolve));
      });
      await page.addScriptTag({path:path.join(__dirname,'content.js')});
      const first=await page.evaluate(()=>command('scan'));
      assert.equal((await page.evaluate(()=>saved)).length,expected,JSON.stringify(first));
      if(html.includes('bili-comment-renderer')) {
        const [row]=await page.evaluate(()=>saved);
        assert.equal(row.text,'Shadow测试[笑哭]');assert.equal(row.author,'模拟戊');assert.equal(row.likes_raw,'12');assert.equal(row.published_at_raw,'2026-10-17');
      }
      await page.evaluate(()=>command('scan'));
      assert.equal((await page.evaluate(()=>saved)).length,expected,'repeat scan deduplicates');
      const denied=await page.evaluate(()=>command('scan',{authorized:false}));assert.ok(denied.error);
      const invalid=await page.evaluate(()=>command('scan',{authorized:true,limit:1,custom:{item:'['}}));assert.ok(invalid.error);
      await context.close();
      console.log('PASS synthetic DOM: '+host+(html.includes('bili-comment-renderer')?' shadow':''));
    }
    // Exercise the real storage worker with concurrent tab writes.
    const fs=require('node:fs'),vm=require('node:vm');const listeners=[];let state={};
    const ctx=vm.createContext({URL,console,importScripts:()=>{},chrome:{runtime:{onMessage:{addListener:f=>listeners.push(f)}},storage:{local:{get:async()=>({...state}),set:async x=>{await new Promise(r=>setTimeout(r,5));Object.assign(state,x);},remove:async k=>{delete state[k];}}}}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'core.js'),'utf8'),ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname,'worker.js'),'utf8'),ctx);
    const send=req=>new Promise(resolve=>listeners[0]({type:'socialComments-store',action:'merge',remaining:1,...req},{tab:{id:1}},resolve));
    const row={platform:'bilibili',source_url:'https://www.bilibili.com/video/test',text:'合成测试',author:'合成甲'};
    await Promise.all([send({rows:[row,{...row,text:'不能超出上限'}]}),send({rows:[{...row,author:'合成乙'}]})]);
    assert.equal(state.socialCommentsCommentsV1.length,2);
    await send({rows:[row]});assert.equal(state.socialCommentsCommentsV1.length,2);
    console.log('PASS worker concurrent writes, limit and deduplication');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

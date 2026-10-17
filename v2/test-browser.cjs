const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
  const [{Runner},{DiskStore},{BrowserRouter},{makeServer}]=await Promise.all([import('./runner.mjs'),import('./model.mjs'),import('./browser.mjs'),import('./server.mjs')]);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'collector-ui-'));const runner=new Runner(new DiskStore(dir),new BrowserRouter(dir));await runner.init();const {server}=makeServer(runner);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.COLLECTOR_TEST_BROWSER?{channel:process.env.COLLECTOR_TEST_BROWSER}:{})});const page=await browser.newPage({acceptDownloads:true});
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.getByLabel('运行模式').selectOption('demo');await page.locator('textarea[name="keywords"]').fill('合成浏览器演示');await page.getByLabel('最多帖子数').fill('2');await page.getByLabel('每帖最多评论').fill('3');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'创建并开始任务 →'}).click();
    await page.getByText('已结束',{exact:true}).waitFor({timeout:15000});assert.equal(runner.tasks[0].comments.length,6);
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'CSV',exact:true}).click();const download=await downloaded;const contents=await fs.readFile(await download.path(),'utf8');assert.ok(contents.includes('[合成演示]'));assert.ok(contents.includes('source_url'));
    await page.getByRole('button',{name:'详情 / 日志'}).click();await page.getByText('最近20条预览',{exact:true}).waitFor();
    await fs.mkdir(path.join(__dirname,'../private/v2-tests'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../private/v2-tests/workbench.png'),fullPage:true});
    console.log('PASS browser UI: create demo -> search/collect -> progress -> CSV download -> preview');
    const {LiveBrowser}=await import('./browser.mjs');const {createTask,addPosts}=await import('./model.mjs');
    const fixture=await browser.newContext();await fixture.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<textarea style="opacity:0.00001" placeholder="搜索小红书"></textarea><div><div><textarea id="search-input-in-feeds"></textarea></div><button class="single-line-search-btn">搜索</button></div><a href="/explore/ffffffffffffffffffffffff">首页推荐</a><div id="results"></div><script>document.querySelector('button').onclick=()=>{const keyword=document.querySelector('#search-input-in-feeds').value;history.pushState({},'', '/search_result_ai?keyword='+encodeURIComponent(encodeURIComponent(keyword)));document.querySelector('#results').innerHTML='<section class="note-item"><a class="cover" href="/search_result/0123456789abcdef01234567?xsec_token=synthetic&xsec_source=pc_search">合成搜索结果</a></section>';};</script>`}));
    const live=new LiveBrowser('/unused-fixture');live.context=fixture;live.page=await fixture.newPage();live.wait=async()=>{};
    await live.search('xiaohongshu','广州 双休');const urls=await live.links();const task=createTask({mode:'live',platform:'xiaohongshu',keywords:'广州 双休',authorized:true,maxPosts:1});addPosts(task,urls);
    assert.equal(urls.length,1,'exclude homepage and profile links');assert.equal(task.posts.length,1);assert.ok(task.posts[0].url.includes('xsec_token=synthetic'));assert.ok(task.posts[0].source_url.includes('/explore/'));await fixture.close();
    console.log('PASS XHS browser regression: ignore mirror textarea -> visible search button -> matching keyword route -> signed cover URL');
  }finally{await browser?.close();await runner.shutdown();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

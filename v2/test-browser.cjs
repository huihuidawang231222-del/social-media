const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
  const [{Runner},{DiskStore},{BrowserRouter},{makeServer}]=await Promise.all([import('./runner.mjs'),import('./model.mjs'),import('./browser.mjs'),import('./server.mjs')]);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'collector-ui-'));const runner=new Runner(new DiskStore(dir),new BrowserRouter(dir));await runner.init();const {server}=makeServer(runner);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try {
    browser=await chromium.launch({headless:true});const page=await browser.newPage({acceptDownloads:true});
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.getByLabel('运行模式').selectOption('demo');await page.locator('textarea[name="keywords"]').fill('合成浏览器演示');await page.getByLabel('最多帖子数').fill('2');await page.getByLabel('每帖最多评论').fill('3');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'创建并开始任务 →'}).click();
    await page.getByText('已结束',{exact:true}).waitFor({timeout:15000});assert.equal(runner.tasks[0].comments.length,6);
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'CSV',exact:true}).click();const download=await downloaded;const contents=await fs.readFile(await download.path(),'utf8');assert.ok(contents.includes('[合成演示]'));assert.ok(contents.includes('source_url'));
    await page.getByRole('button',{name:'详情 / 日志'}).click();await page.getByText('最近20条预览',{exact:true}).waitFor();
    await fs.mkdir(path.join(__dirname,'../private/v2-tests'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../private/v2-tests/workbench.png'),fullPage:true});
    console.log('PASS browser UI: create demo -> search/collect -> progress -> CSV download -> preview');
  }finally{await browser?.close();await runner.shutdown();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

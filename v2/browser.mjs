import path from 'node:path';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {Core} from './model.mjs';
import {AccessRequired} from './runner.mjs';
import {readComments,accessState,scrollCommentPage} from './page-functions.mjs';
export const sites={bilibili:{home:'https://www.bilibili.com',search:q=>'https://search.bilibili.com/all?keyword='+encodeURIComponent(q)},xiaohongshu:{home:'https://www.xiaohongshu.com',search:q=>'https://www.xiaohongshu.com/search_result?keyword='+encodeURIComponent(q)},douyin:{home:'https://www.douyin.com',search:q=>'https://www.douyin.com/search/'+encodeURIComponent(q)+'?type=video'}};
function adapter(config){const a={...Core.adapters[config.platform]};for(const [k,v]of Object.entries(config.custom||{}))if(v)a[k]=v;return a;}
export class LiveBrowser {
  constructor(directory){this.directory=directory;this.context=null;this.page=null;}
  async ensure(){if(this.context){if(!this.page||this.page.isClosed()){this.page=await this.context.newPage();this.page.setDefaultTimeout(12000);}return;}
    const require=createRequire(import.meta.url);let chromium;
    try{({chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'));}catch{throw new Error('请先在项目目录执行 npm install 安装依赖');}
    const channel=process.env.COLLECTOR_BROWSER||'chrome';if(!['chrome','msedge','chromium'].includes(channel))throw new Error('COLLECTOR_BROWSER仅支持chrome、msedge或chromium');
    try{this.context=await chromium.launchPersistentContext(path.join(this.directory,'browser-profile'),{headless:false,...(channel==='chromium'?{}:{channel}),viewport:{width:1280,height:850}});}catch{throw new Error('无法启动采集浏览器：请安装Chrome，或设置COLLECTOR_BROWSER=msedge；使用Chromium需先执行 npx playwright install chromium。请关闭占用同一采集配置的进程。');}
    this.context.on('close',()=>{this.context=null;this.page=null;});this.page=await this.context.newPage();this.page.setDefaultTimeout(12000);
  }
  async open(url){await this.ensure();const response=await this.page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});if(response&&[401,403,429].includes(response.status()))throw new AccessRequired(`平台返回访问限制（${response.status()}），任务已暂停。请检查采集窗口，稍后手动继续。`);await this.wait(2000);}
  async login(platform){await this.open(sites[platform].home);await this.page.bringToFront();}
  async search(platform,keyword){await this.open(sites[platform].search(keyword));}
  async checkAccess(){const message=await this.page.evaluate(accessState);if(message)throw new AccessRequired(message);}
  async links(){return this.page.locator('a[href]').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>el.href));}
  async prepareComments(config){if(config.platform!=='douyin')return;const buttons=await this.page.locator('[data-e2e="feed-comment-icon"], button[aria-label="评论"]').all();for(const button of buttons)if(await button.isVisible()){await button.click();await this.wait(1500);break;}}
  async extract(config){return this.page.evaluate(readComments,adapter(config));}
  async scrollComments(config){await this.page.evaluate(scrollCommentPage,adapter(config));}
  async scrollSearch(){await this.page.mouse.wheel(0,750);}
  async wait(ms){await delay(ms);}
  async close(){await this.context?.close();}
}
export class DemoBrowser {
  async ensure(){} async close(){} async checkAccess(){} async scrollSearch(){} async scrollComments(){this.round++;} async wait(){await delay(50);}
  async search(platform,keyword){this.platform=platform;this.keyword=keyword;}
  async links(){return Array.from({length:5},(_,i)=>this.platform==='bilibili'?`https://www.bilibili.com/video/BVDEMO${i+1}`:this.platform==='xiaohongshu'?`https://www.xiaohongshu.com/explore/00000000000000000000000${i+1}`:`https://www.douyin.com/video/000000000000000000${i+1}`);}
  async open(url){this.url=url;this.round=0;}
  async extract(){return Array.from({length:10},(_,i)=>({comment_id:'demo-'+this.round+'-'+i,author:'合成用户'+i,text:`[合成演示] ${this.keyword} 评论样例 ${this.round*10+i+1}`,published_at_raw:'演示时间',likes_raw:String(i),is_demo:true}));}
}
export class BrowserRouter {
  constructor(directory){this.live=new LiveBrowser(directory);this.demo=new DemoBrowser();this.driver=this.live;}
  async prepare(config){this.driver=config.mode==='demo'?this.demo:this.live;}
  async login(platform){return this.live.login(platform);}
  async ensure(){return this.driver.ensure();}async search(...args){return this.driver.search(...args);}async links(){return this.driver.links();}async checkAccess(...args){return this.driver.checkAccess(...args);}async open(...args){return this.driver.open(...args);}async prepareComments(...args){return this.driver.prepareComments?.(...args);}async extract(...args){return this.driver.extract(...args);}async scrollComments(...args){return this.driver.scrollComments(...args);}async scrollSearch(){return this.driver.scrollSearch();}async wait(ms){return this.driver.wait(ms);}async close(){return this.live.close();}
}

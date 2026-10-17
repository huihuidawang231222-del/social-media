import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DiskStore,Core,publicTask} from './model.mjs';
import {Runner} from './runner.mjs';
import {BrowserRouter,sites} from './browser.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
async function jsonBody(req){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>32768)throw new Error('请求内容过长');}return JSON.parse(body||'{}');}
export function makeServer(runner,{token=randomBytes(32).toString('hex'),blockedPlatforms=(process.env.COLLECTOR_BLOCKED_PLATFORMS||'').split(',').filter(Boolean)}={}) {
  const blocked=new Set(blockedPlatforms);
  const holdMessage='该平台的真实采集已暂停：已报告访问风控，暂不创建、继续任务或自动打开平台。合成演示仍可使用。';
  let loginBusy=false;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send=(status,data,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});res.end(type.startsWith('application/json')?JSON.stringify(data):data);};
    try {
      const port=server.address().port;const allowed=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
      if(!allowed.has(req.headers.host))return send(403,{error:'仅允许本机访问'});
      if(req.headers.origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin))return send(403,{error:'来源不允许'});
      const url=new URL(req.url,`http://127.0.0.1:${port}`);
      if(url.pathname.startsWith('/api/')){
        if(!equal(req.headers['x-collector-token'],token))return send(403,{error:'请求凭证无效，请重新打开本地首页'});
        if(req.method==='GET'&&url.pathname==='/api/tasks')return send(200,{tasks:runner.list(),active:runner.active});
        if(req.method==='POST'&&url.pathname==='/api/tasks'){const input=await jsonBody(req);if(input.mode!=='demo'&&blocked.has(input.platform))return send(409,{error:holdMessage});return send(201,await runner.create(input));}
        if(req.method==='POST'&&url.pathname==='/api/login'){
          const {platform}=await jsonBody(req);if(!sites[platform])throw new Error('平台无效');
          if(blocked.has(platform))return send(409,{error:holdMessage});
          if(runner.busy||loginBusy)return send(409,{error:'请先暂停任务，并等待当前操作结束后再打开登录页面'});
          loginBusy=true;try{await runner.browser.login(platform);}finally{loginBusy=false;}return send(200,{message:'已打开采集浏览器；请在该窗口自行登录，再创建或继续任务'});
        }
        const match=url.pathname.match(/^\/api\/tasks\/([\da-f-]{36})(?:\/(resume|pause|cancel|retry|export))?$/);
        if(!match)return send(404,{error:'接口不存在'});
        const [,id,action]=match;const task=runner.get(id);
        if(req.method==='GET'&&!action)return send(200,{...publicTask(task),preview:task.comments.slice(-20)});
        if(req.method==='POST'&&action&&action!=='export'){if(['resume','retry'].includes(action)&&task.config.mode!=='demo'&&blocked.has(task.config.platform))return send(409,{error:holdMessage});return send(200,await runner.action(id,action));}
        if(req.method==='GET'&&action==='export'){
          if(url.searchParams.get('format')==='csv'){res.setHeader('Content-Disposition',`attachment; filename="comments-${id}.csv"`);return send(200,Core.csv(task.comments),'text/csv; charset=utf-8');}
          res.setHeader('Content-Disposition',`attachment; filename="comments-${id}.json"`);return send(200,{schema_version:2,mode:task.config.mode,scope:'loaded_comments_only',platform:task.config.platform,comments:task.comments});
        }
        return send(405,{error:'不支持的请求方法'});
      }
      const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
      if(req.method!=='GET'||!files[url.pathname])return send(404,{error:'页面不存在'});
      let content=await readFile(path.join(here,'web',files[url.pathname]),'utf8');
      if(url.pathname==='/')content=content.replace('__LOCAL_TOKEN__',token);
      return send(200,content,url.pathname==='/'?'text/html; charset=utf-8':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
    }catch(e){if(!res.headersSent)send(400,{error:e.message});else res.end();}
  });return {server,token};
}
export async function start() {
  const directory=process.env.COLLECTOR_DATA_DIR||path.resolve(here,'../private/v2');
  const runner=new Runner(new DiskStore(directory),new BrowserRouter(directory));await runner.init();
  const {server}=makeServer(runner);const port=Number(process.env.PORT||8765);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT必须为1024–65535的整数');
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  console.log(`\n评论采集 V2 已启动：http://127.0.0.1:${port}\n请用本机浏览器打开上面的地址。关闭终端会停止任务，进度保留。\n`);
  if(process.env.COLLECTOR_OPEN==='1') {const address=`http://127.0.0.1:${port}`;const [command,args]=process.platform==='win32'?['rundll32',['url.dll,FileProtocolHandler',address]]:process.platform==='darwin'?['open',[address]]:['xdg-open',[address]];const child=spawn(command,args,{stdio:'ignore',detached:true});child.on('error',()=>console.log('请手动打开上面的本地地址。'));child.unref();}
  let closing=false;const stop=async()=>{if(closing)return;closing=true;await runner.shutdown();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),2000).unref();};process.on('SIGINT',stop);process.on('SIGTERM',stop);return {server,runner};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))start().catch(e=>{console.error('启动失败：'+e.message);process.exitCode=1;});

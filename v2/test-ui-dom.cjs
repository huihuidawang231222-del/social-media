// Actual UI script + HTTP server + demo worker, using a synthetic DOM, not a browser.
const {parseHTML}=require(process.env.LINKEDOM_MODULE||'linkedom');
const vm=require('node:vm'),fs=require('node:fs/promises'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
  const [{Runner},{BrowserRouter},{makeServer}]=await Promise.all([import('./runner.mjs'),import('./browser.mjs'),import('./server.mjs')]);
  const store={async load(){return [];},async save(){}};const runner=new Runner(store,new BrowserRouter('/unused-demo'));await runner.init();const {server}=makeServer(runner);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  try {
    const html=await(await fetch(base)).text();const {document}=parseHTML(html).window;const form=document.getElementById('task-form');
    const values={mode:'demo',platform:'bilibili',keywords:'<img src=x onerror=alert(1)> 合成UI测试',maxPosts:'2',perPost:'3',intervalMs:'4000',filter:''};
    form.elements={authorized:{checked:true}};
    class FormDataMock {constructor(){this.values=Object.entries(values);}*[Symbol.iterator](){yield* this.values;}}
    let poll,downloadBlob;
    const fakeURL={createObjectURL:blob=>{downloadBlob=blob;return 'blob:synthetic';},revokeObjectURL(){}};
    const ctx=vm.createContext({document,FormData:FormDataMock,fetch:(url,options)=>fetch(base+url,options),URL:fakeURL,console,setInterval:fn=>{poll=fn;},setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref();return timer;}});
    vm.runInContext(await fs.readFile(path.join(__dirname,'web/app.js'),'utf8'),ctx);
    for(let i=0;i<100&&document.getElementById('connection').textContent!=='已连接';i++)await new Promise(r=>setTimeout(r,10));
    await form.onsubmit({preventDefault(){},currentTarget:form});
    for(let i=0;i<200&&runner.busy;i++)await new Promise(r=>setTimeout(r,10));await poll();
    assert.equal(runner.tasks[0].status,'completed');assert.equal(runner.tasks[0].comments.length,6);
    assert.ok(document.getElementById('tasks').textContent.includes('合成演示，非真实数据'));
    assert.equal(document.getElementById('tasks').querySelectorAll('img').length,0,'untrusted keywords render as text');
    const buttons=[...document.getElementById('tasks').querySelectorAll('button')];
    await buttons.find(b=>b.textContent==='CSV').onclick();assert.ok((await downloadBlob.text()).includes('[合成演示]'));
    await buttons.find(b=>b.textContent==='详情').onclick();
    for(let i=0;i<100&&!document.getElementById('detail-content').textContent.includes('最近20条预览');i++)await new Promise(r=>setTimeout(r,10));
    assert.ok(document.getElementById('detail-content').textContent.includes('合成演示'));assert.equal(document.getElementById('detail-content').querySelectorAll('img').length,0);
    console.log('PASS simulated UI + real HTTP + demo worker: form -> queue -> progress -> CSV action -> preview, XSS-safe text');
  }finally{await runner.shutdown();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});

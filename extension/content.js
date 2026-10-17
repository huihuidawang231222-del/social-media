(() => {
  if (globalThis.__socialCommentsCollector) return;
  globalThis.__socialCommentsCollector = true;
  const C=globalThis.CommentCollectorCore;
  let running=false, busy=false, timer=null, rounds=0, idle=0, options={}, lastUrl='', message='就绪';
  // Traverse open shadow DOM, needed by modern Bilibili comment components.
  function query(root, selector) {
    const found=[...root.querySelectorAll(selector)];
    if(root.shadowRoot) found.push(...query(root.shadowRoot,selector));
    for (const node of root.querySelectorAll('*')) if (node.shadowRoot) found.push(...query(node.shadowRoot,selector));
    return found;
  }
  function ownField(node, selector, itemSelector) {
    if (!selector) return '';
    // Exclude nested reply rows when extracting the parent comment.
    const field=query(node,selector).find(el=>{
      let p=el.parentElement || el.getRootNode()?.host;
      while(p && p!==node){if(p.matches(itemSelector)) return false;p=p.parentElement || p.getRootNode()?.host;}
      return true;
    });
    // textContent does not enter shadow DOM and drops emoji image alt text.
    function visibleText(el) {
      if(el.nodeType===3) return el.textContent;
      if(['STYLE','SCRIPT','TEMPLATE'].includes(el.tagName)) return '';
      if(el.tagName==='IMG') return el.getAttribute('alt') || '';
      if(el.tagName==='BR') return '\n';
      return [...(el.shadowRoot || el).childNodes].map(visibleText).join('');
    }
    return field?visibleText(field).trim():'';
  }
  function extract(config) {
    const platform=C.platform(location.hostname);
    if (!platform) throw new Error('请打开小红书、抖音或B站的单个帖子页面');
    const adapter={...C.adapters[platform]};
    for(const [k,v] of Object.entries(config.custom || {})) if(v.trim()) adapter[k]=v.trim();
    const rows=[];
    for(const node of query(document,adapter.item)) {
      const text=ownField(node,adapter.text,adapter.item);
      if(!text || !node.getClientRects().length) continue;
      rows.push({platform,source_url:C.canonical(location.href),comment_id:node.getAttribute('data-comment-id') || node.getAttribute('data-rpid') || '',author:ownField(node,adapter.author,adapter.item),text,published_at_raw:ownField(node,adapter.time,adapter.item),likes_raw:ownField(node,adapter.likes,adapter.item),collected_at:new Date().toISOString(),verification_status:'unverified',license_status:'not_reviewed'});
    }
    return C.filter(rows, config.keywords || '');
  }
  async function scan() {
    const rows=extract(options);
    const result=await chrome.runtime.sendMessage({type:'socialComments-store',action:'merge',rows,remaining:running?options.limit-count:options.limit});
    if(result.error) throw new Error(result.error);
    return {...result,matched:rows.length};
  }
  function stop(reason='已停止') {running=false;clearTimeout(timer);message=reason;}
  function scrollComments() {
    const platform=C.platform(location.hostname);
    const first=query(document,options.custom?.item || C.adapters[platform].item)[0];
    let el=first?.parentElement;
    while(el && el!==document.body) {
      if(el.scrollHeight>el.clientHeight+40 && /auto|scroll/.test(getComputedStyle(el).overflowY)) {el.scrollBy(0,Math.max(300,el.clientHeight*.8));return;}
      el=el.parentElement;
    }
    window.scrollBy(0,Math.max(400,innerHeight*.8));
  }
  let count=0;
  async function tick() {
    if(!running) return;
    if(C.canonical(location.href)!==lastUrl) {stop('页面已切换，采集停止');return;}
    try {
      busy=true;
      const result=await scan();count+=result.added;rounds++;
      idle=result.added ? 0 : idle+1;
      message=`滚动采集中：本次新增 ${count} 条 / 本地共 ${result.total} 条`;
      if(!running) return;
      if(count>=options.limit || rounds>=120 || idle>=5) {stop(`已停止：本次新增 ${count} 条；连续无新增或达到次数/条数上限。可手动展开后继续。`);return;}
      scrollComments();
      timer=setTimeout(tick,3000);
    } catch(e){stop('采集停止：'+e.message);} finally {busy=false;}
  }
  chrome.runtime.onMessage.addListener((request,sender,respond)=>{
    if(request?.type!=='socialComments') return;
    (async()=>{
      if(request.action==='status') return {running,busy,message};
      if(request.action==='stop') {stop();return {message};}
      if(busy || running) throw new Error('正在采集，请先停止并等待本轮保存');
      if(!request.options?.authorized) throw new Error('请先确认采集用途与权限');
      options=request.options;options.limit=Math.max(1,Math.min(5000,Number(options.limit)||500));
      lastUrl=C.canonical(location.href);
      if(request.action==='scan') {busy=true;try{const r=await scan();message=`本页匹配 ${r.matched} 条，新增 ${r.added} 条，本地共 ${r.total} 条`;return {message};}finally{busy=false;}}
      if(request.action==='start') {running=true;rounds=0;idle=0;count=0;message='开始滚动采集';void tick();return {message};}
      throw new Error('未知操作');
    })().then(respond,e=>respond({error:e.message}));return true;
  });
})();

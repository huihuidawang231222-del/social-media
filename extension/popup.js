const $=id=>document.getElementById(id), STORE='socialCommentsCommentsV1';
let tabId;
async function connect() {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id || !tab.url || !CommentCollectorCore.platform(new URL(tab.url).hostname)) throw new Error('请打开小红书、抖音或B站的帖子页面');
  tabId=tab.id;
  await chrome.scripting.executeScript({target:{tabId},files:['core.js','content.js']});
}
async function command(action) {
  await connect();
  const options={keywords:$('keywords').value,limit:$('limit').value,authorized:$('authorized').checked,custom:Object.fromEntries(['item','text','author','time','likes'].map(k=>[k,$(k).value]))};
  const result=await chrome.tabs.sendMessage(tabId,{type:'socialComments',action,options});
  if(result.error) throw new Error(result.error);
  $('status').textContent=result.message;
  return result;
}
async function rows() {return (await chrome.storage.local.get(STORE))[STORE] || [];}
function download(text,type,extension) {
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=`comments-${new Date().toISOString().replaceAll(':','-')}.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
for(const action of ['scan','start','stop']) $(action).onclick=()=>command(action).catch(e=>$('status').textContent=e.message);
for(const format of ['csv','json']) $(format).onclick=async()=>{
  try{const data=CommentCollectorCore.filter(await rows(),$('keywords').value);download(format==='csv'?CommentCollectorCore.csv(data):JSON.stringify({schema_version:1,scope:'loaded_comments_only',comments:data},null,2),format==='csv'?'text/csv;charset=utf-8':'application/json',format);$('status').textContent=`已导出 ${data.length} 条（按当前关键词筛选）`;}catch(e){$('status').textContent=e.message;}
};
$('clear').onclick=async()=>{
  try {
    // Stop collectors in every tab before clearing the shared store.
    for(const tab of await chrome.tabs.query({})) {
      try{const state=await chrome.tabs.sendMessage(tab.id,{type:'socialComments',action:'status'});if(state.running || state.busy) throw new Error('仍有页面正在采集，请先停止所有采集并等待保存后清空');}
      catch(e){if(e.message.includes('仍有页面')) throw e;}
    }
    if(confirm('清空所有本地评论记录？请先导出需要的数据。')) {const result=await chrome.runtime.sendMessage({type:'socialComments-store',action:'clear'});if(result.error) throw new Error(result.error);$('status').textContent='已清空';}
  }catch(e){$('status').textContent=e.message;}
};
async function status(){try{await command('status');}catch(e){$('status').textContent=`${e.message}；本地 ${ (await rows()).length } 条`;} }
status();setInterval(()=>status(),3000);

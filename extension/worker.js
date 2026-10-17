importScripts('core.js');
const STORE='socialCommentsCommentsV1';
// Serialize all read-modify-write operations across tabs.
let queue=Promise.resolve();
chrome.runtime.onMessage.addListener((req,sender,respond)=>{
  if(req?.type!=='socialComments-store') return;
  const operation=queue.then(async()=>{
    if(req.action==='clear') {await chrome.storage.local.remove(STORE);return {total:0};}
    if(req.action!=='merge' || !sender.tab) throw new Error('无效存储请求');
    const old=(await chrome.storage.local.get(STORE))[STORE] || [];
    const known=new Set(old.map(CommentCollectorCore.key));const added=[];
    for(const row of req.rows || []) {
      const key=CommentCollectorCore.key(row);
      if(!known.has(key) && added.length<req.remaining) {known.add(key);added.push(row);}
    }
    if(old.length+added.length>20000) throw new Error('本地达到20000条上限，请先导出并清空');
    await chrome.storage.local.set({[STORE]:[...old,...added]});
    return {added:added.length,total:old.length+added.length};
  });
  queue=operation.catch(()=>{});
  operation.then(respond,e=>respond({error:e.message}));return true;
});

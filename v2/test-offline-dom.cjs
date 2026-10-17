const {parseHTML}=require(process.env.LINKEDOM_MODULE||'linkedom');
const vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
  const {readComments,accessState}=await import('./page-functions.mjs');
  const {document,HTMLElement}=parseHTML('<body><bili-comments></bili-comments></body>').window;HTMLElement.prototype.getClientRects=()=>[{}];
  const root=document.querySelector('bili-comments').attachShadow({mode:'open'});root.innerHTML='<bili-comment-renderer></bili-comment-renderer><div id="limit-mask-tip">登录后查看100条评论</div>';
  const comment=root.querySelector('bili-comment-renderer').attachShadow({mode:'open'});comment.innerHTML='<bili-comment-user-info></bili-comment-user-info><div id="content"><i>置顶</i><bili-rich-text></bili-rich-text></div><bili-comment-action-buttons-renderer></bili-comment-action-buttons-renderer>';
  comment.querySelector('bili-comment-user-info').attachShadow({mode:'open'}).innerHTML='<span id="user-name">合成用户</span>';
  comment.querySelector('bili-rich-text').attachShadow({mode:'open'}).innerHTML='<style>:host{display:block}</style><p>合成评论<img alt="[笑哭]"></p>';
  comment.querySelector('bili-comment-action-buttons-renderer').attachShadow({mode:'open'}).innerHTML='<div id="pubdate">合成时间</div><div id="like"><span id="count">12</span></div>';
  const context=vm.createContext({document,getComputedStyle:()=>({visibility:'visible',display:'block'}),location:{href:'https://www.bilibili.com/video/BVDEMO'}});
  context.adapter={item:'bili-comment-renderer',text:'bili-rich-text',author:'#user-name',time:'#pubdate',likes:'#like #count'};
  const rows=vm.runInContext(`(${readComments.toString()})(adapter)`,context);assert.equal(rows.length,1);assert.equal(rows[0].text,'合成评论[笑哭]');assert.equal(rows[0].author,'合成用户');assert.equal(rows[0].likes_raw,'12');
  assert.ok(vm.runInContext(`(${accessState.toString()})()`,context).includes('登录'));
  root.querySelector('#limit-mask-tip').remove();root.innerHTML+='<div id="captcha-panel">安全验证</div>';
  assert.ok(vm.runInContext(`(${accessState.toString()})()`,context).includes('验证'));
  root.querySelector('#captcha-panel').remove();assert.equal(vm.runInContext(`(${accessState.toString()})()`,context),'');
  console.log('PASS V2 DOM: nested comments, rich text, emoji, shadow login gate, verification pause');
})().catch(e=>{console.error(e);process.exitCode=1;});

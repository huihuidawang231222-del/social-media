// Serializable DOM functions; no cookies, network interception or hidden APIs.
export function readComments(adapter) {
  function query(root,selector){const found=[...root.querySelectorAll(selector)];if(root.shadowRoot)found.push(...query(root.shadowRoot,selector));for(const node of root.querySelectorAll('*'))if(node.shadowRoot)found.push(...query(node.shadowRoot,selector));return found;}
  function text(el){if(el.nodeType===3)return el.textContent;if(['STYLE','SCRIPT','TEMPLATE'].includes(el.tagName))return '';if(el.tagName==='IMG')return el.getAttribute('alt')||'';if(el.tagName==='BR')return '\n';return [...(el.shadowRoot||el).childNodes].map(text).join('');}
  function field(node,selector){if(!selector)return '';const el=query(node,selector).find(el=>{let p=el.parentElement||el.getRootNode()?.host;while(p&&p!==node){if(p.matches(adapter.item))return false;p=p.parentElement||p.getRootNode()?.host;}return true;});return el?text(el).trim():'';}
  return query(document,adapter.item).filter(n=>n.getClientRects().length).map(node=>({comment_id:node.getAttribute('data-comment-id')||node.getAttribute('data-rpid')||'',text:field(node,adapter.text),author:field(node,adapter.author),published_at_raw:field(node,adapter.time),likes_raw:field(node,adapter.likes)})).filter(r=>r.text);
}
export function accessState() {
  function query(root,selector){const found=[...root.querySelectorAll(selector)];if(root.shadowRoot)found.push(...query(root.shadowRoot,selector));for(const node of root.querySelectorAll('*'))if(node.shadowRoot)found.push(...query(node.shadowRoot,selector));return found;}
  const visible=el=>!!el.getClientRects().length && getComputedStyle(el).visibility!=='hidden' && getComputedStyle(el).display!=='none';
  const checks=query(document,'[role="dialog"], .login-modal, .login-container, .login-mask, .passport-login-container, [id*="captcha"], iframe[src*="captcha"], #limit-mask-tip');
  for(const el of checks){if(!visible(el))continue;const text=(el.innerText||el.textContent||'').slice(0,1000);if(/captcha|验证码|安全验证|验证你|verify.*human|checking your browser/i.test(text+' '+el.id+' '+el.getAttribute('src')))return '检测到验证页面，请在采集浏览器中手动完成后点击继续';if(/登录|sign in|log in/i.test(text))return '检测到登录窗口或评论登录限制，请在采集浏览器中正常登录后点击继续';}
  const body=(document.body?.innerText||'').slice(0,4000);
  if(/^(Access Denied|Forbidden|Verify you are human|Just a moment)/i.test(document.title)||/异常访问|访问过于频繁|请求过于频繁|账号异常|操作频繁/.test(body))return '平台限制了当前访问，任务已暂停；请稍后检查，不会自动绕过或连续重试';
  if(/\/login(?:\/|\?|$)|passport\./.test(location.href))return '当前位于登录页面，请正常登录后点击继续';
  return '';
}
export function scrollCommentPage(adapter) {
  function query(root,selector){const found=[...root.querySelectorAll(selector)];if(root.shadowRoot)found.push(...query(root.shadowRoot,selector));for(const n of root.querySelectorAll('*'))if(n.shadowRoot)found.push(...query(n.shadowRoot,selector));return found;}
  let el=query(document,adapter.item)[0];
  while(el&&el!==document.body){if(el.scrollHeight>el.clientHeight+40&&/auto|scroll/.test(getComputedStyle(el).overflowY)){el.scrollBy(0,Math.max(400,el.clientHeight*.8));return;}el=el.parentElement||el.getRootNode()?.host;}
  window.scrollBy(0,Math.max(500,innerHeight*.8));
}

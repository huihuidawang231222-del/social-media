/* Shared by the isolated content script, popup and offline Node tests. */
globalThis.CommentCollectorCore = (() => {
  const adapters = {
    xiaohongshu: {item: '.comment-item', text: '.content .note-text, .content', author: '.author .name, .user-name', time: '.date', likes: '.like .count'},
    douyin: {item: '[data-e2e="comment-item"]', text: '[data-e2e="comment-level-1"] [data-e2e="comment-content"], [data-e2e="comment-content"]', author: '[data-e2e="comment-user-name"]', time: '[data-e2e="comment-time"]', likes: '[data-e2e="comment-like-count"]'},
    bilibili: {item: '.reply-item, .sub-reply-item, bili-comment-renderer, bili-comment-reply-renderer', text: '.reply-content, .reply-content-container, bili-rich-text', author: '.user-name, .sub-user-name, #user-name', time: '.reply-time, .sub-reply-time, #pubdate', likes: '.reply-like .reply-like-count, .sub-reply-like .sub-reply-like-count, #like #count'}
  };
  function platform(host) {
    return [['xiaohongshu','xiaohongshu.com'],['douyin','douyin.com'],['bilibili','bilibili.com']].find(([,d])=>host===d || host.endsWith('.'+d))?.[0] || null;
  }
  function canonical(url) {
    const u = new URL(url); u.hash = ''; u.search = '';
    // Douyin modal posts are identified by this query parameter.
    const original = new URL(url);
    if (platform(u.hostname)==='douyin' && original.searchParams.get('modal_id')) u.pathname='/video/'+original.searchParams.get('modal_id');
    return u.href;
  }
  function key(row) {
    return JSON.stringify([row.platform,row.source_url,row.comment_id || '',row.author,row.published_at_raw,row.text]);
  }
  function merge(existing, incoming) {
    const map=new Map(existing.map(r=>[key(r),r]));
    for (const row of incoming) if (!map.has(key(row))) map.set(key(row),row);
    return [...map.values()];
  }
  function filter(rows, terms) {
    const list=terms.split(/[,，]/).map(x=>x.trim().toLowerCase()).filter(Boolean);
    return rows.filter(r=>!list.length || list.some(t=>r.text.toLowerCase().includes(t)));
  }
  const columns=['platform','source_url','comment_id','author','text','published_at_raw','likes_raw','collected_at','verification_status','license_status'];
  function csv(rows) {
    const cell=v=>{let s=String(v ?? '');if (/^[\s]*[=+@-]/.test(s)) s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    return '\ufeff'+[columns,...rows.map(r=>columns.map(c=>r[c]))].map(r=>r.map(cell).join(',')).join('\r\n');
  }
  return {adapters,platform,canonical,key,merge,filter,csv};
})();

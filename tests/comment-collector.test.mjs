import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({URL});
vm.runInContext(fs.readFileSync(new URL('../extension/core.js',import.meta.url),'utf8'),context);
const C=context.CommentCollectorCore;
test('recognizes exact platform domains and rejects lookalikes',()=>{
  assert.equal(C.platform('www.xiaohongshu.com'),'xiaohongshu');
  assert.equal(C.platform('www.douyin.com.evil.test'),null);
  assert.equal(C.platform('bilibili.com'),'bilibili');
});
test('source URLs omit tracking and preserve Douyin modal identity',()=>{
  assert.equal(C.canonical('https://www.xiaohongshu.com/explore/123?xsec_token=secret#foo'),'https://www.xiaohongshu.com/explore/123');
  assert.equal(C.canonical('https://www.douyin.com/?modal_id=123&tracking=1'),'https://www.douyin.com/video/123');
});
const row={platform:'xiaohongshu',source_url:'https://www.xiaohongshu.com/explore/1',comment_id:'',author:'合成用户',text:'双休，加班少',published_at_raw:'昨天'};
test('resume deduplicates while preserving comments by distinct authors and posts',()=>{
  assert.equal(C.merge([row],[{...row,collected_at:'later'},{...row,author:'另一用户'},{...row,source_url:'https://www.xiaohongshu.com/explore/2'}]).length,3);
});
test('keyword filter uses OR, supports Chinese separators and does not alter stored rows',()=>{
  assert.equal(C.filter([row],'广州，双休').length,1);
  assert.equal(C.filter([row],'高薪').length,0);
  assert.equal(C.filter([row],'').length,1);
});
test('CSV quotes multiline values and neutralizes formula injection',()=>{
  const csv=C.csv([{...row,text:'=HYPERLINK("bad")\n第二行',author:'  +SUM(1)'}]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"bad\"\")\n第二行\""));
  assert.ok(csv.includes("'  +SUM(1)"));
});
test('storage worker serializes concurrent writes, respects per-call cap and deduplicates',async()=>{
  let listener, state={};
  const worker=vm.createContext({URL,importScripts:()=>{},chrome:{runtime:{onMessage:{addListener:f=>{listener=f;}}},storage:{local:{get:async()=>({...state}),set:async data=>{await new Promise(r=>setTimeout(r,3));Object.assign(state,data);},remove:async k=>{delete state[k];}}}}});
  for(const file of ['core.js','worker.js']) vm.runInContext(fs.readFileSync(new URL('../extension/'+file,import.meta.url),'utf8'),worker);
  const send=(rows,remaining=1)=>new Promise(resolve=>listener({type:'socialComments-store',action:'merge',rows,remaining},{tab:{id:1}},resolve));
  await Promise.all([send([row,{...row,text:'被上限截断'}]),send([{...row,author:'另一用户'}])]);
  assert.equal(state.socialCommentsCommentsV1.length,2);
  assert.equal((await send([row])).added,0);
  assert.equal((await send([{...row,text:'新记录'}],0)).added,0);
});

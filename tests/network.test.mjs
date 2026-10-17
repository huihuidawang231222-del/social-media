import test from 'node:test';
import assert from 'node:assert/strict';
import {browserProxy,parseProxy} from '../v2/network.mjs';
test('collector uses the configured Windows proxy without changing system settings',async()=>{
  const values={ProxyEnable:'0x1',ProxyServer:'127.0.0.1:7897'};
  assert.deepEqual(await browserProxy({env:{},platform:'win32',read:async k=>values[k]}),{server:'http://127.0.0.1:7897'});
  values.ProxyEnable='0x0';assert.equal(await browserProxy({env:{},platform:'win32',read:async k=>values[k]}),undefined);
  assert.equal(await browserProxy({env:{},platform:'linux'}),undefined);
  assert.deepEqual(parseProxy('http=127.0.0.1:8000;https=127.0.0.1:9000'),{server:'http://127.0.0.1:9000'});
  assert.deepEqual(await browserProxy({env:{COLLECTOR_PROXY:'socks5://127.0.0.1:1080'},platform:'linux'}),{server:'socks5://127.0.0.1:1080'});
  assert.throws(()=>parseProxy('http://user:secret@127.0.0.1:80'),/格式无效/);
});

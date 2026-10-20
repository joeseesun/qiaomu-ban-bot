import test from 'node:test';
import assert from 'node:assert/strict';
import {replyIntent} from '../src/reply.js';

test('native reply intent preserves Unicode, newlines and reserved characters in the correct target',()=>{
  const text='你好 @alice\nA & B? #问答 https://example.com/a?q=2';
  const url=new URL(replyIntent('123456789',text));
  assert.equal(url.origin,'https://x.com');assert.equal(url.pathname,'/intent/post');
  assert.equal(url.searchParams.get('in_reply_to'),'123456789');assert.equal(url.searchParams.get('text'),text);
  for(const id of ['../home','12&in_reply_to=3','1e3',''])assert.throws(()=>replyIntent(id,text));
  assert.throws(()=>replyIntent('1','a'.repeat(4001)));assert.throws(()=>replyIntent('1',{}));
});

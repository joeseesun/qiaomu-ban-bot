import test from 'node:test';
import assert from 'node:assert/strict';
import { examplesFor } from '../src/learning.js';
const sample=(id,text,label='human',parent='',at=Number(id))=>({id:String(id),text,label,parent,at,handle:'must_not_send'});
test('same text at a different status ID cannot leak into its own evaluation',()=>{
  assert.deepEqual(examplesFor([sample(1,'  THANKS  ')],sample(2,'thanks')),[]);
});
test('deduplicates repeated examples and excludes conflicting labels',()=>{
  const samples=[sample(1,'谢谢，已解决'),sample(2,'谢谢，已解决'),sample(3,'套话','ai'),sample(4,'套话','human')];
  const picked=examplesFor(samples,sample(9,'我的体验不同'));
  assert.equal(picked.length,1);assert.equal(picked[0].text,'谢谢，已解决');
  assert.deepEqual(Object.keys(picked[0]).sort(),['label','parent','text']);
});
test('overlapping Chinese cues and conversation context outrank recency',()=>{
  const samples=[sample(1,'对服务器的性能有要求吗','human','部署插件需要服务器'),sample(2,'有没有推荐的歌','human','音乐推荐'),sample(3,'谢谢','human'),sample(4,'一般吧','human')];
  assert.equal(examplesFor(samples,sample(9,'服务器性能要求高吗','human','部署插件需要服务器'))[0].text,samples[0].text);
});
test('a single label never overwhelms the context, and excerpts stay bounded',()=>{
  const examples=examplesFor(Array.from({length:20},(_,i)=>sample(i,'不同样本'+i+'x'.repeat(1000),'human','y'.repeat(500))),sample(99,'问题'));
  assert.equal(examples.length,3);assert.ok(examples.every(e=>e.text.length<=400&&e.parent.length<=200&&e.label==='human'));
});

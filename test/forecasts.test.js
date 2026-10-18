import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory,IDBKeyRange } from 'fake-indexeddb';
import { Forecasts,reviewState } from '../src/forecasts.js';
globalThis.IDBKeyRange=IDBKeyRange;
test('watch preserves the original prediction and distinguishes late observations from 24-hour evidence',async()=>{
  const store=new Forecasts(new IDBFactory(),'watch'),start=1000000,item={id:'123',handle:'alice',text:'example',createdAt:start,metrics:{views:100}},result={scores:{hot:.12},model:'jev',analyzedAt:start};
  const first=await store.watch('me',item,result,30000,start+1000);
  await store.watch('me',{...item,metrics:{views:500}},{...result,scores:{hot:.5}},40000,start+2000);
  let row=(await store.page({owner:'me'})).items[0];assert.equal(row.probability,.12);assert.equal(row.initial.metrics.views,100);assert.equal(row.targetViews,30000);
  assert.match(reviewState(row,first.reviewAt+1),/待复盘/);
  await store.observe('me',[{...item,metrics:{views:50000}}],first.reviewAt+1000);row=(await store.page({owner:'me'})).items[0];assert.equal(row.reachedWithin24h,false);assert.equal(reviewState(row),'已有复盘数据');assert.equal(row.latest.metrics.views,50000);
  await store.observe('me',[{...item,metrics:{views:200}}],start+3000);assert.equal((await store.page({owner:'me'})).items[0].latest.metrics.views,50000,'older observations cannot overwrite newer data');
  assert.equal((await store.page({owner:'other'})).items.length,0);
  await store.remove('me','123');await store.observe('me',[item]);assert.equal((await store.page({owner:'me'})).items.length,0);
  (await store.db).close();
});
test('timely target evidence survives later measurements',async()=>{
  const store=new Forecasts(new IDBFactory(),'hit'),item={id:'2',handle:'alice',createdAt:100,metrics:{views:10}};
  await store.watch('me',item,{scores:{hot:.5}},1000,1000);await store.observe('me',[{...item,metrics:{views:1500}}],2000);
  assert.equal((await store.page({owner:'me'})).items[0].reachedWithin24h,true);(await store.db).close();
});

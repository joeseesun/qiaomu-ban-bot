import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {Posts} from '../src/posts.js';
const code=(await build({entryPoints:['src/ui-posts.js'],bundle:true,write:false,format:'iife',globalName:'PostUI'})).outputFiles[0].text;
const until=async fn=>{for(let i=0;i<120;i++){if(await fn())return;await new Promise(r=>setTimeout(r,15));}throw Error('Post UI did not settle');};
async function fixture(){
 const dom=new JSDOM(await readFile('public/ui.html','utf8'),{url:'https://fixture.test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
 const store=new Posts(new IDBFactory(),'posts-ui');w.confirm=()=>true;w.eval(code);
 const ui=w.PostUI.initPostsUI({store,demo:true,send:async()=>({owner:'me',items:[]}),notice(){},glyph:()=>d.createElement('span')});
 await ui.open();return{dom,d,store};
}
test('deleting the current post cannot autosave it back into the local queue',async()=>{
 const{dom,d,store}=await fixture();
 try{
  d.getElementById('post-text').value='Delete this draft';
  d.getElementById('post-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  await until(()=>d.getElementById('post-saved').textContent.includes('已保存'));
  d.querySelector('[data-post-filter="draft"]').click();await until(()=>d.querySelector('.post-row'));
  d.querySelector('.post-row [aria-label="删除"]').click();
  await until(()=>d.getElementById('post-text').value==='');
  assert.deepEqual(await store.all(),[]);
  d.getElementById('post-text').value='New draft';d.getElementById('post-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  await until(async()=>(await store.all())[0]?.text==='New draft');
  assert.equal((await store.all()).length,1);
 }finally{dom.window.close();}
});
test('a failed explicit save can be retried without poisoning subsequent saves',async()=>{
 const{dom,d,store}=await fixture();
 try{
  const save=store.save.bind(store);let fail=true;store.save=async p=>{if(fail){fail=false;throw Error('Storage temporarily unavailable');}return save(p);};
  d.getElementById('post-text').value='Retry this draft';const submit=()=>d.getElementById('post-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  submit();await until(()=>d.getElementById('post-error').textContent.includes('Storage temporarily'));
  submit();await until(async()=>(await store.all()).length===1);
  assert.equal((await store.all())[0].text,'Retry this draft');
 }finally{dom.window.close();}
});

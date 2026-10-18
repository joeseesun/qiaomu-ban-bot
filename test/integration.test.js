import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const [background,ui,content] = await Promise.all(['background','ui','content'].map(async name => (await build({entryPoints:[`src/${name}.js`],bundle:true,write:false,format:'iife',target:'chrome120'})).outputFiles[0].text));
const until=async fn=>{for(let i=0;i<120;i++){if(await fn())return;await new Promise(r=>setTimeout(r,15));}throw new Error('Integration state did not settle');};
test('actual UI -> background -> Jev adapter -> auto folding -> user learning',async()=>{
  let saved={},listener;const calls=[],contentListeners=[];
  const runtime={id:'our-extension',getURL:path=>`chrome-extension://our-extension/${path}`,onMessage:{addListener:fn=>{listener=fn;}},openOptionsPage:async()=>{}};
  const chrome={runtime,permissions:{contains:async()=>true},storage:{local:{setAccessLevel:async()=>{},get:async()=>structuredClone(saved),set:async value=>{saved=structuredClone(value);}}},tabs:{query:async()=>[{id:1}],sendMessage:async(id,message)=>{contentListeners.forEach(fn=>fn(message));}}};
  vm.runInNewContext(background,{chrome,crypto,TextEncoder,URL,setTimeout,clearTimeout,structuredClone,AbortController,fetch:async(url,options)=>{
    const payload=JSON.parse(options.body);calls.push(payload);
    if(options.headers.Authorization==='Bearer invalid')return new Response('',{status:401});
    const ai=payload.state.text.includes('作为一个人工智能');
    const scores={ai_written:ai?.96:.1,low_value:ai?.97:.1,useful:.2,spam:.01,hot:.5,discussion:.6};
    return Response.json({model:'integration-jev',answers:Object.fromEntries(Object.keys(payload.questions).map(key=>[key,{type:'noul',noul:scores[key]??.1}])),usage:{input_tokens:20}});
  }});
  const dispatch=(message,url,tab)=>new Promise(resolve=>listener(message,{id:runtime.id,url,...(tab?{tab:{id:1},frameId:0}:{})},resolve));
  const settings=new JSDOM(await readFile('public/ui.html','utf8'),{url:runtime.getURL('ui.html')+'#model',runScripts:'outside-only',pretendToBeVisual:true});
  settings.window.chrome={runtime:{sendMessage:m=>dispatch(m,settings.window.location.href),openOptionsPage:async()=>{}},permissions:{request:async()=>true}};
  const page=new JSDOM(`<style>.native-row{display:flex;flex-direction:row}.native-column{display:flex;flex-direction:column;flex:1}${await readFile('public/content.css','utf8')}</style><main data-testid="primaryColumn"><article data-testid="tweet" class="native-row"><div class="native-column"><a href="/author/status/100"><time datetime="${new Date(Date.now()-3600000).toISOString()}">1h</time></a><div data-testid="tweetText">你测试过这个工具吗？</div><div role="group" aria-label="3200 views"></div></div></article><article data-testid="tweet" id="reply" class="native-row"><div class="native-column"><a href="/reader/status/101"><time datetime="${new Date().toISOString()}">now</time></a><div data-testid="tweetText">作为一个人工智能语言模型，我无法访问你的项目。</div></div></article></main>`,{url:'https://x.com/author/status/100',runScripts:'outside-only',pretendToBeVisual:true});
  page.window.chrome={runtime:{sendMessage:m=>dispatch(m,page.window.location.href,true),onMessage:{addListener:fn=>contentListeners.push(fn)}}};
  page.window.IntersectionObserver=class{constructor(fn){this.fn=fn;}observe(target){queueMicrotask(()=>this.fn([{target,isIntersecting:true}]));}unobserve(){}disconnect(){}};
  try{
    settings.window.eval(ui);await until(()=>settings.window.document.getElementById('model-state').textContent==='尚未连接模型');
    const d=settings.window.document;d.getElementById('api-key').value='fixture-secret';d.getElementById('save-model').click();
    await until(()=>d.getElementById('notice').textContent.includes('连接测试通过'));
    assert.equal(calls.length,1);assert.equal(d.getElementById('test-text').value,'');assert.equal(d.getElementById('api-key').value,'');assert.equal(saved.banbot.apiKey,'fixture-secret');
    page.window.eval(content);const reply=page.window.document.getElementById('reply'),original=reply.firstElementChild;
    await until(()=>reply.classList.contains('qb-collapsed'));
    assert.equal(page.window.getComputedStyle(original).display,'none');
    [...reply.querySelector('.qb-host').shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='展开').click();
    assert.equal(reply.classList.contains('qb-collapsed'),false);
    [...reply.querySelector('.qb-host').shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='标记 AI').click();
    await until(()=>reply.classList.contains('qb-collapsed')&&reply.querySelector('.qb-host')?.shadowRoot.textContent.includes('你标记为 AI'));
    const negative=[...reply.querySelector('.qb-host').shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='标记为非 AI');negative.click();
    await until(()=>!reply.classList.contains('qb-collapsed') && reply.querySelector('.qb-host')?.shadowRoot.textContent.includes('你标记为非 AI'));
    assert.equal(reply.firstElementChild,original);assert.equal(reply.querySelector('.qb-host').parentElement,original);assert.equal(saved.banbot.learning[0].label,'human');
    d.querySelector('nav [data-tab="accounts"]').click();await until(()=>d.getElementById('learning').textContent.includes('你标记为非 AI'));
    const response=await dispatch({type:'classify',item:{id:'999',handle:'another',kind:'reply',text:'谢谢，确实解决了问题。',metrics:{}}},page.window.location.href,true);
    assert.equal(response.ok,true);assert.equal(calls.at(-1).state.user_labelled_examples[0].label,'human');
    const publicState=await dispatch({type:'snapshot'},page.window.location.href,true);
    assert.equal(JSON.stringify(publicState).includes('fixture-secret'),false);assert.equal(publicState.data.learning,undefined);
    d.getElementById('api-key').value='invalid';d.getElementById('save-model').click();await until(()=>d.getElementById('notice').textContent.includes('拒绝认证'));
    assert.equal(saved.banbot.apiKey,'fixture-secret');assert.equal(d.getElementById('api-key').value,'invalid');
  }finally{settings.window.close();page.window.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
const code=(await build({entryPoints:['src/mentions.js'],bundle:true,write:false,format:'iife',target:'chrome120'})).outputFiles[0].text;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('mention launcher joins the native icon row and follows its appearance without touching the draft',async()=>{
  const dom=new JSDOM('<a data-testid="AppTabBar_Profile_Link" href="/me"></a><section><div contenteditable="true" data-testid="tweetTextarea_0">已有草稿</div><div data-testid="toolBar"><nav><div role="tablist"><div><button data-testid="gifSearchButton" style="width:36px;height:36px"><svg style="color:rgb(130,154,171);width:23px;height:23px"></svg></button></div></div></nav><div id="submit"><button data-testid="tweetButtonInline">发帖</button></div></div></section>',{url:'https://x.com/home',runScripts:'outside-only',pretendToBeVisual:true});
  const d=dom.window.document;dom.window.chrome={runtime:{sendMessage:async()=>({ok:true,data:{items:[]}})}};
  try{
    dom.window.eval(code);await pause(30);
    const row=d.querySelector('[role="tablist"]'),host=d.querySelector('.qm-mentions-host');
    assert.equal(host.parentElement,row);assert.equal(d.querySelector('[data-testid="toolBar"]').children.length,2);
    assert.equal(host.style.getPropertyValue('--qm-accent'),'rgb(130, 154, 171)');
    assert.equal(host.style.getPropertyValue('--qm-button-size'),'36px');assert.equal(host.style.getPropertyValue('--qm-icon-size'),'23px');
    d.querySelector('svg').style.color='rgb(29,155,240)';d.body.className='dark';await pause(250);
    assert.equal(d.querySelector('.qm-mentions-host'),host);assert.equal(host.style.getPropertyValue('--qm-accent'),'rgb(29, 155, 240)');
    assert.equal(d.querySelector('[contenteditable]').textContent,'已有草稿');
  }finally{dom.window.close();}
});

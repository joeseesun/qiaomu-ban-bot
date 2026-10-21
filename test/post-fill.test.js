import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
const code=(await build({entryPoints:['src/post-fill.js'],bundle:true,write:false,format:'iife',target:'chrome120'})).outputFiles[0].text;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const options=(from,to,f=String)=>Array.from({length:to-from+1},(_,i)=>`<option value="${f(from+i)}">${from+i}</option>`).join('');
// A stand-in for X's compose dialog: Draft-style paste handling, a hidden file
// input that renders previews on change, and the schedule panel's selects.
function mount({existing=''}={}){
  const dom=new JSDOM(`<a data-testid="AppTabBar_Profile_Link" href="/me"></a><div role="dialog"><div contenteditable="true" data-testid="tweetTextarea_0">${existing}</div><input type="file" data-testid="fileInput"><div data-testid="attachments"></div><div data-testid="toolBar"><button data-testid="scheduleOption"></button></div><button data-testid="tweetButton">发帖</button></div>`,{url:'https://x.com/compose/post',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,calls=[],clicks=[];
  w.DataTransfer=class{constructor(){this.data={};this.list=[];this.items={add:f=>this.list.push(f)};}setData(k,v){this.data[k]=v;}getData(k){return this.data[k]||'';}get files(){return this.list;}};
  w.ClipboardEvent=class extends w.Event{constructor(t,o){super(t,o);this.clipboardData=o.clipboardData;}};
  const editor=d.querySelector('[contenteditable]'),input=d.querySelector('[data-testid="fileInput"]');
  editor.addEventListener('paste',e=>{e.preventDefault();editor.textContent+=e.clipboardData.getData('text/plain');});
  let files=[];Object.defineProperty(input,'files',{get:()=>files,set:v=>{files=v;}});
  input.addEventListener('change',()=>{for(const f of files){const img=d.createElement('img');img.alt=f.name;d.querySelector('[data-testid="attachments"]').append(img);}});
  d.querySelector('[data-testid="scheduleOption"]').addEventListener('click',()=>{
    const panel=d.createElement('div');panel.setAttribute('role','dialog');
    panel.innerHTML=`<label for="m">Month</label><select id="m">${options(1,12)}</select><label for="dd">Day</label><select id="dd">${options(1,31)}</select><label for="y">Year</label><select id="y">${options(2026,2028)}</select><label for="h">Hour</label><select id="h">${options(1,12)}</select><label for="mi">Minute</label><select id="mi">${options(0,59)}</select><label for="ap">AM/PM</label><select id="ap"><option value="am">AM</option><option value="pm">PM</option></select><button data-testid="scheduledConfirmationPrimaryAction">Confirm</button>`;
    d.body.append(panel);
  });
  d.addEventListener('click',e=>clicks.push(e.target.getAttribute?.('data-testid')),true);
  const at=new Date(2027,2,5,21,7).getTime();
  w.chrome={runtime:{onMessage:{addListener(){}},sendMessage:async m=>{calls.push(m);
    if(m.type==='posts-fill-pending')return{ok:true,data:{post:{id:'p1',text:'你好 X',scheduledAt:at,nativeSchedule:true},media:[{id:'m1',name:'a.png',type:'image/png',size:3}]}};
    if(m.type==='posts-media-chunk')return{ok:true,data:{data:Buffer.from([1,2,3]).toString('base64'),next:3,done:true}};
    return{ok:true,data:{}};}}};
  w.eval(code);
  return{dom,d,calls,clicks};
}
test('fill writes text and media into X composer, presets X schedule, and stops before any confirmation',async()=>{
  const{dom,d,calls,clicks}=mount();
  try{
    for(let i=0;i<60&&!calls.some(m=>m.type==='posts-filled');i++)await pause(50);
    assert.equal(d.querySelector('[contenteditable]').textContent,'你好 X');
    assert.equal(d.querySelectorAll('[data-testid="attachments"] img').length,1);
    const v=id=>d.getElementById(id).value;
    assert.deepEqual([v('m'),v('dd'),v('y'),v('h'),v('mi'),v('ap')],['3','5','2027','9','7','pm']);
    assert.deepEqual(JSON.parse(JSON.stringify(calls.find(m=>m.type==='posts-filled'))),{type:'posts-filled',id:'p1',owner:'me'});
    assert.deepEqual([...clicks.filter(Boolean)],['scheduleOption'],'never presses Post or Confirm');
    assert.match(d.querySelector('[role=status]').textContent,/确认/);
  }finally{dom.window.close();}
});
test('fill refuses to overwrite text already in the composer',async()=>{
  const{dom,d,calls}=mount({existing:'别人的草稿'});
  try{
    for(let i=0;i<40&&!calls.some(m=>m.type==='posts-filled');i++)await pause(50);
    assert.equal(d.querySelector('[contenteditable]').textContent,'别人的草稿');
    assert.match(calls.find(m=>m.type==='posts-filled').error,/已经有内容/);
  }finally{dom.window.close();}
});

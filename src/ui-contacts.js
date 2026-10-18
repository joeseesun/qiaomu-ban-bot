import { contactHandle, avatarURL } from './contacts.js';
export function initContactsUI({send,notice,glyph}){
  const $=id=>document.getElementById(id);
  let owner='',owners=[],index=0,cursors=[null],next=null,epoch=0,timer;
  const button=(name,icon,fn)=>{const b=document.createElement('button');b.type='button';b.className='icon-control';b.title=name;b.setAttribute('aria-label',name);b.append(glyph(icon));b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){notice(e.message,true);}finally{b.disabled=false;}};return b;};
  function edit(c){
    $('contact-editor').hidden=false;$('contact-form').reset();$('contact-handle').value=c?.handle?'@'+c.handle:'';$('contact-handle').readOnly=!!c;
    $('contact-name').value=c?.displayName||'';$('contact-note').value=c?.note||'';$('contact-pin').checked=c?c.pinned:true;
    $('contact-form-title').textContent=c?'编辑联系人':'添加常用账号';$('contact-handle').focus();
  }
  async function load(reset=false){
    if(reset){index=0;cursors=[null];}const gen=++epoch,list=$('contact-list');list.setAttribute('aria-busy','true');$('contacts-prev').disabled=$('contacts-next').disabled=true;
    try{
      const page=owner?await send({type:'contacts-page',owner,query:$('contact-search').value,pinned:$('contacts-pinned').checked,before:cursors[index]}):{items:[],next:null};
      if(gen!==epoch)return;next=page.next;list.replaceChildren();
      if(!page.items.length&&index){index--;return load();}
      if(!page.items.length){const p=document.createElement('p');p.className='empty-state';p.textContent=!owner?'先打开 X，让插件识别你的登录账号。也可在下方手动填写。':$('contact-search').value?'没有找到。试试 @账号、昵称或备注。':'把下次还想聊的人，留在这里。回复成功后自动记录，也可以手动添加。';list.append(p);}
      for(const c of page.items){
        const row=document.createElement('article');row.className='contact-row';row.dataset.handle=c.handle;
        const avatar=document.createElement('span');avatar.className='contact-avatar';avatar.textContent=(c.displayName||c.handle).slice(0,1).toUpperCase();
        if(avatarURL(c.avatar)){const img=document.createElement('img');img.src=c.avatar;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();avatar.append(img);}
        const info=document.createElement('div');info.className='contact-info';
        const link=document.createElement('a');link.href=`https://x.com/${c.handle}`;link.target='_blank';link.rel='noopener noreferrer';link.textContent=c.displayName||'@'+c.handle;
        const handle=document.createElement('span');handle.textContent='@'+c.handle;const meta=document.createElement('small');meta.textContent=c.note||(c.replyCount?`回复过 ${c.replyCount} 次 · ${new Date(c.lastReplyAt).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})}`:'手动添加');info.append(link,handle,meta);
        const actions=document.createElement('div');actions.className='contact-actions';
        const pin=button(`${c.pinned?'取消置顶':'置顶'} @${c.handle}`,'Pin',async()=>{await send({type:'contacts-save',owner,contact:{...c,pinned:!c.pinned}});await load(true);});pin.setAttribute('aria-pressed',String(c.pinned));
        actions.append(pin,button(`复制 @${c.handle}`,'Copy',async()=>{await navigator.clipboard.writeText('@'+c.handle);notice(`已复制 @${c.handle}`);}),button(`编辑 @${c.handle}`,'Pencil',()=>edit(c)),button(`移除 @${c.handle}`,'Trash2',async()=>{
          if(!confirm(`移除 @${c.handle}？\n之后回复此人也不会自动收录；手动添加可恢复。`))return;
          await send({type:'contacts-remove',owner,handle:c.handle});await load();notice('已移除。手动添加可恢复收录。');
        }));row.append(avatar,info,actions);list.append(row);
      }
      $('contacts-page').textContent=`第 ${index+1} 页 · 每页 20 个`;$('contacts-prev').disabled=index===0;$('contacts-next').disabled=!next;
    }finally{if(gen===epoch)list.removeAttribute('aria-busy');}
  }
  async function open(){
    const s=await send({type:'contacts-state',owner});owners=s.owners;owner=s.owner;
    $('contact-owner').replaceChildren();for(const o of owners){const opt=document.createElement('option');opt.value=o.handle;opt.textContent='@'+o.handle;$('contact-owner').append(opt);}
    $('contact-owner').value=owner;$('contact-owner').disabled=!owner;$('contact-add').disabled=!owner;$('contact-auto').disabled=!owner;$('contact-auto').checked=owners.find(o=>o.handle===owner)?.automatic!==false;
    $('contact-owner-setup').open=!owner;await load(true);
  }
  $('contact-add').onclick=()=>edit();$('contact-cancel').onclick=()=>{$('contact-editor').hidden=true;$('contact-add').focus();};
  $('contact-form').onsubmit=async e=>{e.preventDefault();const b=$('contact-save');b.disabled=true;try{await send({type:'contacts-save',owner,contact:{handle:$('contact-handle').value,displayName:$('contact-name').value,note:$('contact-note').value,pinned:$('contact-pin').checked}});$('contact-editor').hidden=true;await load(true);notice('已保存。回到 X，点编辑器里的 @ 就能插入。');}catch(e){notice(e.message,true);}finally{b.disabled=false;}};
  $('contact-owner-form').onsubmit=async e=>{e.preventDefault();try{const h=contactHandle($('contact-owner-input').value);if(!h)throw Error('请输入你的 @用户名');await send({type:'contacts-configure',owner:h,automatic:true});owner=h;await open();notice('已添加。只有登录这个 X 账号时，才会使用这份联系人。');}catch(e){notice(e.message,true);}};
  $('contact-owner').onchange=async()=>{owner=$('contact-owner').value;$('contact-editor').hidden=true;try{await open();}catch(e){notice(e.message,true);}};
  $('contact-auto').onchange=async()=>{try{await send({type:'contacts-configure',owner,automatic:$('contact-auto').checked});notice('已保存。手动添加和 @ 插入仍可随时使用。');}catch(e){$('contact-auto').checked=!$('contact-auto').checked;notice(e.message,true);}};
  $('contact-search').oninput=()=>{clearTimeout(timer);++epoch;timer=setTimeout(()=>load(true).catch(e=>notice(e.message,true)),180);};
  $('contacts-pinned').onchange=()=>load(true).catch(e=>notice(e.message,true));
  $('contacts-prev').onclick=()=>{if(index){index--;void load().catch(e=>notice(e.message,true));}};
  $('contacts-next').onclick=()=>{if(next){cursors[++index]=next;void load().catch(e=>notice(e.message,true));}};
  return{open};
}

import { contactHandle, avatarURL } from './contacts.js';
import { parseCount } from './dom.js';
export const EDITOR='[contenteditable="true"][data-testid^="tweetTextarea_"]';
export function currentOwner(doc=document){return contactHandle(doc.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.slice(1));}
export function articlePerson(article){
  const own=s=>[...article.querySelectorAll(s)].filter(n=>n.closest('article')===article&&!n.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"], div[role="link"][tabindex="0"]'));
  const path=own('time').map(n=>n.closest('a')?.getAttribute('href')).find(h=>/\/status\/\d+/.test(h||''));
  const match=path?.match(/^\/([\w]{1,15})\/status\/(\d+)/);if(!match)return null;
  const handle=contactHandle(match[1]);if(!handle)return null;
  const name=own('[data-testid="User-Name"] a').find(n=>n.getAttribute('href')?.toLowerCase()===`/${handle}`&&!n.textContent.trim().startsWith('@'));
  const avatar=own('a img').find(n=>n.closest('a')?.getAttribute('href')?.toLowerCase()===`/${handle}`);
  const analytics=own(`a[href*="/status/${match[2]}/analytics"]`)[0];
  const metrics={views:analytics?parseCount(analytics.getAttribute('aria-label')||analytics.textContent):null};
  for(const [key,selector] of [['likes','[data-testid="like"],[data-testid="unlike"]'],['replies','[data-testid="reply"]'],['reposts','[data-testid="retweet"],[data-testid="unretweet"]']]){const n=own(selector)[0];metrics[key]=n?parseCount(n.getAttribute('aria-label')||n.textContent||'0'):null;}
  return{handle,id:match[2],displayName:name?.textContent.trim()||'',avatar:avatarURL(avatar?.src),metrics,text:own('[data-testid="tweetText"]').map(n=>n.textContent).join('\n').trim()};
}
export function composerScope(editor){
  let n=editor.parentElement;
  for(let i=0;n&&i<28;i++,n=n.parentElement){if(n.querySelectorAll(EDITOR).length!==1)return null;if(n.querySelector('[data-testid="toolBar"]'))return n;}
  return null;
}
export function saveCaret(editor){
  const selection=editor.ownerDocument.getSelection();if(!selection?.rangeCount)return null;
  const range=selection.getRangeAt(0);if(!editor.contains(range.commonAncestorContainer))return null;
  return{range:range.cloneRange(),text:editor.textContent};
}
function caretOffsets(editor,range){
  const prefix=editor.ownerDocument.createRange();prefix.selectNodeContents(editor);prefix.setEnd(range.startContainer,range.startOffset);const start=prefix.toString().length;
  prefix.setEnd(range.endContainer,range.endOffset);return[start,prefix.toString().length];
}
function rangeAtOffsets(editor,start,end){
  const doc=editor.ownerDocument,range=doc.createRange(),walker=doc.createTreeWalker(editor,4);let n,at=0,first=null,last=null;
  while((n=walker.nextNode())){const size=n.textContent.length;if(!first&&start<=at+size)first=[n,start-at];if(end<=at+size){last=[n,end-at];break;}at+=size;}
  if(first&&last){range.setStart(...first);range.setEnd(...last);}else if(start===0&&end===0){range.selectNodeContents(editor.querySelector('[data-block="true"]')||editor);range.collapse(false);}else throw Error('无法恢复插入位置，请重新选择。');
  return range;
}
export async function insertMention(editor,saved,handle,displayName=''){
  handle=contactHandle(handle);
  if(!handle||!editor.isConnected||!saved||editor.textContent!==saved.text||!editor.contains(saved.range.commonAncestorContainer))throw Error('正文或光标已变化。请点回插入位置，再打开常用 @。');
  const doc=editor.ownerDocument,selection=doc.getSelection(),range=saved.range.cloneRange();range.collapse(false);
  const block=(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement).closest('[data-block="true"]')||editor;
  const prefix=doc.createRange();prefix.selectNodeContents(block);prefix.setEnd(range.startContainer,range.startOffset);
  const text=prefix.toString(),partial=text.match(/(?:^|\s)(@[a-zA-Z0-9_]{0,15})$/);
  if(partial){
    let offset=text.length-partial[1].length;const walker=doc.createTreeWalker(block,4);let n;
    while((n=walker.nextNode())){if(offset<=n.textContent.length){range.setStart(n,offset);break;}offset-=n.textContent.length;}
  }
  const suffix=doc.createRange();suffix.selectNodeContents(block);suffix.setStart(range.endContainer,range.endOffset);
  const nextIsSpace=/^\s/.test(suffix.toString());
  const [start,end]=caretOffsets(editor,range);
  editor.focus({preventScroll:true});
  // Draft ignores selection updates while its focus state is still committing.
  await new Promise(resolve=>doc.defaultView.setTimeout(resolve,0));
  if(!editor.isConnected||editor.textContent!==saved.text||doc.activeElement!==editor)throw Error('正文或光标已变化。请点回插入位置，再打开常用 @。');
  // Focus can replace decorated spans while leaving the text unchanged.
  selection.removeAllRanges();selection.addRange(rangeAtOffsets(editor,start,end));
  // Let Draft's focus / selection handlers commit before replacing decorated @ spans.
  // React's onSelect also listens to keyup on the focused editor. A neutral
  // Shift release syncs the controlled selection without typing or moving it.
  editor.dispatchEvent(new doc.defaultView.KeyboardEvent('keyup',{key:'Shift',bubbles:true}));
  await new Promise(resolve=>doc.defaultView.setTimeout(resolve,0));
  const current=selection.rangeCount?selection.getRangeAt(0):null;
  if(!editor.isConnected||editor.textContent!==saved.text||doc.activeElement!==editor||!current||!editor.contains(current.commonAncestorContainer))throw Error('正文或光标已变化。请点回插入位置，再打开常用 @。');
  const [actualStart,actualEnd]=caretOffsets(editor,current);if(actualStart!==start||actualEnd!==end)throw Error('插入位置已变化，请重新选择。');
  const name=typeof displayName==='string'?Array.from(displayName.replace(/\s+/g,' ').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').trim()).slice(0,80).join(''):'';
  // A display name is plain text, not another account mention or private note.
  const readable=name&&name.replace(/^@/,'').toLowerCase()!==handle?name.replace(/@/g,'＠')+' ':'';
  const value=(partial||!text||/\s$/.test(text)?'':' ')+readable+`@${handle}`+(nextIsSpace?'':' ');
  // X's paste handler updates Draft's controlled state and undo history together.
  // execCommand alone can corrupt text around decorated @ spans. This event owns
  // its plain-text data; it never reads or writes the user's system clipboard.
  const view=doc.defaultView,expected=saved.text.slice(0,start)+value+saved.text.slice(end);
  let handled=false;
  if(view.DataTransfer&&view.ClipboardEvent){
    const data=new view.DataTransfer();data.setData('text/plain',value);
    const paste=new view.ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});
    editor.dispatchEvent(paste);handled=paste.defaultPrevented;
    await new Promise(resolve=>view.setTimeout(resolve,0));
  }
  // Plain contenteditables have no synthetic-paste default action. Never use this
  // fallback for Draft, or retry an accepted paste that did not produce the edit.
  if(!handled&&editor.textContent===saved.text&&!editor.querySelector('[data-contents="true"],[data-editor]')){
    if(!editor.isConnected||doc.activeElement!==editor)throw Error('插入位置已变化，请重新选择。');
    doc.execCommand?.('insertText',false,value);
  }
  if(editor.textContent!==expected)throw Error('未能完成插入，请检查正文，或在联系人页复制 @账号后粘贴。');
  if(nextIsSpace)selection.modify?.('move','forward','character');
  return value;
}
// A send click is an attempt, never a receipt. No draft text is persisted.
export class ReplyReceipt {
  start({owner,target,text,existing=[],at=Date.now()}){
    this.pending=owner&&target&&target.handle!==owner&&text.trim()?{owner,target,text:text.trim(),existing:new Set(existing),at}:null;
  }
  confirm({owner,cleared,posts=[],toastIds=[],at=Date.now()}){
    const p=this.pending;if(!p)return null;
    if(owner!==p.owner||at-p.at>45000){this.pending=null;return null;}
    if(!cleared)return null;
    const id=toastIds.find(id=>!p.existing.has(id))||posts.find(v=>v.handle===p.owner&&!p.existing.has(v.id)&&v.text.trim()===p.text)?.id;
    if(!id)return null;this.pending=null;return{owner:p.owner,contact:p.target,replyId:id};
  }
}

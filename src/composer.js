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
export function insertMention(editor,saved,handle){
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
  editor.focus({preventScroll:true});selection.removeAllRanges();selection.addRange(range);
  // Native edit path keeps React/Draft.js and the browser's undo history in sync.
  const value=(partial||!text||/\s$/.test(text)?'':' ')+`@${handle}`+(nextIsSpace?'':' ');
  if(!doc.execCommand('insertText',false,value))throw Error('X 暂不支持插入。请在联系人页复制 @账号后粘贴。');
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

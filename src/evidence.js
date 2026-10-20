// Public page observations are untrusted and optional. Missing never means zero.
const str=(v,n)=>typeof v==='string'?v.slice(0,n):'';
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
export const numericID=v=>typeof v==='string'&&/^\d{1,25}$/.test(v)?v:null;
const date=v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=Date.now()+60000?v:null;
export function authorEvidence(v){
  if(!v||typeof v!=='object')return null;
  return{userId:numericID(v.userId),followers:count(v.followers),following:count(v.following),posts:count(v.posts),
    joinedAt:date(v.joinedAt),bio:str(v.bio,1000),blueVerified:typeof v.blueVerified==='boolean'?v.blueVerified:null,
    followsYou:typeof v.followsYou==='boolean'?v.followsYou:null,youFollow:typeof v.youFollow==='boolean'?v.youFollow:null,
    observedAt:date(v.observedAt),source:'loaded-x-page'};
}
export function contextEvidence(v){
  if(!v||typeof v!=='object'||!numericID(v.id))return null;
  return{id:v.id,text:str(v.text,6000),createdAt:date(v.createdAt),source:'loaded-x-page'};
}
export function textFeatures(text){
  const chars=Array.from(text),sentences=text.split(/[。！？.!?]+/u).map(s=>s.trim()).filter(Boolean);
  return{characters:chars.length,lines:text.split('\n').length,sentences:sentences.length,
    questionMarks:(text.match(/[?？]/gu)||[]).length,emoji:(text.match(/\p{Extended_Pictographic}/gu)||[]).length,
    punctuation:(text.match(/\p{P}/gu)||[]).length,endsWithPeriod:/[。.]\s*$/u.test(text),
    links:(text.match(/https?:\/\//g)||[]).length};
}
export function modelEvidence(item,settings={}){
  const author=item.author?{...item.author}:null;
  // IDs and personal relationships are not evidence of authorship.
  if(author){delete author.userId;delete author.followsYou;delete author.youFollow;delete author.observedAt;}
  const parent=item.directParent,root=item.root;
  const delay=parent?.createdAt&&item.createdAt?(item.createdAt-parent.createdAt)/1000:null;
  return{author,root:root?{text:root.text,createdAt:root.createdAt,source:root.source}:null,
    directParent:parent?{text:parent.text,createdAt:parent.createdAt,source:parent.source}:null,
    replyDelaySeconds:delay!==null&&delay>=0?delay:null,features:textFeatures(item.text),
    observedAuthorReplies:(item.observedReplies||[]).map(r=>({text:r.text,createdAt:r.createdAt})),
    localAuthorLabels:settings.authorLabels||null,communityLabels:settings.communityLabels||null,
    coverage:{author:!!author,root:!!root,directParent:!!parent,history:'only previously loaded public posts; not a random or complete account sample'}};
}
export function formatFollowers(n){
  if(!Number.isSafeInteger(n)||n<0)return '';
  const compact=(v,s)=>`${(Math.round(v*10)/10).toFixed(1).replace(/\.0$/,'')}${s}`;
  return n>=1e6?compact(n/1e6,'m'):n>=1000?compact(n/1000,'k'):String(n);
}

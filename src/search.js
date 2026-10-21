import { handleOf } from './core.js';

const text = (v, max=400) => typeof v==='string' ? v.trim().slice(0,max) : '';
const literal = v => '"'+v.replace(/["\\\r\n]/g,' ').trim()+'"';
const words = v => text(v).split(/[\s,，]+/u).filter(Boolean).slice(0,20);
const day = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function date(v){if(!v)return'';if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)throw Error('请填写有效日期。');return v;}
function handles(v){return words(v).map(value=>{const h=handleOf(value);if(!h)throw Error('账号请填写 @用户名，多个账号用空格分开。');return h;});}
function number(v){if(v===''||v==null)return null;const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>1e9)throw Error('互动数量请填写 0 到 10 亿之间的整数。');return n;}
export function normalizeSearch(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('搜索条件格式不正确。');
  const result={};
  for(const k of ['all','any','phrase','exclude','from','to','mention'])result[k]=text(input[k]);
  result.raw=text(input.raw,2000);result.mode=input.mode==='raw'?'raw':'builder';
  result.period=['today','7d','30d','90d','custom'].includes(input.period)?input.period:'all';
  result.since=date(text(input.since));result.until=date(text(input.until));
  if(result.since&&result.until&&result.since>result.until)throw Error('开始日期不能晚于截止日期。');
  result.lang=/^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(input.lang||'')?input.lang:'';
  result.media=['images','videos','links','media'].includes(input.media)?input.media:'';
  result.replies=['only','exclude'].includes(input.replies)?input.replies:'';
  result.excludeReposts=input.excludeReposts===true;result.follows=input.follows===true;
  result.sort=input.sort==='top'?'top':'live';
  for(const k of ['likes','reposts','repliesMin'])result[k]=number(input[k]);
  for(const k of ['from','to','mention'])handles(result[k]);
  return result;
}
export function buildSearch(input,now=new Date()){
  const s=normalizeSearch(input);
  if(s.mode==='raw'){if(!s.raw)throw Error('先写一点搜索内容。');return s.raw;}
  const parts=words(s.all).map(literal),any=words(s.any);
  if(any.length)parts.push('('+any.map(literal).join(' OR ')+')');
  if(s.phrase)parts.push(literal(s.phrase));
  parts.push(...words(s.exclude).map(v=>'-'+literal(v)));
  for(const [key,op]of[['from','from:'],['to','to:'],['mention','@']]){
    const list=handles(s[key]).map(h=>op+h);if(list.length)parts.push(list.length===1?list[0]:'('+list.join(' OR ')+')');
  }
  if(s.lang)parts.push('lang:'+s.lang);
  if(s.media)parts.push('filter:'+s.media);
  if(s.replies)parts.push(s.replies==='only'?'filter:replies':'-filter:replies');
  if(s.excludeReposts)parts.push('-filter:nativeretweets');
  if(s.follows)parts.push('filter:follows');
  for(const[k,op]of[['likes','min_faves'],['reposts','min_retweets'],['repliesMin','min_replies']])if(s[k]!==null&&s[k]>0)parts.push(op+':'+s[k]);
  let since=s.period==='custom'?s.since:'',until=s.period==='custom'?s.until:'';
  if(['today','7d','30d','90d'].includes(s.period)){
    const start=new Date(now),end=new Date(now),days=s.period==='today'?1:Number(s.period.slice(0,-1));start.setDate(start.getDate()-days+1);end.setDate(end.getDate()+1);since=day(start);until=day(end);
  }else if(until){const end=new Date(until+'T12:00:00');end.setDate(end.getDate()+1);until=day(end);}
  if(since)parts.push('since:'+since);if(until)parts.push('until:'+until);
  const q=parts.join(' ');if(!q)throw Error('先填关键词、账号或其他条件。');if(q.length>2000)throw Error('搜索条件太长，请精简后重试。');return q;
}
export function searchURL(input,now=new Date()) {const s=normalizeSearch(input);const u=new URL('https://x.com/search');u.search=new URLSearchParams({q:buildSearch(s,now),src:'typed_query',f:s.sort});return u.href;}
export function describeSearch(input){
  const s=normalizeSearch(input);
  if(s.mode==='raw')return '使用自定义搜索语句';
  const parts=[];
  for(const [key,label]of[['all','包含全部'],['any','包含任意'],['phrase','完整短语'],['exclude','排除']])if(s[key])parts.push(`${label}「${s[key]}」`);
  for(const [key,label]of[['from','作者'],['to','回复给'],['mention','提及']])if(s[key])parts.push(label+' '+handles(s[key]).map(h=>'@'+h).join('、'));
  if(s.period!=='all')parts.push(s.period==='custom'?`${s.since||'不限开始'} 至 ${s.until||'不限结束'}`:{today:'今天','7d':'近 7 天','30d':'近 30 天','90d':'近 90 天'}[s.period]);
  if(s.lang)parts.push(({zh:'中文',en:'英语',ja:'日语',ko:'韩语'})[s.lang]||s.lang);
  if(s.media)parts.push(({images:'含图片',videos:'含视频',links:'含链接',media:'含图片或视频'})[s.media]);
  if(s.replies)parts.push(s.replies==='only'?'只看回复':'只看主帖');
  if(s.excludeReposts)parts.push('排除转帖');if(s.follows)parts.push('只看我关注的人');
  for(const[key,label]of[['likes','点赞'],['reposts','转帖'],['repliesMin','回复']])if(s[key]>0)parts.push(`至少 ${s[key]} ${label}`);
  return parts.length?parts.join(' · ')+' · '+(s.sort==='top'?'热门优先':'最新优先'):'填写任意条件即可搜索';
}
// `focus` is the one field the user is expected to edit; `sample` fills its
// placeholder. Everything else in `filters` is preset and stays editable.
export const SEARCH_TEMPLATES=[
  {id:'topic-today',name:'话题今天的热门',category:'找话题',desc:'今天热门、20 赞以上',focus:'all',sample:'AI Agent',filters:{period:'today',sort:'top',likes:20,excludeReposts:true}},
  {id:'topic-zh',name:'中文圈高赞讨论',category:'找话题',desc:'近 7 天中文、100 赞以上',focus:'all',sample:'大模型',filters:{lang:'zh',period:'7d',likes:100,sort:'top',excludeReposts:true}},
  {id:'topic-en',name:'英文圈怎么说',category:'找话题',desc:'近 7 天英文、200 赞以上',focus:'all',sample:'Claude Code',filters:{lang:'en',period:'7d',likes:200,sort:'top',excludeReposts:true}},
  {id:'topic-media',name:'带图或视频的帖子',category:'找话题',desc:'近 7 天含图片或视频',focus:'all',sample:'产品发布',filters:{media:'media',period:'7d',likes:20,excludeReposts:true}},
  {id:'topic-debate',name:'讨论最热烈的',category:'找话题',desc:'近 30 天主帖、20 条回复以上',focus:'all',sample:'开源 商业化',filters:{repliesMin:20,period:'30d',sort:'top',replies:'exclude',excludeReposts:true}},
  {id:'ask-recommend',name:'有人在求推荐',category:'找机会',desc:'近 7 天的提问，适合给出答案',focus:'all',sample:'笔记软件',filters:{any:'求推荐 有没有 推荐一下 哪个好 怎么选',period:'7d',replies:'exclude',excludeReposts:true}},
  {id:'pain-points',name:'吐槽与痛点',category:'找机会',desc:'近 30 天的抱怨和求助',focus:'all',sample:'剪辑',filters:{any:'难用 吐槽 求助 踩坑 太贵',period:'30d',excludeReposts:true}},
  {id:'fresh-follows',name:'关注的人刚发的',category:'找机会',desc:'今天、我关注的人、最新在前，适合早回复',focus:'all',sample:'',filters:{period:'today',sort:'live',follows:true,replies:'exclude',excludeReposts:true}},
  {id:'person-top',name:'某人的高赞帖子',category:'跟人',desc:'这个人 100 赞以上的主帖',focus:'from',sample:'@vista8',filters:{likes:100,sort:'top',replies:'exclude',excludeReposts:true}},
  {id:'person-replies',name:'某人最近的回复',category:'跟人',desc:'这个人近 7 天回复了谁、说了什么',focus:'from',sample:'@vista8',filters:{replies:'only',period:'7d'}},
  {id:'person-links',name:'某人分享的链接',category:'跟人',desc:'这个人发过的链接和资料',focus:'from',sample:'@vista8',filters:{media:'links',excludeReposts:true}},
  {id:'person-about',name:'大家怎么说某人',category:'跟人',desc:'近 30 天提到这个人的主帖',focus:'mention',sample:'@vista8',filters:{period:'30d',replies:'exclude',excludeReposts:true}},
  {id:'me-to-person',name:'我回复某人的',category:'跟人',desc:'我和这个人之间的对话',ownerField:'from',focus:'to',sample:'@vista8',filters:{}},
  {id:'my-top',name:'我发过的高赞帖子',category:'我的账号',desc:'我自己发的、50 赞以上的帖子',ownerField:'from',filters:{likes:50,excludeReposts:true}},
  {id:'my-hits',name:'我的爆款',category:'我的账号',desc:'我自己发的、500 赞以上，热门在前',ownerField:'from',filters:{likes:500,sort:'top',excludeReposts:true}},
  {id:'mentions-me',name:'别人提到我',category:'我的账号',desc:'近 7 天 @ 我的帖子',ownerField:'mention',filters:{period:'7d'}},
  {id:'replies-to-me',name:'我收到的回复',category:'我的账号',desc:'近 7 天别人回复我的内容',ownerField:'to',filters:{replies:'only',period:'7d'}},
  {id:'open-source',name:'近七天的开源项目',category:'资料',desc:'近 7 天聊开源工具和项目、20 赞以上',filters:{all:'开源',any:'工具 项目',period:'7d',likes:20,excludeReposts:true}},
  {id:'ai-practice',name:'AI 讨论与实践',category:'资料',desc:'聊 Claude、Codex、DeepSeek 且有人回复',filters:{any:'Claude Codex DeepSeek',repliesMin:5,period:'7d',excludeReposts:true}},
  {id:'follows-links',name:'关注的人分享的链接',category:'资料',desc:'我关注的人近 7 天分享的链接',filters:{follows:true,media:'links',period:'7d',excludeReposts:true}},
  {id:'indie',name:'产品与独立开发',category:'资料',desc:'近 30 天聊产品与独立开发、30 赞以上',filters:{any:'产品 独立开发',likes:30,period:'30d',excludeReposts:true}},
];
export const SEARCH_TEMPLATE_CATEGORIES=[...new Set(SEARCH_TEMPLATES.map(t=>t.category))];
export function findTemplate(key){const t=typeof key==='number'?SEARCH_TEMPLATES[key]:SEARCH_TEMPLATES.find(t=>t.id===key);if(!t)throw Error('找不到这个模板。');return t;}
export function templateSearch(key,owner){const t=findTemplate(key);if(t.ownerField&&!handleOf(owner))throw Error('先在「账号 → 常用 @」添加你的 X 账号。');return normalizeSearch({...t.filters,...(t.ownerField?{[t.ownerField]:owner}:{})});}
export function importSearches(value){
  if(!value||value.format!=='qiaomu-x-searches'||value.version!==1||!Array.isArray(value.items)||value.items.length>2000)throw Error('请选择乔木 X 助手导出的搜索文件，最多 2,000 条。');
  return value.items.map(row=>{if(!row||!text(row.name,80))throw Error('搜索名称不能为空。');const filters=normalizeSearch(row.filters);buildSearch(filters);return{name:text(row.name,80),category:text(row.category,40),pinned:row.pinned===true,filters};});
}

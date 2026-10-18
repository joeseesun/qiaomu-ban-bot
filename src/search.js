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
export const SEARCH_TEMPLATES=[
  {name:'近七天的开源项目',category:'发现',filters:{all:'开源',any:'工具 项目',period:'7d',likes:20,excludeReposts:true}},
  {name:'AI 讨论与实践',category:'发现',filters:{any:'Claude Codex DeepSeek',repliesMin:5,period:'7d',excludeReposts:true}},
  {name:'我发过的高赞帖子',category:'我的账号',ownerField:'from',filters:{likes:50,excludeReposts:true}},
  {name:'别人提到我',category:'我的账号',ownerField:'mention',filters:{period:'7d'}},
  {name:'我收到的回复',category:'我的账号',ownerField:'to',filters:{replies:'only',period:'7d'}},
  {name:'关注的人分享的链接',category:'资料',filters:{follows:true,media:'links',period:'7d',excludeReposts:true}},
  {name:'产品与独立开发',category:'发现',filters:{any:'产品 独立开发',likes:30,period:'30d',excludeReposts:true}},
];
export function templateSearch(index,owner){const t=SEARCH_TEMPLATES[index];if(!t)throw Error('找不到这个模板。');if(t.ownerField&&!handleOf(owner))throw Error('先在「账号 → 常用 @」添加你的 X 账号。');return normalizeSearch({...t.filters,...(t.ownerField?{[t.ownerField]:owner}:{})});}
export function importSearches(value){
  if(!value||value.format!=='qiaomu-x-searches'||value.version!==1||!Array.isArray(value.items)||value.items.length>2000)throw Error('请选择乔木 X 助手导出的搜索文件，最多 2,000 条。');
  return value.items.map(row=>{if(!row||!text(row.name,80))throw Error('搜索名称不能为空。');const filters=normalizeSearch(row.filters);buildSearch(filters);return{name:text(row.name,80),category:text(row.category,40),pinned:row.pinned===true,filters};});
}

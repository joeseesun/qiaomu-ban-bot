// Synthetic UI fixtures only. These names, relationships and labels are invented.
const rows=[
  {id:'101',name:'小林的产品笔记',handle:'fixture_lin',text:'我试过把想回复的帖子丢进书签，后来发现和资料混在一起，根本找不到。\n单独一个待回复列表，真的会常用。',followers:12200,followsYou:true,youFollow:true,ai:.12},
  {id:'102',name:'山间来信',handle:'fixture_yun',text:'这个观点很有启发性。好的工具确实能让我们更专注于有价值的交流，期待它带来更多可能。',followers:986,followsYou:false,youFollow:false,ai:.86},
  {id:'103',name:'阿树',handle:'fixture_tree',text:'建议加一个回复思路字段。刷到的时候先记两句，晚上回来才不会忘 😂',followers:7200,followsYou:true,youFollow:false,ai:.08},
  {id:'104',name:'北方的咖啡馆',handle:'fixture_cafe',text:'有时只是想补一个具体案例，没必要让模型替我写整段回复。',followers:86,followsYou:false,youFollow:false,ai:.22},
];
for(const r of rows){
  const a=document.createElement('article');a.dataset.testid='tweet';a.dataset.fixtureId=r.id;
  a.innerHTML=`<div class="native"><div class="row"><span class="avatar"></span><div class="body"><div data-testid="User-Name"><a></a><span class="handle"></span><a><time datetime="2026-10-20T08:00:00Z">12 分钟</time></a></div><div class="replying">Replying to @fixture_root</div><div data-testid="tweetText"></div><div role="group"><button data-testid="reply">↩ 12</button><button data-testid="retweet">⇄ 3</button><button data-testid="like">♡ 28</button><span>1,260</span></div></div></div></div>`;
  a.querySelector('.avatar').textContent=r.name[0];const links=a.querySelectorAll('[data-testid="User-Name"] a');links[0].href='/'+r.handle;links[0].textContent=r.name;links[1].href='/'+r.handle+'/status/'+r.id;a.querySelector('.handle').textContent='@'+r.handle;a.querySelector('[data-testid="tweetText"]').textContent=r.text;
  a.__reactFiber$fixture={memoizedProps:{tweet:{id_str:r.id,in_reply_to_status_id_str:'100',user:{id_str:'900'+r.id,screen_name:r.handle,followers_count:r.followers,friends_count:68,statuses_count:234,created_at:'2023-02-08',description:'分享一些实际使用经验。',is_blue_verified:true,followed_by:r.followsYou,following:r.youFollow}}}};
  document.getElementById('posts').append(a);
}
const listeners=[],queue=new Map();
window.chrome={runtime:{onMessage:{addListener:f=>listeners.push(f)},sendMessage:async m=>{
  let data={};
  if(m.type==='snapshot')data={configured:true,settings:{enabled:true,radar:false,filterMode:'label',threshold:.5,duplicates:false,highlightUseful:true,allowlist:[],blocklist:[],wordRules:[]}};
  if(m.type==='workspace-state')data={enabled:false,collectMentions:false};
  if(m.type==='classify')data={model:'synthetic-fixture',scores:{ai_written:rows.find(r=>r.id===m.item.id)?.ai??.1,spam:.01,useful:.2}};
  if(m.type==='author-evidence')data={ai:2,human:7,sampleLimit:40,community:{contributors:6,posts:8,ai:3,human:5,conflictingPosts:1}};
  if(m.type==='inbox-status')data=m.ids.map(id=>({id,status:queue.get(id)||null}));
  if(m.type==='inbox-add'){queue.set(m.item.id,'pending');data={status:'pending'};}
  if(m.type==='learn')data={annotation:m.label};
  if(m.type==='feedback'){data={};listeners.forEach(f=>f({type:'annotation-changed',id:m.item.id}));}
  return{ok:true,data};
}}};

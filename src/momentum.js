// Observed performance, not a calibrated forecast or a reconstruction of X ranking.
const HOUR=3600000,MIN_AGE=10/60;
const count=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
const median=values=>{const a=values.slice().sort((a,b)=>a-b),m=Math.floor(a.length/2);return a.length?(a.length%2?a[m]:(a[m-1]+a[m])/2):null;};
const rank=(value,values)=>(values.filter(v=>v<value).length+.5*values.filter(v=>v===value).length)/values.length;
export function performance(item,{now=Date.now(),history=[],peers=[]}={}){
  const ageHours=Number.isFinite(item.createdAt)&&item.createdAt<=now?(now-item.createdAt)/HOUR:null;
  const metrics=Object.fromEntries(['views','reposts','replies','likes'].map(k=>[k,count(item.metrics?.[k])]));
  const ready=ageHours!==null&&ageHours>=MIN_AGE&&metrics.views!==null;
  const rates=Object.fromEntries(['reposts','replies','likes'].map(k=>[k,metrics.views>0&&metrics[k]!==null?metrics[k]/metrics.views:null]));
  const viewsPerHour=ready?metrics.views/ageHours:null;
  const observations=history.filter(s=>s.id===item.id&&s.createdAt===item.createdAt&&Number.isFinite(s.at)&&s.at>=item.createdAt&&s.at<=now-300000&&s.at>=now-HOUR&&count(s.metrics?.views)!==null&&s.metrics.views<=metrics.views).sort((a,b)=>a.at-b.at);
  const base=metrics.views!==null?observations[0]:null;
  const recentViewsPerHour=base?(metrics.views-base.metrics.views)/((now-base.at)/HOUR):null;
  // Compare distinct observed posts at a similar publication age. Never compare
  // a 10-minute post with a 2-day post or call this a platform-wide percentile.
  const pool=[...new Map(peers.filter(p=>p.id!==item.id&&p.at<=now&&now-p.at<=24*HOUR).map(p=>[p.id,p])).values()].filter(p=>{
    const age=(p.at-p.createdAt)/HOUR;
    return ready&&age>=MIN_AGE&&age>=ageHours/2&&age<=ageHours*2&&count(p.metrics?.views)>0;
  });
  let percentile=null;
  if(ready&&metrics.views>0&&pool.length>=20){
    const ranks=[rank(viewsPerHour,pool.map(p=>p.metrics.views/((p.at-p.createdAt)/HOUR)))];
    // Empirical-Bayes smoothing prevents one interaction / one view from
    // dominating. Each interaction stays separate; no invented X multipliers.
    for(const k of ['reposts','replies','likes']){
      const available=pool.filter(p=>count(p.metrics?.[k])!==null);
      if(metrics[k]===null||available.length<20)continue;
      const exposure=median(available.map(p=>p.metrics.views));
      const prior=median(available.map(p=>p.metrics[k]/p.metrics.views));
      const smooth=p=>(p.metrics[k]+prior*exposure)/(p.metrics.views+exposure);
      ranks.push(rank(smooth({metrics}),available.map(smooth)));
    }
    // A single view metric is useful but not enough for a multi-signal score.
    if(ranks.length>=3)percentile=Math.round(median(ranks)*100);
  }
  return{ageHours,metrics,rates,viewsPerHour,recentViewsPerHour,windowMinutes:base?Math.round((now-base.at)/60000):null,peerCount:pool.length,percentile,status:ready?'observed':'insufficient'};
}
export class MomentumTracker{
  constructor(){this.posts=new Map();}
  observe(item,now=Date.now()){
    let history=this.posts.get(item.id)||[];
    if(history[0]?.createdAt!==item.createdAt)history=[];
    const last=history.at(-1),entry={id:item.id,createdAt:item.createdAt,at:now,metrics:{...item.metrics}};
    if(!last||now-last.at>=60000)history.push(entry);
    else if(history.length>1)history[history.length-1]=entry;
    this.posts.delete(item.id);this.posts.set(item.id,history.slice(-60));
    while(this.posts.size>500)this.posts.delete(this.posts.keys().next().value);
    return performance(item,{now,history,peers:[...this.posts.values()].map(h=>h.at(-1))});
  }
}
export function compactRate(n){return n===null?'数据不足':new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1}).format(n)+'/小时';}

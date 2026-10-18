export function postReview(row,now=Date.now()){
  const before=row.initial.metrics,after=row.latest.metrics;
  const growth=Number.isFinite(before.views)&&Number.isFinite(after.views)?after.views-before.views:null;
  const interactions=m=>['likes','replies','reposts'].every(k=>Number.isFinite(m[k]))?m.likes+m.replies+m.reposts:null;
  const initial=interactions(before),latest=interactions(after);
  const samples=[...new Map([row.initial,...(row.samples||[]),row.latest].map(p=>[p.at,p])).values()].sort((a,b)=>a.at-b.at);
  // A later snapshot cannot reconstruct the exact 24-hour outcome.
  const outcome=row.reachedWithin24h?'confirmed':row.createdAt&&now<row.createdAt+86400000?'open':'unknown';
  return{growth,interactionGrowth:initial!==null&&latest!==null?latest-initial:null,outcome,samples};
}
export function reviewSummary(rows,now=Date.now()){
  const reviews=rows.map(r=>postReview(r,now));
  return{total:rows.length,confirmed:reviews.filter(r=>r.outcome==='confirmed').length,open:reviews.filter(r=>r.outcome==='open').length,unknown:reviews.filter(r=>r.outcome==='unknown').length,due:rows.filter(r=>now>=r.reviewAt&&r.latest.at<r.reviewAt).length,withUpdates:rows.filter(r=>r.latest.at>r.initial.at).length};
}
function cell(value){let s=value==null?'':String(value);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return'"'+s.replaceAll('"','""')+'"';}
export function reviewCSV(rows,now=Date.now()){
  return '\ufeff'+[['原帖','作者','内容','看好时间','原始概率','24小时浏览目标','当时浏览','最近浏览','浏览增长','最近观测时间','24小时结果','模型'],...rows.map(r=>{const v=postReview(r,now);return[`https://x.com/${r.handle}/status/${r.id}`,r.displayName||r.handle,r.text,new Date(r.at).toISOString(),r.probability,r.targetViews,r.initial.metrics.views,r.latest.metrics.views,v.growth,new Date(r.latest.at).toISOString(),v.outcome==='confirmed'?'期限内已观测到达标':v.outcome==='open'?'预测窗口内':'缺少期限内证据',r.model];})].map(row=>row.map(cell).join(',')).join('\r\n');
}

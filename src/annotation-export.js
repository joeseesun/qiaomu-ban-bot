const escape=v=>String(v||'').replace(/[\\|`*_\[\]<>]/g,'\\$&').replace(/[\r\n]+/g,' ');
export function annotationExport(rows,format='markdown'){
  const records=rows.map(r=>({id:r.id,handle:r.handle,displayName:r.displayName||'',userId:r.author?.userId||null,label:r.label,at:r.at,text:r.text,parent:r.parent||''}));
  if(format==='json')return JSON.stringify({format:'qiaomu-x-annotations',version:1,exportedAt:new Date().toISOString(),items:records},null,2);
  const accounts=new Map();
  for(const r of records){const key=r.userId||r.handle;const a=accounts.get(key)||{...r,ai:0,human:0};a[r.label]++;accounts.set(key,a);}
  const lines=['# X 人工标注记录','','这是个人对具体文本的判断，不是账号机器人认证，也不是建议自动拉黑的名单。','',`导出时间：${new Date().toISOString()}`,'','## 账号汇总','','| 账号 | 公开账号 ID | AI 标注 | 非 AI 标注 |','| --- | --- | ---: | ---: |'];
  for(const a of accounts.values())lines.push(`| [@${escape(a.handle)}](https://x.com/${a.handle}) | ${a.userId||'未知'} | ${a.ai} | ${a.human} |`);
  lines.push('','## 原帖依据','');
  for(const r of records)lines.push(`- [@${escape(r.handle)} · ${r.label==='ai'?'疑似 AI':'非 AI'}](https://x.com/${r.handle}/status/${r.id}) · ${new Date(r.at).toISOString()}`,`  > ${escape(r.text)}`,'');
  return lines.join('\n');
}

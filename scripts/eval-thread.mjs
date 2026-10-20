// Offline-labelled thread evaluation against a live model. Reads the API key
// from stdin (see live.py --thread); the key is never written or logged.
import { analyze } from '../src/jev.js';
import { DEFAULTS, validateItem, decide, aiScore } from '../src/core.js';
import { threadCues } from '../src/thread.js';
import { readFile, writeFile } from 'node:fs/promises';
const file=process.argv.includes('--thread')?process.argv[process.argv.indexOf('--thread')+1]:null;
const tag=process.argv.includes('--tag')?process.argv[process.argv.indexOf('--tag')+1]:'run';
if(!file||!file.endsWith('.json')||!/^[a-zA-Z0-9_-]{1,64}$/.test(tag||'')){
  throw Error('Usage: --thread <labels.json> [--tag <letters-digits-dashes>]');
}
let input='';for await(const c of process.stdin)input+=c;const {apiKey}=JSON.parse(input);input='';
const data=JSON.parse(await readFile(file,'utf8'));
const settings={...DEFAULTS,provider:'magpie'};
const root={id:data.root.id,text:data.root.text,createdAt:null};
const rows=[];let next=0;
async function worker(){
  while(next<data.replies.length){
    const r=data.replies[next++];
    const siblings=data.replies.filter(s=>s.id!==r.id).map(s=>({id:s.id,handle:s.handle,text:s.text}));
    const item=validateItem({id:r.id,handle:r.handle,kind:'reply',text:r.text,parent:root.text,root,directParent:root,metrics:{},thread:process.argv.includes('--no-thread')?null:threadCues(r,root,siblings)});
    try{const res=await analyze(item,settings,apiKey);rows.push({...r,scores:res.scores,combined:aiScore(item,res),model:res.model,collapse:decide(item,res,settings).collapse});}
    catch(e){rows.push({...r,error:e.message});}
  }
}
await Promise.all(Array.from({length:4},worker));
const t=settings.threshold,m={tp:0,fp:0,fn:0,tn:0,unsureHidden:0,unsure:0,errors:0};
for(const r of rows){if(r.error){m.errors++;continue;}const hit=r.combined>t;
  if(r.label==='ai')hit?m.tp++:m.fn++;else if(r.label==='human')hit?m.fp++:m.tn++;else{m.unsure++;if(hit)m.unsureHidden++;}}
const summary={tag,threshold:t,...m,recall:+(m.tp/Math.max(1,m.tp+m.fn)).toFixed(3),precision:+(m.tp/Math.max(1,m.tp+m.fp)).toFixed(3),model:rows.find(r=>r.model)?.model};
const order=rows.sort((a,b)=>(b.combined??-1)-(a.combined??-1));
await writeFile(file.replace(/\.json$/,`.${tag}.json`),JSON.stringify({summary,rows:order},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary));
for(const r of order)console.log(`${r.label.padEnd(6)} ${r.error?'ERR ':(r.scores.ai_written*100).toFixed(0).padStart(3)+'%→'+(r.combined*100).toFixed(0).padStart(3)+'%'} @${r.handle} ${r.text.replace(/\s+/g,' ').slice(0,40)}`);

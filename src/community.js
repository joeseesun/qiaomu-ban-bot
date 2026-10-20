import { numericID } from './evidence.js';
import { handleOf } from './core.js';
export const COMMUNITY_ORIGIN='https://x-community.qiaomu.ai';
export class Community {
  constructor(storage,fetcher=globalThis.fetch){
    this.storage=storage;this.fetch=fetcher;this.lock=Promise.resolve();this.cache=new Map();
    this.ready=storage.get('community').then(saved=>{this.data={subscribe:false,contribute:false,token:'',scope:'',contributor:'',outbox:{},revision:0,lastSync:null,lastError:'',...saved.community};});
  }
  run(fn){const op=this.lock.then(()=>this.ready).then(fn);this.lock=op.catch(()=>{});return op;}
  save(){return this.storage.set({community:structuredClone(this.data)});}
  async snapshot(){await this.ready;const{subscribe,contribute,scope,contributor,lastSync,lastError}=this.data;return{subscribe,contribute,scope,contributor,lastSync,lastError,connected:!!this.data.token,pending:Object.keys(this.data.outbox).length,origin:COMMUNITY_ORIGIN};}
  async request(path,body,token=this.data.token){
    const response=await this.fetch(COMMUNITY_ORIGIN+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
    const value=await response.json();if(!response.ok)throw Error(value.error||'社区同步暂不可用');
    return value;
  }
  connect(invite){return this.run(async()=>{
    if(this.data.token)throw Error('此浏览器已有社区身份，请保留原身份以便撤回已共享的标注。');
    if(typeof invite!=='string'||invite.trim().length<30||invite.length>100)throw Error('请输入有效的社区邀请码。');
    const result=await this.request('/v1/enroll',{invite:invite.trim()},'');
    if(!/^[a-zA-Z0-9_-]{30,100}$/.test(result.token||'')||!['read','contribute'].includes(result.scope))throw Error('社区返回的身份无效。');
    Object.assign(this.data,{token:result.token,scope:result.scope,contributor:result.contributor,lastError:''});await this.save();return this.snapshot();
  });}
  configure(patch){return this.run(async()=>{
    for(const k of ['subscribe','contribute'])if(typeof patch[k]==='boolean'){
      if(patch[k]&&!this.data.token)throw Error('请先使用邀请码连接社区。');
      if(k==='contribute'&&patch[k]&&this.data.scope!=='contribute')throw Error('此身份仅支持订阅。');
      this.data[k]=patch[k];
    }
    this.cache.clear();await this.save();return this.snapshot();
  });}
  enqueue(item,label){return this.run(async()=>{
    if(!this.data.contribute)return{shared:false};
    const userId=numericID(item.author?.userId),postId=numericID(item.id),handle=handleOf(item.handle);
    if(!userId||!postId||!handle)return{shared:false,reason:'缺少公开账号 ID，标注仅保存本机'};
    if(!['ai','human',null].includes(label))throw Error('无效社区标签');
    if(!this.data.outbox[postId]&&Object.keys(this.data.outbox).length>=1000)throw Error('社区待同步达到 1000 条；本机标注已保存，请先同步。');
    const revision=this.data.revision=Math.max(Date.now(),this.data.revision+1);
    this.data.outbox[postId]={userId,postId,handle,label,revision};await this.save();this.cache.delete(userId);return{shared:true};
  });}
  sync(){return this.run(async()=>{
    if(!this.data.contribute||!this.data.token)return this.snapshot();
    try{
      for(const row of Object.values(this.data.outbox).slice(0,100)){
        const ack=await this.request('/v1/annotations',row);
        if(!Number.isSafeInteger(ack.revision)||ack.revision<row.revision)throw Error('社区未确认当前修订。');
        delete this.data.outbox[row.postId];this.data.revision=Math.max(this.data.revision,ack.revision);await this.save();
      }
      this.data.lastSync=Date.now();this.data.lastError='';
    }catch(e){this.data.lastError=e.message;}
    await this.save();return this.snapshot();
  });}
  async evidence(userId){
    await this.ready;if(!this.data.subscribe||!this.data.token||!numericID(userId))return null;
    const cached=this.cache.get(userId);if(cached?.expires>Date.now())return cached.value;
    const token=this.data.token,result=await this.request('/v1/accounts/query',{userIds:[userId]},token);
    if(!this.data.subscribe||token!==this.data.token)return null;
    const row=result.accounts?.find(r=>r.userId===userId);
    if(!row||['ai','human','posts','contributors','conflictingPosts'].some(k=>!Number.isSafeInteger(row[k])||row[k]<0))throw Error('社区统计格式无效');
    const value={source:'community manual labels excluding your own',ai:row.ai,human:row.human,posts:row.posts,contributors:row.contributors,conflictingPosts:row.conflictingPosts,asOf:result.asOf};
    this.cache.set(userId,{value,expires:Date.now()+300000});while(this.cache.size>500)this.cache.delete(this.cache.keys().next().value);return value;
  }
  withdraw(){return this.run(async()=>{
    if(!this.data.token)throw Error('尚未连接社区。');
    await this.request('/v1/withdraw',{});this.data.outbox={};this.data.contribute=false;this.cache.clear();await this.save();return this.snapshot();
  });}
}

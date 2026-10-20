import { normalizeSettings, validateItem } from './core.js';
import { sameAccount } from './account-rules.js';
import { connectionFields, resolveConnection } from './connection.js';
export const WRITING_KEY='qiaomuXWritingModels', IMAGE_KEY='qiaomuImageModels';
const list=v=>Array.isArray(v)?v:[];
const string=(v,max=200)=>typeof v==='string'?v.slice(0,max):'';
function endpoint(v){const text=string(v,2000);if(!text)return'';const u=new URL(text);if(u.username||u.password||u.hash||!['https:','http:'].includes(u.protocol)||u.protocol==='http:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw Error('备份包含不支持的模型地址');return text;}
function key(v,include){if(!include)return'';const k=string(v,4096);if(/[\r\n]/.test(k))throw Error('备份中的密钥格式无效');return k;}
function writer(value={},include=false){
 const providers=list(value.providers).map(p=>({id:string(p.id),name:string(p.name),baseUrl:endpoint(p.baseUrl),apiKey:key(p.apiKey,include),...(typeof p.apiKeyRequired==='boolean'?{apiKeyRequired:p.apiKeyRequired}:{}),presetId:string(p.presetId)}));
 const ids=new Set(providers.map(p=>p.id));
 const models=list(value.models).map(m=>({id:string(m.id),name:string(m.name),providerId:string(m.providerId),providerModelId:string(m.providerModelId),enabled:m.enabled!==false,reasoningEffort:string(m.reasoningEffort),reasoningEfforts:list(m.reasoningEfforts).map(v=>string(v,40))}));
 if(providers.some(p=>!p.id)||ids.size!==providers.length||new Set(models.map(m=>m.id)).size!==models.length||models.some(m=>!m.id||!ids.has(m.providerId)))throw Error('备份中的写作模型引用无效');
 return{providers,models,interpreterModel:string(value.interpreterModel),interpreterEnabled:true,interpreterAutoRun:false,defaultPromptContext:string(value.defaultPromptContext,10000)};
}
function images(value={},include=false){const models=list(value.models).map(m=>({id:string(m.id),name:string(m.name),sourceId:string(m.sourceId),engine:string(m.engine),baseUrl:endpoint(m.baseUrl),apiKey:key(m.apiKey,include),model:string(m.model),models:list(m.models).map(v=>string(v)),providerId:string(m.providerId)}));if(models.some(m=>!m.id||!['api','ark','gemini','openrouter','oauth'].includes(m.engine))||new Set(models.map(m=>m.id)).size!==models.length)throw Error('备份中的配图模型无效');return{models,defaultId:string(value.defaultId)};}
function annotation(row){const item=validateItem(row);if(item.kind!=='reply'||!['ai','human'].includes(row.label)||!row.key||typeof row.key!=='string'||row.key.length>200||!Number.isFinite(row.at)||row.at<0)throw Error('备份包含无效的标记记录');return{...item,key:row.key,label:row.label,at:row.at};}
export function backupFile(data,storage,annotations,includeKeys=false){
 return{format:'qiaomu-x-helper-backup',version:1,exportedAt:new Date().toISOString(),includesApiKeys:includeKeys,
 settings:normalizeSettings(data.settings),judgmentKey:key(data.apiKey,includeKeys),writing:writer(storage[WRITING_KEY]||{},includeKeys),images:images(storage[IMAGE_KEY]||{},includeKeys),annotations:annotations.map(annotation)};
}
export function parseBackup(value){
 if(!value||value.format!=='qiaomu-x-helper-backup'||value.version!==1)throw Error('请选择乔木 X 助手导出的配置文件（版本 1）');
 if(JSON.stringify(value).length>20e6)throw Error('备份文件不能超过 20 MB');
 if(!value.settings||typeof value.settings!=='object'||!Array.isArray(value.annotations)||!value.writing||!Array.isArray(value.writing.providers)||!Array.isArray(value.writing.models)||!value.images||!Array.isArray(value.images.models))throw Error('备份内容不完整');
 const parsed={settings:normalizeSettings(value.settings),judgmentKey:key(value.judgmentKey,true),writing:writer(value.writing,true),images:images(value.images,true),annotations:value.annotations.map(annotation)};
 const providerIDs=new Set(parsed.writing.providers.map(p=>p.id));if(parsed.images.models.some(m=>m.engine==='oauth'&&!providerIDs.has(m.providerId)))throw Error('配图模型引用的登录服务不存在');
 if(parsed.judgmentKey)resolveConnection(parsed.settings);
 return parsed;
}
export function backupSummary(parsed){return{services:parsed.writing.providers.length,models:parsed.writing.models.length,images:parsed.images.models.length,annotations:parsed.annotations.length,accounts:parsed.settings.accountRules.length+parsed.settings.allowlist.length+parsed.settings.blocklist.length,includesKeys:!!(parsed.judgmentKey||parsed.writing.providers.some(p=>p.apiKey)||parsed.images.models.some(p=>p.apiKey)),origins:[...new Set([...parsed.writing.providers,...parsed.images.models].filter(p=>p.baseUrl).map(p=>new URL(p.baseUrl).origin+'/*').concat(parsed.judgmentKey?[resolveConnection(parsed.settings).origin]:[]))]};}
export function mergeBackup(data,storage,backup,restorePreferences=false){
 const local=data.settings, incoming=backup.settings;
 const settings=normalizeSettings(restorePreferences?{...incoming,provider:local.provider,...connectionFields(local)}:local);
 settings.allowlist=[...local.allowlist];settings.blocklist=[...local.blocklist];settings.accountRules=[...local.accountRules];
 const known=item=>settings.allowlist.includes(item.handle)||settings.blocklist.includes(item.handle)||settings.accountRules.some(r=>sameAccount(r,item));
 for(const field of ['allowlist','blocklist'])for(const handle of incoming[field])if(!known({handle}))settings.accountRules.push({handle,userId:'',key:'',at:0,label:field==='allowlist'?'human':'ai'});
 for(const rule of incoming.accountRules)if(!known(rule))settings.accountRules.push(rule);
 let apiKey=data.apiKey,connection=data.connection;
 if(!apiKey){settings.provider=incoming.provider;Object.assign(settings,connectionFields(incoming));apiKey=backup.judgmentKey;connection=null;}
 const writing=structuredClone(storage[WRITING_KEY]||{providers:[],models:[]});writing.providers=list(writing.providers);writing.models=list(writing.models);
 const conflicts=new Set();
 for(const p of backup.writing.providers){const old=writing.providers.find(v=>v.id===p.id);if(!old)writing.providers.push(p);else if(old.baseUrl!==p.baseUrl)conflicts.add(p.id);else if(!old.apiKey&&!old.oauth&&p.apiKey)old.apiKey=p.apiKey;}
 for(const m of backup.writing.models)if(!conflicts.has(m.providerId)&&!writing.models.some(v=>v.id===m.id))writing.models.push(m);
 if(writing.defaultPromptContext==null)writing.defaultPromptContext=backup.writing.defaultPromptContext;
 if(!writing.interpreterModel&&writing.models.some(m=>m.id===backup.writing.interpreterModel))writing.interpreterModel=backup.writing.interpreterModel;
 const image=structuredClone(storage[IMAGE_KEY]||{models:[],defaultId:''});image.models=list(image.models);
 for(const m of backup.images.models){if(conflicts.has(m.providerId))continue;const old=image.models.find(v=>v.id===m.id);if(!old)image.models.push(m);else if(old.baseUrl===m.baseUrl&&old.engine===m.engine&&old.providerId===m.providerId&&!old.apiKey&&m.apiKey)old.apiKey=m.apiKey;}
 if(!image.defaultId&&image.models.some(m=>m.id===backup.images.defaultId))image.defaultId=backup.images.defaultId;
 return{settings,apiKey,connection,writing,image};
}
// Serializes with manual marking and settings changes. Local conflicts always win.
export function restoreBackup(engine,value,restorePreferences=false){return engine.mutate(async()=>{
 const backup=parseBackup(value),storage=await engine.storage.get([WRITING_KEY,IMAGE_KEY]);
 const merged=mergeBackup(engine.data,storage,backup,restorePreferences),before=structuredClone(engine.data);let added=[];
 engine.revision++;
 try{
  added=await engine.annotations.mergeMissing(backup.annotations);
  await engine.syncAnnotations();
  const next={...engine.data,settings:merged.settings,apiKey:merged.apiKey,connection:merged.connection,cache:{},lastError:''};
  const {learning,...persistent}=next;await engine.writes;
  await engine.storage.set({banbot:persistent,[WRITING_KEY]:merged.writing,[IMAGE_KEY]:merged.image});engine.data=next;engine.revision++;
  return{added:added.length,skipped:backup.annotations.length-added.length};
 }catch(error){await engine.annotations.removeMany(added);engine.data=before;await engine.syncAnnotations();engine.revision++;throw error;}
});}

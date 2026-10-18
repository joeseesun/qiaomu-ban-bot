// All presets use Jev's typed state/questions contract, never chat completions.
export const PROVIDERS = {
  magpie: { name:'乔木 Magpie', baseURL:'https://magpie.qiaomu.ai/v1', model:'typesafe/jev-latest', protocol:'systemone', keyURL:'https://magpie.qiaomu.ai/', help:'已有乔木 Magpie 账号？在控制台创建 API Key。' },
  typesafe: { name:'TypeSafe 官方', baseURL:'https://api.typesafe.ai/v1', model:'jev-latest', protocol:'systemone', keyURL:'https://console.typesafe.ai/', help:'注册 TypeSafe，进入控制台创建 API Key。' },
  openrouter: { name:'OpenRouter', baseURL:'https://openrouter.ai/api', model:'typesafe/jev-1.14', protocol:'decisions', keyURL:'https://openrouter.ai/settings/keys', help:'注册 OpenRouter，在 Keys 页面创建密钥，并确认账户有可用额度。' },
  vercel: { name:'Vercel AI Gateway', baseURL:'https://ai-gateway.vercel.sh/typesafe', model:'typesafe-ai/jev', protocol:'systemone', keyURL:'https://vercel.com/d?to=%2F%5Bteam%5D%2Fai-gateway%2Fapi-keys&title=Get+an+AI+Gateway+API+key', help:'登录 Vercel，在 AI Gateway 中创建 API Key。请使用 Gateway 密钥。' },
  custom: { name:'自定义服务', baseURL:'', model:'', protocol:'systemone', help:'使用支持 Jev 决策接口的服务。请向你的服务商获取地址、密钥和模型名。' },
};

export function connectionFields(value={}) {
  const p=PROVIDERS[value.provider]||PROVIDERS.magpie;
  return {
    baseURL:typeof value.baseURL==='string'&&value.baseURL.trim()?value.baseURL.trim():p.baseURL,
    model:typeof value.model==='string'&&value.model.trim()?value.model.trim():p.model,
    protocol:['systemone','decisions'].includes(value.protocol)?value.protocol:p.protocol,
  };
}
export function mergeSettings(current,patch={}) {
  const reset=patch.provider&&patch.provider!==current.provider?{baseURL:'',model:'',protocol:''}:{};
  return {...current,...reset,...patch};
}
export function resolveConnection(settings={}) {
  const {baseURL,model,protocol}=connectionFields(settings);
  let url;
  try { url=new URL(baseURL); } catch { throw Error('请在高级设置中填写完整的 Base URL。'); }
  const local=['localhost','127.0.0.1'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw Error('Base URL 请使用 HTTPS。本机服务可以使用 HTTP。');
  if(url.username||url.password||url.search||url.hash)throw Error('Base URL 不要包含账号、密码、查询参数或 #。');
  if(!model||model.length>200||/\s/.test(model))throw Error('请填写服务商提供的模型名，不要包含空格。');
  let base=url.href.replace(/\/+$/,'');
  // Accept a pasted full endpoint and /v1 bases without doubling path segments.
  base=base.replace(/\/(?:v1\/systemone|alpha\/decisions|systemone)$/,'');
  if(/\/chat\/completions$/.test(base))throw Error('Jev 使用决策接口。请填写 Base URL，不要填写 chat/completions 地址。');
  const endpoint=protocol==='decisions'?base.replace(/\/(?:v1|alpha)$/,'')+'/alpha/decisions':base+(/\/v1$/.test(base)?'/systemone':'/v1/systemone');
  return {baseURL,model,protocol,endpoint,origin:`${url.protocol}//${url.hostname}/*`};
}
export function sameCredentialTarget(a,b) {
  try{return a.provider===b.provider&&resolveConnection(a).endpoint===resolveConnection(b).endpoint;}catch{return false;}
}
export function connectionIdentity(settings) {
  const c=connectionFields(settings);
  return [settings.provider,c.baseURL,c.protocol,c.model];
}

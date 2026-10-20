const nativeFixtureSend=chrome.runtime.sendMessage;
chrome.runtime.sendMessage=async message=>{
  if(message.type==='sidebar-searches')return{ok:true,data:{items:[{name:'我收藏的开源线索',filters:{all:'开源',period:'7d',media:'links'}}]}};
  return nativeFixtureSend(message);
};

// X's native intent chooses the active X account and lets the user send.
export function replyIntent(id,text=''){
  if(!/^\d{1,25}$/.test(String(id)))throw Error('原帖编号无效。');
  if(typeof text!=='string'||text.length>4000)throw Error('回复草稿最多 4,000 字符。');
  const url=new URL('https://x.com/intent/post');
  url.search=new URLSearchParams({in_reply_to:String(id),text});
  return url.href;
}

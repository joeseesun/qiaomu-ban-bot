import { loadSettings } from './utils/storage-utils';
import { translatePage } from './utils/i18n';
import { initializeInterpreterSettings } from './managers/interpreter-settings';
import { initializeImageModelSettings } from './managers/image-model-settings';
import { initializeWriteSettings } from './managers/write-settings';

async function start() {
  const section = new URLSearchParams(location.search).get('section') || 'write';
  const route = ['write','interpreter','image-models'].includes(section) ? section : 'write';
  const embedded=new URLSearchParams(location.search).has('embed');
  if(!embedded){location.replace('ui.html#'+(route==='write'?'write':'model/'+route));return;}
  document.body.classList.add('embedded');
  for (const node of document.querySelectorAll<HTMLElement>('.settings-section')) node.hidden = node.id !== route + '-section';
  for (const link of document.querySelectorAll<HTMLElement>('[data-writing-route]')) if(link.dataset.writingRoute === route) link.setAttribute('aria-current','page');
  translatePage();
  const warning = document.querySelector('.warning-text');
  if(warning) warning.textContent = '密钥仅保存在本机。写作内容只发给你选择的服务；回复判断单独配置。';
  const add=document.getElementById('add-provider-btn');if(add)add.textContent='添加服务';
  const heading=document.querySelector('#interpreter-section h3');if(heading)heading.textContent='已配置服务';
  await loadSettings();
  if(route === 'interpreter') await initializeInterpreterSettings();
  if(route === 'image-models') await initializeImageModelSettings();
  if(route === 'write') await initializeWriteSettings();
}
void start().catch(error => { const node=document.getElementById('writing-error')!; node.hidden=false; node.textContent='无法打开写作设置：'+error.message; });

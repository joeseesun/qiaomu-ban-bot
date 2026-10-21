// @vitest-environment node
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
const browserMock = vi.hoisted(() => ({tabs:{get:vi.fn(),connect:vi.fn()}}));
vi.mock('../utils/browser-polyfill',()=>({default:browserMock}));
import { connect, injectEngine } from './driver';
const code=(await build({entryPoints:['src/writer/x-publish/x-content.ts'],bundle:true,write:false,format:'iife',target:'chrome120'})).outputFiles[0].text;
const pages:JSDOM[]=[];
afterEach(()=>{pages.forEach(page=>page.window.close());pages.length=0;vi.clearAllMocks();});
function page(url:string) {
 const dom=new JSDOM('<body></body>',{url,runScripts:'outside-only'});pages.push(dom);
 const contentConnections:((port:any)=>void)[]=[];
 dom.window.chrome={runtime:{id:'fixture',getManifest:()=>({version:'fixture'}),onConnect:{addListener:(fn:any)=>contentConnections.push(fn),removeListener:(fn:any)=>{const i=contentConnections.indexOf(fn);if(i>=0)contentConnections.splice(i,1);}}}} as any;
 dom.window.eval(code);
 browserMock.tabs.connect.mockImplementation((_id:number,{name}:{name:string})=>{
  const driverMessages:((message:any)=>void)[]=[],contentMessages:((message:any)=>void)[]=[];
  const port={onMessage:{addListener:(fn:any)=>driverMessages.push(fn)},onDisconnect:{addListener:vi.fn()},disconnect:vi.fn(),postMessage:(m:any)=>contentMessages.forEach(fn=>fn(m))};
  contentConnections.forEach(fn=>fn({name,onMessage:{addListener:(fn:any)=>contentMessages.push(fn)},onDisconnect:{addListener:vi.fn()},postMessage:(m:any)=>driverMessages.forEach(fn=>fn(m))}));
  return port;
 });
 return dom;
}
it('connects the writer driver to the actual statically registered v2 content script',async()=>{
 page('https://x.com/compose/articles');
 const port=await connect(42);
 expect(browserMock.tabs.connect).toHaveBeenCalledWith(42,{name:'qiaomu-write-x-v2'});
 expect(port.disconnect).not.toHaveBeenCalled();port.disconnect();
});
it('refuses a real content-script response from a non-article route',async()=>{
 page('https://x.com/home');
 await expect(connect(42)).rejects.toThrow('X 没有打开文章页');
});
it('waits for manifest injection without requiring scripting permission and stops before a cancelled operation',async()=>{
 browserMock.tabs.get.mockResolvedValue({status:'complete'});
 await expect(injectEngine(42)).resolves.toBeUndefined();
 expect(browserMock.tabs.get).toHaveBeenCalledWith(42);
 const controller=new AbortController();controller.abort();
 await expect(injectEngine(42,controller.signal)).rejects.toMatchObject({stopped:true});
 await expect(connect(42,controller.signal)).rejects.toMatchObject({stopped:true});
 expect(browserMock.tabs.connect).not.toHaveBeenCalled();
});

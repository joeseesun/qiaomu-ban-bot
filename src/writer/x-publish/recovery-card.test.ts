// @vitest-environment node
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
const dom = new JSDOM('<body></body>');
const { window } = dom;
const { document } = window;
const getComputedStyle = window.getComputedStyle.bind(window);
const source=readFileSync('src/writer/x-publish/x-content.ts','utf8');
const code=transformSync(source.slice(source.indexOf('function showCard('),source.indexOf('// ---- navigation')), { loader: 'ts', target: 'es2022' }).code;
function card(){return new Function('document','window','STATUS_ID','t',code+';return showCard;')(document,window,'__qiaomu_write_status__',(s:string)=>s);}
afterEach(()=>{vi.useRealTimers();document.body.innerHTML='';});
it('keeps failure recovery visible until dismissed, rather than removing it after nine seconds',()=>{
 vi.useFakeTimers();const retry=vi.fn();card()('Upload stalled','error',undefined,{owner:'one',retry});
 vi.advanceTimersByTime(10000);expect(document.getElementById('__qiaomu_write_status__')).not.toBeNull();
 const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='重新写入')!;expect(button).toBeTruthy();button.click();button.click();expect(retry).toHaveBeenCalledOnce();
 expect(getComputedStyle(button).width).toBe('auto');
});

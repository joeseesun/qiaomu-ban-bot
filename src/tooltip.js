// Fast, X-styled tooltips for the extension's own controls. The native `title`
// bubble waits about a second; X's own tips appear almost at once. Tips live in
// the control's shadow root as a manual popover so X's transformed virtual list
// cannot misplace them, and are re-created after a host re-render.
const CSS = '.qx-tip{position:fixed;inset:auto;margin:0;padding:3px 6px;border:0;border-radius:4px;background:rgba(91,112,131,.95);color:#fff;font:12px/16px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;z-index:2147483646}';
let seq = 0;
export function tip(target, text) {
  target.dataset.tip = text;
  target.removeAttribute('title');
  if (target.dataset.tipBound) return;
  target.dataset.tipBound = '1';
  let el = null, timer = 0;
  const hide = () => {
    clearTimeout(timer);
    if (el?.isConnected) { if (el.matches?.(':popover-open')) el.hidePopover(); el.hidden = true; }
    removeEventListener('scroll', hide, true);
  };
  const show = () => {
    const root = target.getRootNode();
    if (!target.isConnected || !target.dataset.tip) return;
    if (!el?.isConnected) {
      const parent = root instanceof ShadowRoot ? root : document.body;
      if (!parent.querySelector?.('style[data-qx-tip]')) { const s = document.createElement('style'); s.dataset.qxTip = ''; s.textContent = CSS; parent.append(s); }
      el = document.createElement('span'); el.className = 'qx-tip'; el.id = 'qx-tip-' + (++seq); el.setAttribute('role', 'tooltip'); el.hidden = true;
      if (typeof el.showPopover === 'function') el.setAttribute('popover', 'manual');
      parent.append(el);
    }
    el.textContent = target.dataset.tip;
    // A tip that only repeats the accessible name adds nothing for screen readers.
    if (target.dataset.tip !== target.getAttribute('aria-label')) target.setAttribute('aria-describedby', el.id);
    el.hidden = false;
    if (el.showPopover && !el.matches(':popover-open')) el.showPopover();
    const r = target.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    const below = r.bottom + 6 + h <= innerHeight - 8;
    el.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
    el.style.top = (below ? r.bottom + 6 : r.top - 6 - h) + 'px';
    addEventListener('scroll', hide, { capture: true, passive: true });
  };
  target.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse') return; clearTimeout(timer); timer = setTimeout(show, 120); });
  target.addEventListener('pointerleave', hide);
  target.addEventListener('pointerdown', hide);
  target.addEventListener('focus', () => { if (target.matches(':focus-visible')) show(); });
  target.addEventListener('blur', hide);
  // Consume Escape only while a tip is visible, so it never leaks to X.
  target.addEventListener('keydown', e => { if (e.key === 'Escape' && el && !el.hidden) { e.stopPropagation(); hide(); } });
}

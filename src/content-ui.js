import { createElement, Bot, BookOpenCheck, ChevronDown, Ellipsis, UserRoundCheck, ShieldCheck, UserRoundMinus, UserRoundX, Eye, EyeOff, ExternalLink, Flame } from 'lucide';

export const icons = { Bot, BookOpenCheck, ChevronDown, Ellipsis, UserRoundCheck, ShieldCheck, UserRoundMinus, UserRoundX, Eye, EyeOff, ExternalLink, Flame };
export const icon = node => createElement(node, { width:16, height:16, 'stroke-width':1.7, 'aria-hidden':'true', focusable:'false' });

// The panel is inline, so it remains inside the tweet at narrow widths and does
// not cover X's native actions. Only the extension's Shadow DOM uses these rules.
export const CSS = `
:host { display:block; color:var(--qb-text,#536471); font-family:inherit; font-size:13px; line-height:16px; color-scheme:light dark; }
:host([data-qb-place="inline"]) { display:inline-flex; align-items:center; }
*, *::before, *::after { box-sizing:border-box; }
[hidden] { display:none !important; }
svg { flex:none; }
.bar { padding:4px 0; }
.toolbar { display:flex; align-items:center; gap:6px; min-width:0; min-height:28px; }
.label { flex:1; min-width:0; overflow-wrap:anywhere; }
.prob { font-variant-numeric:tabular-nums; font-weight:600; color:var(--qb-strong); }
.muted { font-size:13px; }
button { display:inline-flex; justify-content:center; align-items:center; gap:6px; flex:none; min-height:28px; font:inherit; cursor:pointer; border:0; background:transparent; color:inherit; padding:4px 8px; border-radius:999px; white-space:nowrap; transition:background-color 120ms ease-out, color 120ms ease-out; }
button:hover { background:rgba(29,155,240,.1); color:rgb(29,155,240); }
button:active { background:rgba(29,155,240,.2); }
button:focus-visible { outline:2px solid rgb(29,155,240); outline-offset:1px; }
button:disabled { opacity:.5; cursor:wait; }
.icon-button { width:34px; height:34px; padding:0; }
.icon-button svg { width:18.75px; height:18.75px; }

/* Inline: a peer of X's reply/repost/like buttons. */
.bar.inline { padding:0; }
.inline .toolbar { min-height:34px; gap:0; }
.trigger { width:auto; min-width:34px; height:34px; padding:0 8px; gap:2px; font-size:13px; font-variant-numeric:tabular-nums; }
.trigger:not(.high) { padding:0; width:34px; }
.trigger.high { color:var(--qb-amber); font-weight:500; padding:0 10px 0 8px; }
.trigger.high:hover { background:var(--qb-amber-bg); color:var(--qb-amber); }
.trigger.high svg { width:17px; height:17px; }

/* Beside the avatar: icon over the number, centred in X's 40px column. */
:host([data-qb-place="avatar"]) { display:flex; justify-content:center; margin-top:6px; }
.bar.side { padding:0; }
.side .toolbar { min-height:0; justify-content:center; }
.side .trigger, .side .trigger:not(.high) { flex-direction:column; width:auto; min-width:36px; height:auto; padding:4px 2px; gap:1px; border-radius:8px; font-size:12px; line-height:14px; }
.side .trigger svg { width:16px; height:16px; }
.side .trigger.high { padding:4px 2px; }

/* Folded: one quiet native-looking line. */
.bar.folded { padding:12px 0; }
.folded .toolbar { gap:12px; font-size:15px; line-height:20px; }
.folded .toolbar > svg { width:18.75px; height:18.75px; }
.folded .label b, .expanded .label b { font-weight:400; color:var(--qb-strong); }
.folded .handle { white-space:nowrap; }
.link { color:rgb(29,155,240); font-size:15px; padding:6px 12px; }
.bar.expanded { padding:8px 0; margin-bottom:4px; border-bottom:1px solid var(--qb-border); }
.expanded .link { font-size:13px; padding:4px 10px; min-height:28px; }
.folded .disclosure, .expanded .disclosure { width:34px; height:34px; }

/* Menu: X dropdown look. Top layer when popover is available. */
.panel { margin-top:8px; padding:4px 0; background:var(--qb-button); color:var(--qb-strong); border:1px solid var(--qb-border); border-radius:12px; font-size:15px; line-height:20px; }
.panel.pop { position:fixed; inset:auto; margin:0; width:min(300px,calc(100vw - 24px)); max-height:calc(100vh - 24px); overflow:auto; border:0; box-shadow:rgba(101,119,134,.2) 0 0 15px, rgba(101,119,134,.15) 0 0 3px 1px; }
.pop-head { padding:12px 16px; border-bottom:1px solid var(--qb-border); }
.pop-head strong { display:block; font-weight:700; }
.pop-head strong.warn { color:var(--qb-amber); }
.pop-head small { display:block; margin-top:2px; font-size:13px; line-height:16px; color:var(--qb-text); }
.good { display:flex; align-items:center; gap:6px; margin-top:8px; font-size:13px; color:var(--qb-text); }
.good svg { width:16px; height:16px; }
.scores { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:0; padding:10px 16px; border-bottom:1px solid var(--qb-border); }
.scores dt { font-size:13px; color:var(--qb-text); }
.scores dd { margin:0; font-size:15px; font-weight:700; font-variant-numeric:tabular-nums; }
.hint { margin:0; padding:10px 16px 4px; font-size:13px; line-height:16px; color:var(--qb-text); }
.annotation { display:flex; gap:8px; padding:4px 16px 12px; border-bottom:1px solid var(--qb-border); }
.annotation button { flex:1; min-height:32px; border:1px solid var(--qb-border); color:var(--qb-strong); font-weight:700; font-size:14px; }
.annotation button svg { width:16px; height:16px; }
.annotation button[aria-pressed="true"] { background:var(--qb-strong); border-color:var(--qb-strong); color:var(--qb-button); }
.section { padding:4px 0; }
.section-title { margin:0; padding:8px 16px 2px; font-size:13px; font-weight:400; color:var(--qb-text); }
.actions { display:grid; }
.actions button { justify-content:flex-start; gap:12px; width:100%; min-height:44px; padding:12px 16px; border-radius:0; color:var(--qb-strong); font-weight:700; font-size:15px; text-align:left; white-space:normal; }
.actions button:hover { background:var(--qb-bg); color:var(--qb-strong); }
.actions button svg { width:18.75px; height:18.75px; }
.actions button[aria-pressed="true"] { color:rgb(29,155,240); }
.section .hint { padding:4px 16px 8px; }
.meta { margin:0; padding:8px 16px; border-top:1px solid var(--qb-border); font-size:12px; color:var(--qb-text); }
.panel > button { margin:8px 16px; border:1px solid var(--qb-border); }
.panel > .muted { margin:8px 16px; }
p { margin:7px 0; }
.momentum-panel .momentum-title { margin:0; font-size:14px; line-height:20px; }
.momentum-verdict { font-size:12px; color:var(--qb-text); margin:4px 0 12px; }
.momentum-speed { display:flex; flex-direction:column; gap:4px; padding:0 0 12px; }
.momentum-speed strong { font-size:23px; line-height:28px; letter-spacing:-.5px; font-variant-numeric:tabular-nums; }
.momentum-speed span { font-size:12px; color:var(--qb-text); }
.momentum-panel .scores { padding:12px 0; border-top:1px solid var(--qb-border); gap:12px 24px; }
.momentum-panel .scores dd { display:inline; font-size:16px; line-height:24px; }
.momentum-panel .scores small { margin-left:8px; font-size:12px; color:var(--qb-text); }
.momentum-help { margin:12px 0 0; font-size:12px; line-height:18px; color:var(--qb-text); }
.momentum-help summary { cursor:pointer; width:fit-content; }
.momentum-panel > button { margin:12px 0 0; border:1px solid var(--qb-border); font-size:12px; }
.panel.momentum-panel { padding:16px; }
.forecast-pop .actions { margin:0 -16px; }
.err { color:#f4212e; padding:0 16px; font-size:13px; }
@media (max-width:500px) { .inline .trigger:not(.high) { width:28px; height:28px; min-width:28px; } .inline .trigger.high { width:28px; height:28px; min-width:28px; padding:0; } .inline .trigger.high .trigger-text { display:none; } .inline .toolbar { min-height:28px; } .inline .trigger svg { width:16px; height:16px; } }
@media (prefers-reduced-motion:reduce) { button { transition:none; } }
`;

import { createElement, Bot, BookOpenCheck, ChevronDown, UserRoundCheck, ShieldCheck, UserRoundMinus, UserRoundX, Eye, EyeOff, ExternalLink, Flame } from 'lucide';

export const icons = { Bot, BookOpenCheck, ChevronDown, UserRoundCheck, ShieldCheck, UserRoundMinus, UserRoundX, Eye, EyeOff, ExternalLink, Flame };
export const icon = node => createElement(node, { width:16, height:16, 'stroke-width':1.7, 'aria-hidden':'true', focusable:'false' });

// The panel is inline, so it remains inside the tweet at narrow widths and does
// not cover X's native actions. Only the extension's Shadow DOM uses these rules.
export const CSS = `
:host { display:block; color:var(--qb-text,#666); font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; color-scheme:light dark; }
*, *::before, *::after { box-sizing:border-box; }
[hidden] { display:none !important; }
.bar { padding:4px 0; }
.bar:not(.folded):not(.expanded) .toolbar { justify-content:flex-end; }
.ai-chip { color:#b74339; background:#b7433910; border-radius:999px; padding:1px 8px; font-size:11px; font-weight:600; }
.bar.folded { margin:8px 0; padding:8px 10px; background:var(--qb-bg,#fafafa); border:1px solid var(--qb-border,#eaeaea); border-radius:6px; }
.bar.expanded { margin:0 0 12px; padding:8px 0; border-bottom:1px solid var(--qb-border,#eaeaea); }
.expanded .status { color:var(--qb-strong,#171717); font-weight:500; }
.toolbar { display:flex; align-items:center; gap:6px; min-width:0; min-height:28px; }
.label { flex:1; min-width:0; overflow-wrap:anywhere; }
.score, .prob { font-variant-numeric:tabular-nums; }
.score b, .prob { font-weight:600; color:var(--qb-strong,#171717); }
.status { display:block; font-size:11px; opacity:.85; }
.signals { display:flex; align-items:center; gap:6px; min-width:0; }
.toolbar-spacer { flex:1; }
.annotation { display:flex; flex:none; gap:2px; padding:2px; border:1px solid var(--qb-border,#eaeaea); border-radius:6px; background:var(--qb-bg,#fafafa); }
.annotation button[aria-pressed="true"] { background:var(--qb-strong,#171717); color:var(--qb-button,#fff); }
.annotation .icon-button { width:26px; min-height:24px; padding:3px; }
.signals .label { flex:0 1 auto; }
.good { display:inline-flex; align-items:center; flex:none; padding:3px; }
.muted { font-size:11px; opacity:.85; }
button { display:inline-flex; justify-content:center; align-items:center; gap:6px; flex:none; min-height:28px; font:inherit; line-height:1.4; cursor:pointer; border:1px solid transparent; background:transparent; color:inherit; padding:4px 7px; border-radius:4px; white-space:nowrap; }
button:hover { background:rgba(127,127,127,.1); color:var(--qb-strong,#171717); }
button:active { background:rgba(127,127,127,.18); }
button:focus-visible { outline:1px solid currentColor; outline-offset:2px; }
button:disabled { opacity:.5; cursor:wait; }
button svg { flex:none; }
.icon-button { width:28px; padding:5px; }
.disclosure[aria-expanded="true"] svg { transform:rotate(180deg); }
.panel { margin-top:8px; padding:12px; background:var(--qb-bg,#fafafa); border:1px solid var(--qb-border,#eaeaea); border-radius:6px; }
.folded .panel { padding:10px 0 0; border:0; border-top:1px solid var(--qb-border,#eaeaea); border-radius:0; }
.scores { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:0; padding:0 0 12px; border-bottom:1px solid var(--qb-border,#eaeaea); }
.scores dt { font-size:11px; }
.scores dd { margin:2px 0 0; color:var(--qb-strong,#171717); font-size:18px; font-weight:600; line-height:1.3; font-variant-numeric:tabular-nums; }
.section { margin-top:12px; }
.section:first-child { margin-top:0; }
.section-title { margin:0 0 7px; color:var(--qb-strong,#171717); font-size:11px; font-weight:600; }
.actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
.actions button { min-height:34px; min-width:0; padding:7px 8px; border-color:var(--qb-border,#eaeaea); background:var(--qb-button,#fff); color:var(--qb-strong,#171717); white-space:normal; }
.actions button:hover { background:rgba(127,127,127,.12); }
.actions button[aria-pressed="true"] { border-color:var(--qb-text,#666); }
.hint { margin:7px 0 0; font-size:11px; opacity:.8; }
.meta { margin:12px 0 0; padding-top:9px; border-top:1px solid var(--qb-border,#eaeaea); font-size:10px; opacity:.75; }
p { margin:7px 0; }
.err { color:#b45325; }
@media (max-width:420px) { .toolbar { gap:4px; } .panel { padding:10px; } }
`;

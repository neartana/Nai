/* NOTE: `var` on purpose, so injecting this file twice into one tab is harmless (see defaults.js). */
/* Nai UI styles. One stylesheet inside the shadow root, so nothing leaks in
   or out. Tokens come straight from the brand spec; dark mode overrides them.
   Font: Plus Jakarta Sans when the user has it installed, else system-ui —
   bundling the font files is the listed follow-up. */

var NAI_CSS = `
:host {
  --nai-indigo: #5B5BD6;
  --nai-indigo-hover: #4C4CC7;
  --nai-mint: #4FD1A5;
  --nai-ink: #1C1C24;
  --nai-bg: #F7F7FA;
  --nai-surface: #FFFFFF;
  --nai-line: #D9D9E6;
  --nai-line2: #E8E8F0;
  --nai-text: #1C1C24;
  --nai-text2: #5E5E70;
  --nai-danger: #C84B4B;
  --nai-font: 'Plus Jakarta Sans', system-ui, sans-serif;
}
/* Theme: follows the system unless Settings → Theme forces light or dark
   (the content script sets data-theme on the host). */
:host { --nai-tip: #1C1C24; color-scheme: light dark; }
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    --nai-bg: #1C1C24;
    --nai-surface: #26262F;
    --nai-text: #F7F7FA;
    --nai-text2: #B9B9C7;
    --nai-line: #3A3A48;
    --nai-line2: #32323E;
    --nai-tip: #3A3A48;
  }
}
:host([data-theme="dark"]) {
  --nai-bg: #1C1C24;
  --nai-surface: #26262F;
  --nai-text: #F7F7FA;
  --nai-text2: #B9B9C7;
  --nai-line: #3A3A48;
  --nai-line2: #32323E;
  --nai-tip: #3A3A48;
  color-scheme: dark;
}
:host([data-theme="light"]) { color-scheme: light; }

* { box-sizing: border-box; margin: 0; padding: 0; }
button, input, textarea, select { font: inherit; color: inherit; }
button { cursor: pointer; background: none; border: none; }
:focus-visible { outline: 2px solid var(--nai-indigo); outline-offset: 2px; }

/* ---------- Idle bubble ---------- */

.nai-dock {
  position: fixed;
  right: 20px;
  top: 50%;
  z-index: 2147483647;
  width: 44px;
  height: 44px;
}
.nai-dock[hidden] { display: none; }
.nai-dock-hide {
  position: absolute;
  top: -9px; left: -9px;
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--nai-line);
  border-radius: 50%;
  background: var(--nai-surface);
  color: var(--nai-text2);
  box-shadow: 0 2px 6px rgba(28, 28, 36, 0.2);
  cursor: pointer;
  opacity: 0;
  transition: opacity 150ms ease;
}
.nai-dock-hide::after { content: ''; position: absolute; inset: -9px; } /* bigger touch target */
.nai-dock:hover .nai-dock-hide, .nai-dock:focus-within .nai-dock-hide, .nai-dock-hide:focus-visible { opacity: 1; }
.nai-dock-hide:hover { color: var(--nai-text); }
@media (hover: none) { .nai-dock-hide { opacity: 0.9; } }
.nai-note {
  position: fixed;
  right: 76px;
  z-index: 2147483647;
  max-width: 260px;
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--nai-ink);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  font: 13px/1.4 var(--nai-font);
  box-shadow: 0 6px 20px rgba(28, 28, 36, 0.3);
}
.nai-note[hidden] { display: none; }
.nai-note button {
  flex: none;
  min-height: 32px; padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 16px;
  background: none; color: #fff;
  font: 600 13px var(--nai-font);
  cursor: pointer;
}
.nai-bubble {
  position: relative;
  display: block;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--nai-indigo);
  opacity: 0.7;
  box-shadow: 0 4px 16px rgba(28, 28, 36, 0.25);
  touch-action: none;
  transition: opacity 150ms ease;
}
.nai-bubble:hover, .nai-bubble:focus-visible { opacity: 1; }
.nai-bubble.dragging { transition: none; opacity: 1; cursor: grabbing; }
.nai-eye {
  position: absolute;
  top: 17px;
  width: 5px;
  height: 9px;
  border-radius: 2.5px;
  background: #fff;
}
.nai-eye.l { left: 14px; }
.nai-eye.r { left: 24px; }

/* ---------- Panel shell ---------- */

.nai-panel {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 2147483647;
  width: 400px;
  max-width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--nai-bg);
  color: var(--nai-text);
  font-family: var(--nai-font);
  font-size: 14px;
  line-height: 1.5;
  border-left: 1px solid var(--nai-line);
  box-shadow: -8px 0 24px rgba(28, 28, 36, 0.12);
  transform: translateX(100%);
  opacity: 0;
  visibility: hidden;
  transition: transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms ease, visibility 260ms;
}
.nai-panel.open { transform: translateX(0); opacity: 1; visibility: visible; }

/* ---------- Header ---------- */

.nai-header {
  height: 64px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--nai-line2);
  background: var(--nai-surface);
}
.nai-avatar {
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 50%;
  background: var(--nai-indigo);
  position: relative;
}
.nai-avatar .nai-eye { width: 4px; height: 7px; border-radius: 2px; top: 13px; }
.nai-avatar .nai-eye.l { left: 11px; }
.nai-avatar .nai-eye.r { left: 19px; }
.nai-id { display: flex; align-items: center; gap: 10px; min-width: 0; }
.nai-name { font-weight: 700; font-size: 15px; }
.nai-status { display: flex; align-items: center; gap: 6px; color: var(--nai-text2); font-size: 12px; }
.nai-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--nai-line);
  flex: none;
}
.nai-dot.active { background: var(--nai-mint); }
.nai-header .spacer { flex: 1; }
.nai-icon-btn {
  width: 40px; height: 40px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 10px;
  color: var(--nai-text2);
}
.nai-icon-btn:hover { background: var(--nai-line2); color: var(--nai-text); }
.nai-stop {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 22px;
  border: 1px solid var(--nai-mint);
  color: var(--nai-text);
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
}
.nai-stop:hover { background: var(--nai-line2); }

/* ---------- Conversation ---------- */

.nai-chat { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.nai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.nai-msg { max-width: 100%; }
.nai-msg.user {
  align-self: flex-end;
  max-width: 85%;
  background: var(--nai-indigo);
  color: #fff;
  padding: 10px 14px;
  border-radius: 16px 16px 4px 16px;
  white-space: pre-wrap;
  word-break: break-word;
}
.nai-msg.assistant { align-self: flex-start; width: 100%; }
.nai-msg.assistant .nai-md > :first-child { margin-top: 0; }
.nai-msg.assistant .nai-md > :last-child { margin-bottom: 0; }
.nai-md p { margin: 0 0 8px; }
.nai-md h1, .nai-md h2, .nai-md h3, .nai-md h4 { margin: 12px 0 6px; line-height: 1.3; }
.nai-md h1 { font-size: 18px; } .nai-md h2 { font-size: 16px; }
.nai-md h3, .nai-md h4 { font-size: 15px; }
.nai-md ul, .nai-md ol { margin: 0 0 8px 20px; }
.nai-md blockquote {
  margin: 0 0 8px; padding: 4px 12px;
  border-left: 3px solid var(--nai-line);
  color: var(--nai-text2);
}
.nai-md code {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  background: var(--nai-line2);
  padding: 1px 5px;
  border-radius: 4px;
}
.nai-md pre {
  background: var(--nai-ink);
  color: #F7F7FA;
  padding: 10px 12px;
  border-radius: 10px;
  overflow-x: auto;
  margin: 0 0 8px;
}
.nai-md pre code { background: none; padding: 0; color: inherit; }
.nai-md table { border-collapse: collapse; margin: 0 0 8px; font-size: 13px; }
.nai-md th, .nai-md td { border: 1px solid var(--nai-line); padding: 6px 10px; text-align: left; }
.nai-md th { background: var(--nai-line2); }
.nai-md a { color: var(--nai-indigo); }
.nai-think { color: var(--nai-text2); font-size: 13px; }
.nai-msg .nai-attach-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.nai-msg .nai-thumb { max-width: 180px; border-radius: 8px; display: block; margin-top: 8px; }

.nai-msg.error {
  align-self: stretch;
  border: 1px solid var(--nai-danger);
  border-radius: 12px;
  padding: 10px 14px;
  color: var(--nai-text);
  background: var(--nai-surface);
}
.nai-msg.error p { margin: 0 0 8px; }
.nai-msg.error .nai-text-btn { margin: 0; }

.nai-memcard {
  margin-top: 10px;
  border: 1px solid var(--nai-line);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--nai-surface);
}
.nai-memcard p { font-size: 13px; margin-bottom: 8px; }
.nai-memcard .row { display: flex; gap: 8px; }
.nai-memcard .done-note { font-size: 13px; color: var(--nai-text2); margin: 0; }

/* ---------- Quick-action chips ---------- */

.nai-chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 8px; }
.nai-chip {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--nai-line);
  border-radius: 22px;
  background: var(--nai-surface);
  font-size: 13px;
  font-weight: 600;
}
.nai-chip:hover { border-color: var(--nai-indigo); color: var(--nai-indigo); }

/* ---------- Attachments ---------- */

.nai-attach { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 8px; }
.nai-attach:empty { display: none; }
.nai-pill-file {
  display: inline-flex; align-items: center; gap: 6px;
  max-width: 220px;
  min-height: 32px;
  padding: 4px 8px 4px 12px;
  border: 1px solid var(--nai-line);
  border-radius: 16px;
  background: var(--nai-surface);
  font-size: 12px;
}
.nai-pill-file span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nai-pill-file button {
  width: 24px; height: 24px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--nai-text2); flex: none;
}
.nai-pill-file button:hover { background: var(--nai-line2); color: var(--nai-text); }

/* ---------- Composer ---------- */

.nai-composer {
  position: relative;
  container-type: inline-size;
  container-name: composer;
  flex: none;
  border-top: 1px solid var(--nai-line2);
  background: var(--nai-surface);
  padding: 12px 16px 14px;
}
.nai-input {
  width: 100%;
  border: 1px solid var(--nai-line);
  border-radius: 12px;
  background: var(--nai-bg);
  padding: 10px 12px;
  resize: none;
  max-height: 140px;
  font-family: var(--nai-font);
}
.nai-input:focus { outline: 2px solid var(--nai-indigo); outline-offset: 0; border-color: var(--nai-indigo); }
.nai-composer-row { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.nai-pill {
  min-height: 40px;
  padding: 0 12px;
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--nai-line);
  border-radius: 22px;
  font-size: 13px; font-weight: 600;
  color: var(--nai-text);
  position: relative;
}
.nai-pill:hover:not(:disabled) { border-color: var(--nai-indigo); color: var(--nai-indigo); }
.nai-pill:disabled { opacity: 0.5; cursor: not-allowed; }
.nai-pill.active { border-color: var(--nai-mint); }
.nai-send {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: var(--nai-indigo);
  color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  flex: none;
}
.nai-send:hover:not(:disabled) { background: var(--nai-indigo-hover); }
.nai-send:disabled { opacity: 0.5; cursor: not-allowed; }

/* ---------- Screen menu popover ---------- */

.nai-menu {
  position: absolute;
  bottom: 118px;
  left: 16px;
  background: var(--nai-surface);
  border: 1px solid var(--nai-line);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(28, 28, 36, 0.15);
  padding: 6px;
  display: flex; flex-direction: column;
  min-width: 200px;
}
.nai-menu button {
  min-height: 44px;
  padding: 0 12px;
  text-align: left;
  border-radius: 8px;
  font-size: 13px; font-weight: 600;
}
.nai-menu button:hover { background: var(--nai-line2); }

/* ---------- Drop overlay ---------- */

.nai-drop {
  position: absolute;
  inset: 64px 0 0;
  background: rgba(91, 91, 214, 0.08);
  border: 2px dashed var(--nai-indigo);
  border-radius: 12px;
  margin: 12px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 600;
  color: var(--nai-indigo);
  pointer-events: none;
}

/* ---------- Settings view ---------- */

.nai-settings { flex: 1; display: flex; flex-direction: column; min-height: 0; background: var(--nai-bg); }
.nai-set-head {
  height: 56px; flex: none;
  display: flex; align-items: center; gap: 4px;
  padding: 0 12px;
  border-bottom: 1px solid var(--nai-line2);
}
.nai-set-head h2 { font-size: 16px; font-weight: 700; }
.nai-set-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 20px; }

.nai-primary {
  width: 100%;
  min-height: 44px;
  border-radius: 22px;
  background: var(--nai-indigo);
  color: #fff;
  font-weight: 700;
}
.nai-primary:hover:not(:disabled) { background: var(--nai-indigo-hover); }
.nai-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.nai-text-btn {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--nai-line);
  font-size: 13px; font-weight: 600;
}
.nai-text-btn:hover { border-color: var(--nai-indigo); color: var(--nai-indigo); }

/* ---------- History view ---------- */

.nai-hist-item { display: flex; align-items: stretch; gap: 6px; margin-bottom: 8px; }
.nai-hist-open {
  flex: 1; min-width: 0; min-height: 44px;
  display: flex; flex-direction: column; gap: 2px;
  text-align: left;
  border: 1px solid var(--nai-line);
  border-radius: 12px;
  background: var(--nai-surface);
  padding: 8px 12px;
}
.nai-hist-open:hover { border-color: var(--nai-indigo); }
.nai-hist-title { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nai-hist-time { font-size: 12px; color: var(--nai-text2); }
.nai-hist-del {
  width: 44px; flex: none;
  border: 1px solid var(--nai-line);
  border-radius: 12px;
  color: var(--nai-text2);
  font-size: 16px;
}
.nai-hist-del:hover { border-color: var(--nai-danger); color: var(--nai-danger); }
.nai-hist-empty { color: var(--nai-text2); font-size: 13px; text-align: center; padding: 24px 0; }

/* ---------- Resize handle + unsend ---------- */

.nai-resize {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 5;
  touch-action: none;
}
.nai-resize:hover, .nai-resize.dragging { background: rgba(91, 91, 214, 0.35); }

.nai-msg.user { position: relative; }
.nai-copy {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  border: 0; border-radius: 8px;
  background: none;
  color: var(--nai-text2);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
}
.nai-copy[hidden] { display: none; }
.nai-copy:hover { background: var(--nai-line2); color: var(--nai-text); }
.nai-copy.done { color: var(--nai-mint); }
.nai-msg:hover .nai-copy, .nai-msg:focus-within .nai-copy, .nai-copy:focus-visible { opacity: 1; }
.nai-msg.assistant .nai-copy { margin: 2px 0 0 -8px; }
.nai-msg.user .nai-copy { position: absolute; left: -42px; top: 50%; transform: translateY(-50%); }
@media (hover: none) { .nai-copy { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .nai-copy { transition: none; } }
.nai-unsend {
  position: absolute;
  top: -8px; left: -8px;
  width: 24px; height: 24px;
  border-radius: 50%;
  background: var(--nai-surface);
  border: 1px solid var(--nai-line);
  color: var(--nai-text2);
  font-size: 13px;
  line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
.nai-unsend:hover { border-color: var(--nai-danger); color: var(--nai-danger); }

/* ---------- Toast ---------- */

.nai-toast {
  position: absolute;
  left: 16px; right: 16px; bottom: 16px;
  background: var(--nai-ink);
  color: #F7F7FA;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 13px;
  text-align: center;
  box-shadow: 0 8px 24px rgba(28, 28, 36, 0.3);
}
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) .nai-toast { background: #F7F7FA; color: #1C1C24; }
}
:host([data-theme="dark"]) .nai-toast { background: #F7F7FA; color: #1C1C24; }

[hidden] { display: none !important; }

/* ---------- Skills + web search ---------- */

.nai-pill.icon { width: 40px; padding: 0; justify-content: center; flex: none; }
.nai-pill[aria-pressed="true"] { border-color: var(--nai-indigo); background: rgba(91, 91, 214, 0.12); color: var(--nai-indigo); }
.nai-skillmenu {
  position: absolute;
  left: 12px; right: 12px; bottom: 100%;
  max-height: 260px; overflow-y: auto;
  display: flex; flex-direction: column;
  padding: 6px;
  background: var(--nai-surface);
  border: 1px solid var(--nai-line);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(28, 28, 36, 0.15);
  z-index: 3;
}
.nai-skillmenu[hidden] { display: none; }
.nai-skillmenu button {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  min-height: 40px; padding: 6px 12px;
  border-radius: 8px; text-align: left;
}
.nai-skillmenu button strong { font-size: 13px; }
.nai-skillmenu button small { font-size: 12px; color: var(--nai-text2); }
.nai-skillmenu button:hover, .nai-skillmenu button.sel { background: var(--nai-line2); }

.nai-sources { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--nai-line2); font-size: 12px; }
.nai-sources-title { font-weight: 700; color: var(--nai-text2); margin-bottom: 4px; }
.nai-sources ol { margin: 0; padding-left: 18px; }
.nai-sources li { margin: 2px 0; }
.nai-sources a { color: var(--nai-indigo); text-decoration: none; }
.nai-sources a:hover { text-decoration: underline; }
.nai-sources small { color: var(--nai-text2); }

/* ---------- Tool buttons: icon-only when narrow, labels when there is room ---------- */

.nai-pill:not(.icon) { width: 40px; padding: 0; justify-content: center; }
.nai-pill:not(.icon) > span { display: none; }
@container composer (min-width: 400px) {
  .nai-pill:not(.icon) { width: auto; padding: 0 14px; }
  .nai-pill:not(.icon) > span { display: inline; }
  .nai-pill:not(.icon)[data-tip]::after { display: none; }
}
.nai-pill[data-tip]::after {
  content: attr(data-tip);
  position: absolute; bottom: calc(100% + 8px); left: 50%;
  transform: translate(-50%, 4px);
  padding: 5px 9px; border-radius: 8px;
  background: var(--nai-tip); color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  font: 600 12px/1.35 var(--nai-font); white-space: normal; width: max-content; max-width: 240px; text-align: left;
  opacity: 0; pointer-events: none; z-index: 5;
  transition: opacity 150ms ease, transform 150ms ease;
}
.nai-pill[data-tip]:hover::after, .nai-pill[data-tip]:focus-visible::after {
  opacity: 1; transform: translate(-50%, 0); transition-delay: 350ms;
}
.nai-composer-row .nai-pill:first-child[data-tip]::after { left: 0; transform: translate(0, 4px); }
.nai-composer-row .nai-pill:first-child[data-tip]:hover::after,
.nai-composer-row .nai-pill:first-child[data-tip]:focus-visible::after { transform: translate(0, 0); }

/* ---------- Motion ---------- */

@keyframes naiRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes naiPop { from { opacity: 0; transform: scale(0.96) translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes naiBlink { 0%, 93%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.12); } }
@keyframes naiPulse { 0% { box-shadow: 0 0 0 0 rgba(79, 209, 165, 0.55); } 100% { box-shadow: 0 0 0 8px rgba(79, 209, 165, 0); } }
@keyframes naiDots { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }

.nai-dock { animation: naiPop 380ms 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.nai-eye { transform-origin: 50% 50%; animation: naiBlink 7s infinite; }
.nai-bubble { transition: opacity 150ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 200ms ease; }
.nai-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(91, 91, 214, 0.35); }
.nai-bubble:active { transform: scale(0.95); }
.nai-dot.active { animation: naiPulse 1.6s ease-out infinite; }

.nai-msg { animation: naiRise 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.nai-messages.no-anim .nai-msg { animation: none; }
.nai-think { display: inline-flex; align-items: center; }
.nai-think i {
  display: inline-block; width: 5px; height: 5px; margin-left: 4px; border-radius: 50%;
  background: currentColor; animation: naiDots 1.2s ease-in-out infinite;
}
.nai-think i:nth-of-type(2) { animation-delay: 0.15s; }
.nai-think i:nth-of-type(3) { animation-delay: 0.3s; }
.nai-chip { animation: naiRise 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.nai-chip:nth-child(2) { animation-delay: 50ms; }
.nai-chip:nth-child(3) { animation-delay: 100ms; }
.nai-chip:nth-child(n+4) { animation-delay: 150ms; }

.nai-menu:not([hidden]), .nai-skillmenu:not([hidden]) { animation: naiPop 160ms cubic-bezier(0.2, 0.8, 0.2, 1) both; transform-origin: bottom left; }
.nai-toast:not([hidden]) { animation: naiPop 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.nai-note:not([hidden]) { animation: naiPop 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both; transform-origin: right center; }
.nai-sources { animation: naiRise 260ms ease both; }
.nai-copy.done svg { animation: naiPop 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }

/* tools that are busy (capturing, analyzing, live) breathe */
.nai-pill.active:not(.icon) { border-color: var(--nai-mint); animation: naiPulse 1.6s ease-out infinite; }

/* press feedback */
.nai-pill, .nai-send, .nai-text-btn, .nai-chip, .nai-icon-btn, .nai-primary, .nai-stop {
  transition: transform 120ms ease, background 150ms ease, border-color 150ms ease, color 150ms ease, opacity 150ms ease;
}
.nai-pill:active:not(:disabled), .nai-send:active:not(:disabled), .nai-text-btn:active, .nai-chip:active,
.nai-icon-btn:active, .nai-primary:active:not(:disabled), .nai-stop:active { transform: scale(0.96); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}

/* ---------- ASCII style (default). Settings → Appearance → Style switches it off. ---------- */

:host([data-style="ascii"]) {
  --nai-font: ui-monospace, 'Cascadia Mono', 'SF Mono', Consolas, Menlo, 'Liberation Mono', monospace;
}
:host([data-style="ascii"]) *, :host([data-style="ascii"]) *::before, :host([data-style="ascii"]) *::after {
  border-radius: 0 !important;
  box-shadow: none !important;
}
/* glyph buttons: [x] instead of an icon */
:host([data-style="ascii"]) [data-glyph] svg { display: none; }
:host([data-style="ascii"]) [data-glyph]::before { content: attr(data-glyph); font: 700 13px/1 var(--nai-font); }
:host([data-style="ascii"]) .nai-pill:not(.icon) > span { display: none; }
:host([data-style="ascii"]) .nai-pill:not(.icon) { width: 44px; padding: 0; justify-content: center; }

/* frame: hard borders, dashed separators */
:host([data-style="ascii"]) .nai-panel { border-left: 1px solid var(--nai-text); background: var(--nai-bg); }
:host([data-style="ascii"]) .nai-header { height: 56px; border-bottom: 1px dashed var(--nai-text); }
:host([data-style="ascii"]) .nai-name { font-size: 14px; font-weight: 700; text-transform: lowercase; }
:host([data-style="ascii"]) .nai-name::after { content: '@page:~$'; font-weight: 400; color: var(--nai-text2); margin-left: 2px; }
:host([data-style="ascii"]) .nai-avatar { border: 1px solid var(--nai-text); }
:host([data-style="ascii"]) .nai-dot { border-radius: 0; }
:host([data-style="ascii"]) .nai-dot.active { animation: naiCursor 1s steps(1) infinite; }
:host([data-style="ascii"]) .nai-icon-btn { color: var(--nai-text); }
:host([data-style="ascii"]) .nai-icon-btn:hover { background: var(--nai-text); color: var(--nai-bg); }

/* the log: "> you" and "nai:" instead of bubbles */
:host([data-style="ascii"]) .nai-msg.user {
  align-self: stretch; max-width: 100%; background: none; color: var(--nai-text); padding: 0;
  display: flex; flex-wrap: wrap; gap: 0 8px; align-items: baseline;
}
:host([data-style="ascii"]) .nai-msg.user::before { content: '>'; color: var(--nai-indigo); font-weight: 700; }
:host([data-style="ascii"]) .nai-msg.user .nai-copy { position: static; transform: none; margin-left: auto; }
:host([data-style="ascii"]) .nai-msg.assistant::before { content: 'nai:'; display: block; color: var(--nai-indigo); font-weight: 700; }
:host([data-style="ascii"]) .nai-md pre, :host([data-style="ascii"]) .nai-md code { border: 1px solid var(--nai-text); }
:host([data-style="ascii"]) .nai-md blockquote { border-left: 1px dashed var(--nai-text); }
:host([data-style="ascii"]) .nai-think i { display: none; }
:host([data-style="ascii"]) .nai-think::after { content: '█'; margin-left: 4px; animation: naiCursor 1s steps(1) infinite; }
:host([data-style="ascii"]) .nai-sources { border-top: 1px dashed var(--nai-text); }

/* suggestions look like [ buttons ] */
:host([data-style="ascii"]) .nai-chip { background: none; border: 0; padding: 0 4px; font-weight: 400; color: var(--nai-text); }
:host([data-style="ascii"]) .nai-chip::before { content: '[ '; }
:host([data-style="ascii"]) .nai-chip::after { content: ' ]'; }
:host([data-style="ascii"]) .nai-chip:hover { background: var(--nai-text); color: var(--nai-bg); }

/* composer: boxed prompt, bracket tools */
:host([data-style="ascii"]) .nai-composer { border-top: 1px dashed var(--nai-text); background: var(--nai-bg); }
:host([data-style="ascii"]) .nai-input { border: 1px solid var(--nai-text); background: var(--nai-surface); }
:host([data-style="ascii"]) .nai-input:focus { outline: 2px solid var(--nai-indigo); outline-offset: 0; }
:host([data-style="ascii"]) .nai-pill { border: 1px solid transparent; background: none; color: var(--nai-text); }
:host([data-style="ascii"]) .nai-pill:hover { border-color: var(--nai-text); }
:host([data-style="ascii"]) .nai-pill[aria-pressed="true"], :host([data-style="ascii"]) .nai-pill.active:not(.icon) {
  background: var(--nai-text); color: var(--nai-bg); border-color: var(--nai-text); animation: none;
}
:host([data-style="ascii"]) .nai-send { background: var(--nai-text); color: var(--nai-bg); border: 1px solid var(--nai-text); }
:host([data-style="ascii"]) .nai-send:hover { background: var(--nai-indigo); border-color: var(--nai-indigo); }
:host([data-style="ascii"]) .nai-copy { color: var(--nai-text2); }
:host([data-style="ascii"]) .nai-copy:hover { background: var(--nai-text); color: var(--nai-bg); }

/* floating things */
:host([data-style="ascii"]) .nai-bubble, :host([data-style="ascii"]) .nai-dock-hide { border: 1px solid var(--nai-text); }
:host([data-style="ascii"]) .nai-menu, :host([data-style="ascii"]) .nai-skillmenu, :host([data-style="ascii"]) .nai-toast, :host([data-style="ascii"]) .nai-note {
  border: 1px solid var(--nai-text);
}
:host([data-style="ascii"]) .nai-toast { background: var(--nai-text); color: var(--nai-bg); }
:host([data-style="ascii"]) .nai-skillmenu button:hover, :host([data-style="ascii"]) .nai-skillmenu button.sel { background: var(--nai-text); color: var(--nai-bg); }
:host([data-style="ascii"]) .nai-skillmenu button:hover small, :host([data-style="ascii"]) .nai-skillmenu button.sel small { color: var(--nai-bg); }
:host([data-style="ascii"]) .nai-skillmenu button { min-height: 48px; padding: 6px 12px; }
:host([data-style="ascii"]) .nai-set-head { border-bottom: 1px dashed var(--nai-text); }

@keyframes naiCursor { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  :host([data-style="ascii"]) .nai-think::after { animation: none; }
}

/* ---------- Scan this page: Nai steps aside, a Cancel bar stays ---------- */

:host([data-scanning]) .nai-panel, :host([data-scanning]) .nai-dock, :host([data-scanning]) .nai-note { display: none !important; }
:host([data-capturing]) .nai-scanbar { display: none !important; }
.nai-scanbar {
  position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
  z-index: 2147483647;
  display: flex; align-items: center; gap: 14px;
  padding: 8px 8px 8px 18px;
  border-radius: 999px;
  background: var(--nai-ink); color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 24px rgba(28, 28, 36, 0.35);
  font: 600 13px/1.4 var(--nai-font);
  white-space: nowrap;
  animation: naiPop 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.nai-scanbar button {
  min-height: 36px; padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.55); border-radius: 999px;
  background: none; color: #fff; font: 600 13px var(--nai-font); cursor: pointer;
}
.nai-scanbar button:hover:not(:disabled) { background: #fff; color: var(--nai-ink); }
.nai-scanbar button:disabled { opacity: 0.6; cursor: default; }
:host([data-style="ascii"]) .nai-scanbar { border: 1px solid #fff; }
:host([data-style="ascii"]) .nai-scanbar button { border: 0; padding: 0 6px; }
:host([data-style="ascii"]) .nai-scanbar button::before { content: '[ '; }
:host([data-style="ascii"]) .nai-scanbar button::after { content: ' ]'; }

.nai-pill-thumb { width: 22px; height: 22px; flex: none; object-fit: cover; border-radius: 4px; }
.nai-pill-file:has(.nai-pill-thumb) { padding-left: 4px; }
`;

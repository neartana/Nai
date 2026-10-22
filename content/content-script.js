/* Nai content script: the idle bubble and the whole Copilot-style panel,
   living in one shadow root so page styles never clash. All four input modes
   (keyboard, files, screen, screen-to-prompt) land in the same composer. */

(() => {
  // One live copy per page. A copy left behind by an update/reload can no longer reach the
  // extension, so it is replaced instead of blocking the new one (then Nai "can't open").
  const alive = () => {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; }
  };
  if (window.__nai && typeof window.__nai.alive === 'function' && window.__nai.alive()) return;
  document.querySelectorAll('#nai-host').forEach((n) => n.remove());
  window.__nai = { alive };

  const K = {
    settings: 'nai.settings',
    soul: 'nai.soul',
    memory: 'nai.memory',
    bubbleTop: 'nai.bubbleTop',
    chats: 'nai.chats',
    activeChat: 'nai.activeChat',
    panelWidth: 'nai.panelWidth',
    bubbleHidden: 'nai.bubbleHidden',
    liveFollow: 'nai.liveFollow', // live view that follows whichever tab you are on
    skills: 'nai.skills',
    searchOn: 'nai.searchOn',
  };

  const state = {
    open: false,
    settings: null,
    soul: '',
    memory: '',
    history: [],        // committed {role, content} turns (text-only; images summarized)
    sending: false,
    attachments: [],    // {name, text?, dataUrl?}
    listening: false,
    liveStream: null,
    skills: [],
    searchOn: false,
    skillIdx: 0,
    followLive: false,  // live view follows the active tab (no screen picker)
    liveTimer: null,
    liveFrame: null,
    liveVideo: null,
    editing: null,      // 'soul' | 'memory' | null
    welcomed: false,
    chatId: null,       // current conversation id in nai.chats
    lang: 'en',         // UI language: 'en' | 'id'
    resumed: false,     // already tried resuming the active chat in this tab
    remoteLive: false,  // another tab is live-sharing its screen
  };

  /* When the extension is reloaded or updated, tabs that were already open keep this (stale)
     copy, and every chrome.* call then throws "Extension context invalidated". So all calls
     go through these wrappers: on that error Nai says so once and retires its UI (the toolbar
     icon injects a fresh copy, or refresh the page). Nothing here may throw. */
  let retired = false;
  let mo = null; // the MutationObserver that keeps the host attached

  function retire() {
    if (retired) return;
    retired = true;
    try { if (mo) mo.disconnect(); } catch { /* ignore */ }
    try { toast(t('toastStale'), 8000); } catch { /* the UI may not exist yet */ }
    try { stopLive(); } catch { /* ignore */ }
    setTimeout(() => { try { host.remove(); } catch { /* ignore */ } }, 8000);
  }
  const store = {
    get: (keys) =>
      new Promise((resolve) => {
        try {
          chrome.storage.local.get(keys, (r) => resolve(r || {}));
        } catch {
          retire();
          resolve({});
        }
      }),
    set: (obj) =>
      new Promise((resolve) => {
        try {
          chrome.storage.local.set(obj, () => resolve());
        } catch {
          retire();
          resolve();
        }
      }),
  };
  const sendMsg = async (msg) => {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (e) {
      if (!alive()) {
        retire();
        return null;
      }
      throw e;
    }
  };
  function openChatPort() {
    try {
      return chrome.runtime.connect({ name: 'nai-chat' });
    } catch {
      retire();
      return null;
    }
  }

  const ICONS = {
    globe: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    mic: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    file: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    screen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    gear: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    history: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 9 8 9"/><polyline points="12 7 12 12 15.5 14"/></svg>',
    stop: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  };

  /* ---------------- Shadow DOM skeleton ---------------- */

  const host = document.createElement('div');
  host.id = 'nai-host';
  host.style.all = 'initial'; // page CSS must not restyle the shadow host
  const root = host.attachShadow({ mode: 'open' });
  // Constructed stylesheets aren't subject to page CSP — a <style> tag can be
  // blocked on strict hosts (that's one way Nai "doesn't appear" somewhere).
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(NAI_CSS);
  root.adoptedStyleSheets = [sheet];
  root.innerHTML = `
    <div class="nai-dock">
      <button class="nai-bubble" aria-label="Open Nai">
        <span class="nai-eye l"></span><span class="nai-eye r"></span>
      </button>
      <button type="button" class="nai-dock-hide" aria-label="Hide Nai bubble" title="Hide Nai bubble">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="nai-note" role="status" hidden></div>
    <div class="nai-scanbar" data-el="scanBar" role="status" hidden>
      <span data-el="scanText"></span>
      <button type="button" data-el="scanCancel"></button>
    </div>
    <aside class="nai-panel" aria-label="Nai assistant">
      <div class="nai-resize" data-el="resize" role="separator" aria-orientation="vertical" aria-label="Resize panel"></div>
      <header class="nai-header">
        <div class="nai-id">
          <div class="nai-avatar" aria-hidden="true">
            <span class="nai-eye l"></span><span class="nai-eye r"></span>
          </div>
          <div>
            <div class="nai-name">Nai</div>
            <div class="nai-status"><span class="nai-dot" data-el="dot"></span><span data-el="statusText">Ready</span></div>
          </div>
        </div>
        <button class="nai-stop" data-el="stopBtn" hidden>Stop sharing</button>
        <div class="spacer"></div>
        <button class="nai-icon-btn" data-el="historyBtn" data-glyph="[h]" aria-label="Chat history">${ICONS.history}</button>
        <button class="nai-icon-btn" data-el="settingsBtn" data-glyph="[*]" aria-label="Settings">${ICONS.gear}</button>
        <button class="nai-icon-btn" data-el="closeBtn" data-glyph="[x]" aria-label="Close Nai">${ICONS.close}</button>
      </header>

      <div class="nai-chat" data-el="chatView">
        <div class="nai-messages" data-el="messages" aria-live="polite"></div>
        <div class="nai-chips" data-el="chips"></div>
        <div class="nai-attach" data-el="attachRow"></div>
        <form class="nai-composer" data-el="composer">
          <div class="nai-skillmenu" data-el="skillMenu" role="listbox" hidden></div>
          <textarea class="nai-input" data-el="input" rows="1"
            placeholder="Ask anything about this page" aria-label="Message Nai"></textarea>
          <div class="nai-composer-row">
            <button type="button" class="nai-pill" data-el="micBtn" data-glyph="[m]" aria-pressed="false">${ICONS.mic}<span>Voice</span></button>
            <button type="button" class="nai-pill" data-el="fileBtn" data-glyph="[+]">${ICONS.file}<span>File</span></button>
            <button type="button" class="nai-pill" data-el="screenBtn" data-glyph="[#]">${ICONS.screen}<span>Screen</span></button>
            <button type="button" class="nai-pill icon" data-el="webBtn" data-glyph="[@]" aria-pressed="false" data-i18n-label="webSearch">${ICONS.globe}</button>
            <div class="spacer" style="flex:1"></div>
            <button type="submit" class="nai-send" data-el="sendBtn" data-glyph="[>]" aria-label="Send">${ICONS.send}</button>
          </div>
        </form>
        <div class="nai-menu" data-el="screenMenu" hidden>
          <button type="button" data-screen="scan">Scan this page</button>
          <button type="button" data-screen="live">Share screen live</button>
          <button type="button" data-screen="window">Share a window or screen…</button>
        </div>
      </div>

      <section class="nai-settings" data-el="historyView" hidden>
        <div class="nai-set-head">
          <button class="nai-icon-btn" data-el="histBackBtn" aria-label="Back to chat">${ICONS.back}</button>
          <h2>History</h2>
        </div>
        <div class="nai-set-body">
          <button class="nai-primary" data-el="newChatBtn">New chat</button>
          <div data-el="histList"></div>
        </div>
      </section>

      <div class="nai-drop" data-el="drop" hidden>Drop files to add them to your message</div>
      <div class="nai-toast" data-el="toast" hidden></div>
      <input type="file" data-el="fileInput" hidden multiple
        accept=".txt,.md,.markdown,.csv,.json,.xml,.yml,.yaml,.log,.js,.ts,.jsx,.tsx,.html,.css,.py,.pdf,image/*">
    </aside>
  `;
  document.documentElement.appendChild(host);
  // Single-page sites (GitHub's Turbo, YouTube…) rebuild parts of the page on navigation:
  // if our host gets dropped, put it back.
  const reattach = () => {
    if (retired) return;
    if (!host.isConnected && document.documentElement) document.documentElement.appendChild(host);
  };
  mo = new MutationObserver(reattach);
  mo.observe(document.documentElement, { childList: true });
  ['turbo:load', 'turbo:render', 'pjax:end', 'popstate'].forEach((ev) => document.addEventListener(ev, reattach));

  const el = {};
  root.querySelectorAll('[data-el]').forEach((n) => (el[n.dataset.el] = n));
  const panel = root.querySelector('.nai-panel');
  const bubble = root.querySelector('.nai-bubble');
  const dock = root.querySelector('.nai-dock');
  const dockHide = root.querySelector('.nai-dock-hide');
  const note = root.querySelector('.nai-note');

  /* ---------------- Status ---------------- */

  const t = (k) => (NAI_I18N[state.lang] && NAI_I18N[state.lang][k]) || NAI_I18N.en[k] || k;
  const ACTIVE = new Set(['listening', 'transcribing', 'searching', 'viewing', 'reading', 'thinking']);
  function setStatus(key) {
    el.statusText.textContent = t(key);
    el.dot.classList.toggle('active', ACTIVE.has(key));
  }
  const idleStatus = () => (state.liveStream || state.followLive ? 'viewing' : 'ready');

  let toastTimer;
  function toast(text, ms) {
    if (retired && text !== t('toastStale')) return; // keep the "Nai was updated" notice on screen
    el.toast.textContent = text;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.toast.hidden = true), ms || 3000);
  }

  /* Push the active language into every static label. */
  function applyStrings() {
    bubble.setAttribute('aria-label', t('openNai'));
    dockHide.setAttribute('aria-label', t('hideBubble'));
    dockHide.title = t('hideBubble');
    el.input.placeholder = t('ask');
    el.micBtn.querySelector('span').textContent = t('micShort');
    el.micBtn.setAttribute('aria-label', t(state.listening ? 'micStop' : 'mic'));
    el.micBtn.dataset.tip = t(state.listening ? 'micStop' : 'mic');
    el.fileBtn.setAttribute('aria-label', t('attachFile'));
    el.fileBtn.dataset.tip = t('attachFile');
    el.screenBtn.setAttribute('aria-label', t('screenTip'));
    el.screenBtn.dataset.tip = t('screenTip');
    el.fileBtn.querySelector('span').textContent = t('file');
    el.screenBtn.querySelector('span').textContent = t('screen');
    el.sendBtn.setAttribute('aria-label', t('sendLabel'));
    el.settingsBtn.setAttribute('aria-label', t('settingsLabel'));
    el.historyBtn.setAttribute('aria-label', t('historyLabel'));
    el.closeBtn.setAttribute('aria-label', t('closeNai'));
    el.histBackBtn.setAttribute('aria-label', t('backLabel'));
    el.stopBtn.textContent = t('stopSharing');
    root.querySelector('[data-screen="scan"]').textContent = t('scan');
    root.querySelector('[data-screen="live"]').textContent = t('shareLive');
    root.querySelector('[data-screen="window"]').textContent = t('shareWindow');
    el.drop.textContent = t('dropFiles');
    el.scanCancel.textContent = t('scanCancel');
    root.querySelectorAll('[data-i18n]').forEach((n) => (n.textContent = t(n.dataset.i18n)));
    root.querySelectorAll('[data-i18n-label]').forEach((n) => {
      const txt = t(n.dataset.i18nLabel);
      n.setAttribute('aria-label', txt);
      if (n.classList.contains('nai-pill')) n.dataset.tip = txt; // CSS tooltip
      else n.title = txt;
    });
    el.newChatBtn.textContent = t('histNew');
    el.historyView.querySelector('.nai-set-head h2').textContent = t('histTitle');
    el.resize.setAttribute('aria-label', t('resizeLabel'));
    setStatus(idleStatus());
  }

  /* ---------------- Bubble: drag + click ---------------- */

  function applyBubbleTop(fraction) {
    const clamped = Math.min(0.95, Math.max(0.05, fraction));
    dock.style.top = (clamped * 100).toFixed(2) + '%';
  }

  (async () => {
    const r = await store.get([K.bubbleTop, K.bubbleHidden]);
    if (typeof r[K.bubbleTop] === 'number') applyBubbleTop(r[K.bubbleTop]);
    applyBubbleHidden(!!r[K.bubbleHidden]);
  })();

  /* Hide the bubble while Nai isn't in use. Global (all sites) and synced across open
     tabs. Nai still opens from the toolbar icon or Alt+N; the bubble comes back with
     Undo, or the "Show floating bubble" switch in Settings. */
  let noteTimer;
  function applyBubbleHidden(hidden) {
    state.bubbleHidden = hidden;
    dock.hidden = hidden;
    if (!hidden) note.hidden = true;
  }
  function setBubbleHidden(hidden, withNote) {
    const top = dock.getBoundingClientRect().top;
    applyBubbleHidden(hidden);
    store.set({ [K.bubbleHidden]: hidden });
    clearTimeout(noteTimer);
    if (!(hidden && withNote)) return;
    note.replaceChildren();
    const msg = document.createElement('span');
    msg.textContent = t('bubbleHiddenNote');
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.textContent = t('undo');
    undo.addEventListener('click', () => setBubbleHidden(false));
    note.append(msg, undo);
    note.style.top = Math.max(8, Math.min(window.innerHeight - 90, top - 4)) + 'px';
    note.hidden = false;
    noteTimer = setTimeout(() => (note.hidden = true), 8000);
  }
  dockHide.addEventListener('click', (e) => {
    e.stopPropagation();
    setBubbleHidden(true, true);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[K.bubbleHidden]) applyBubbleHidden(!!changes[K.bubbleHidden].newValue);
  });

  let drag = null;
  bubble.addEventListener('pointerdown', (e) => {
    drag = { startY: e.clientY, startTop: dock.getBoundingClientRect().top, moved: false };
    bubble.setPointerCapture(e.pointerId);
  });
  bubble.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < 5) return;
    drag.moved = true;
    bubble.classList.add('dragging');
    const px = Math.min(window.innerHeight - 52, Math.max(8, drag.startTop + dy));
    dock.style.top = px + 'px';
  });
  bubble.addEventListener('pointerup', () => {
    if (!drag) return;
    bubble.classList.remove('dragging');
    if (drag.moved) {
      const top = dock.getBoundingClientRect().top;
      store.set({ [K.bubbleTop]: (top + 22) / window.innerHeight });
    } else {
      openPanel();
    }
    drag = null;
  });
  bubble.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPanel(); }
  });

  /* ---------------- Panel open/close ---------------- */

  // Push the page aside only when the host keeps ~900px of usable width;
  // below that, overlay instead of clipping the page (R1).
  // ponytail: page elements with position:fixed;right:0 are viewport-relative
  // and can still sit under the panel — no generic fix without rewriting the
  // site's own CSS.
  let pushed = false;
  function currentWidth() {
    return parseInt(panel.style.width, 10) || 400;
  }
  function pushPage() {
    if (pushed) return;
    const w = currentWidth();
    if (window.innerWidth - w < 900) return;
    pushed = true;
    document.documentElement.style.setProperty('margin-right', w + 'px', 'important');
  }
  function unpushPage() {
    if (!pushed) return;
    pushed = false;
    document.documentElement.style.removeProperty('margin-right');
  }
  function setPanelWidth(px, persist) {
    const w = Math.max(300, Math.min(720, Math.min(px, window.innerWidth * 0.9)));
    panel.style.width = w + 'px';
    if (pushed) {
      unpushPage();
      pushPage();
    }
    if (persist) store.set({ [K.panelWidth]: w });
  }

  el.resize.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.resize.classList.add('dragging');
    el.resize.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = panel.getBoundingClientRect().width;
    const move = (ev) => setPanelWidth(startW + (startX - ev.clientX));
    const up = () => {
      el.resize.classList.remove('dragging');
      el.resize.removeEventListener('pointermove', move);
      el.resize.removeEventListener('pointerup', up);
      setPanelWidth(panel.getBoundingClientRect().width, true);
    };
    el.resize.addEventListener('pointermove', move);
    el.resize.addEventListener('pointerup', up);
  });
  // Double-click cycles the presets: compact | normal | wide.
  el.resize.addEventListener('dblclick', () => {
    const presets = [320, 400, 560];
    const cur = panel.getBoundingClientRect().width;
    const next = presets.find((p) => p > cur + 8) || presets[0];
    setPanelWidth(next, true);
  });

  window.addEventListener('resize', () => {
    if (!state.open) return;
    if (pushed && window.innerWidth - currentWidth() < 900) unpushPage();
    else if (!pushed && window.innerWidth - currentWidth() >= 900) pushPage();
  });

  function openPanel() {
    state.open = true;
    panel.classList.add('open');
    pushPage();
    syncLiveState();
    (async () => {
      // Continue the ongoing conversation, whatever tab it started in.
      if (!state.resumed) {
        state.resumed = true;
        if (!state.history.length && !historyOff()) {
          const chats = await loadChats();
          const r = await store.get(K.activeChat);
          const target = K.activeChat in r
            ? chats.find((c) => c.id === r[K.activeChat])
            : chats[0];
          if (target) await loadChat(target.id);
        }
      }
      if (!state.welcomed) {
        state.welcomed = true;
        if (!state.settings?.apiKey && !state.history.length) showWelcome();
      }
    })();
    el.input.focus();
  }
  function closePanel() {
    state.open = false;
    panel.classList.remove('open');
    unpushPage();
    stopVoice(true);
    hideScreenMenu();
    closeHistoryView();
  }
  el.closeBtn.addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.open) closePanel();
  });
  // Page shortcuts (YouTube "k", "/" search, Gmail keys…) must not fire while
  // typing in Nai: keyboard events are composed and cross the shadow boundary.
  for (const type of ['keydown', 'keypress', 'keyup']) {
    panel.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === 'keydown' && e.key === 'Escape') closePanel();
    });
  }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'nai:toggle') {
      (state.open ? closePanel : openPanel)();
      sendResponse({ ok: true });
    }
    if (msg?.type === 'nai:live-status') {
      if (state.liveStream) return; // this tab owns the capture
      state.remoteLive = !!msg.active;
      el.stopBtn.hidden = !msg.active;
      el.screenBtn.classList.toggle('active', !!msg.active);
      setStatus(msg.active ? 'viewing' : 'ready');
    }
    if (msg?.type === 'nai:live-stop-local' && state.liveStream) stopLive(false);
  });

  function showWelcome() {
    const div = document.createElement('div');
    div.className = 'nai-msg assistant';
    const body = document.createElement('div');
    body.className = 'nai-md';
    const p = document.createElement('p');
    p.textContent = t('welcome');
    const btn = document.createElement('button');
    btn.className = 'nai-text-btn';
    btn.textContent = t('openSettings');
    btn.addEventListener('click', () => openOptions());
    body.append(p, btn);
    div.appendChild(body);
    el.messages.appendChild(div);
  }

  /* ---------------- Messages ---------------- */

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API blocked by the page's permissions policy → legacy path.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.readOnly = true;
      ta.setAttribute('aria-hidden', 'true');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0.01;pointer-events:none';
      document.body.appendChild(ta);
      const prevFocus = document.activeElement;
      ta.focus({ preventScroll: true }); // execCommand('copy') only copies a focused selection
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
      try { prevFocus?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
      return ok;
    }
  }

  /* Hover/focus (always visible on touch) copy button. The text to copy is the
     raw message (Markdown for Nai's replies), kept on the element as _naiRaw. */
  function attachCopy(div) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nai-copy';
    btn.innerHTML = ICONS.copy;
    btn.dataset.glyph = '[c]';
    btn.setAttribute('aria-label', t('copy'));
    btn.title = t('copy');
    btn.hidden = !div._naiRaw;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await copyText(div._naiRaw || '');
      toast(ok ? t('toastCopied') : t('toastCopyFailed'));
      if (!ok) return;
      btn.innerHTML = ICONS.check;
      btn.dataset.glyph = '[ok]';
      btn.classList.add('done');
      setTimeout(() => {
        btn.innerHTML = ICONS.copy;
        btn.dataset.glyph = '[c]';
        btn.classList.remove('done');
      }, 1500);
    });
    div.appendChild(btn);
  }
  function setRaw(body, text) {
    const div = body.parentElement;
    div._naiRaw = String(text || '').replace(/```memory-update\s*\n[\s\S]*?```/g, '').trim() + (div._naiSourcesMd || '');
    const btn = div.querySelector('.nai-copy');
    if (btn) btn.hidden = !div._naiRaw;
  }

  function scrollBottom() {
    el.messages.scrollTop = el.messages.scrollHeight;
  }

  function addUserMessage(text, attachments) {
    const div = document.createElement('div');
    div.className = 'nai-msg user';
    if (text) {
      const span = document.createElement('span');
      span.textContent = text;
      div.appendChild(span);
      div._naiRaw = text;
      attachCopy(div);
    }
    if (attachments.length) {
      const list = document.createElement('div');
      list.className = 'nai-attach-list';
      for (const a of attachments) {
        const pics = a.dataUrls || (a.dataUrl ? [a.dataUrl] : []);
        if (pics.length) {
          for (const src of pics.slice(0, 3)) {
            const img = document.createElement('img');
            img.className = 'nai-thumb';
            img.src = src;
            img.alt = a.name;
            list.appendChild(img);
          }
          if (pics.length > 3) {
            const more = document.createElement('span');
            more.className = 'nai-pill-file';
            more.textContent = '+' + (pics.length - 3);
            list.appendChild(more);
          }
        } else {
          const chip = document.createElement('span');
          chip.className = 'nai-pill-file';
          chip.textContent = a.name;
          list.appendChild(chip);
        }
      }
      div.appendChild(list);
    }
    el.messages.appendChild(div);
    scrollBottom();
    return div;
  }

  function addAssistantMessage() {
    const div = document.createElement('div');
    div.className = 'nai-msg assistant';
    const body = document.createElement('div');
    body.className = 'nai-md';
    div.appendChild(body);
    attachCopy(div);
    el.messages.appendChild(div);
    scrollBottom();
    return body;
  }

  function addErrorMessage(text, withSettingsButton, section) {
    const div = document.createElement('div');
    div.className = 'nai-msg error';
    const p = document.createElement('p');
    p.textContent = text;
    div.appendChild(p);
    if (withSettingsButton) {
      const btn = document.createElement('button');
      btn.className = 'nai-text-btn';
      btn.textContent = t('openSettings');
      btn.addEventListener('click', () => openOptions(section));
      div.appendChild(btn);
    }
    el.messages.appendChild(div);
    scrollBottom();
  }

  function explainError(e) {
    if (e.code === 'NO_KEY') {
      return { text: t('errNoKey'), settings: true };
    }
    if (e.code === 'NETWORK') {
      return { text: t('errNetwork'), settings: true };
    }
    if (e.status === 401 || e.status === 403) {
      return { text: t('errBadKey'), settings: true };
    }
    if (e.status === 404) {
      return { text: t('errNotFound'), settings: true };
    }
    if (e.status === 429) {
      return { text: t('errRate'), settings: false };
    }
    return { text: t('errGeneric') + (e.detail || 'unknown error'), settings: true };
  }

  /* ---------------- Quick actions ---------------- */

  function pageExcerpt(max) {
    const text = (document.body?.innerText || '').replace(/\s+\n/g, '\n').trim();
    return text.slice(0, max || 8000);
  }

  function renderChips() {
    el.chips.replaceChildren();
    const chips = [
      {
        label: t('chipTable'),
        prompt: () => 'Summarize the main content of this page as a table.\n\n--- Page: ' + document.title + ' ---\n' + pageExcerpt(),
      },
      {
        label: t('chipTranslate'),
        prompt: () =>
          'Translate the main content of this page into ' + (navigator.language || 'English') +
          '. Keep the structure.\n\n--- Page: ' + document.title + ' ---\n' + pageExcerpt(),
      },
    ];
    const sel = String(window.getSelection?.() || '').trim();
    if (sel) {
      chips.unshift({
        label: t('chipExplain'),
        prompt: () => 'Explain this selected text:\n\n' + sel.slice(0, 4000),
      });
    }
    for (const c of chips) {
      const b = document.createElement('button');
      b.className = 'nai-chip';
      b.textContent = c.label;
      b.addEventListener('click', () => {
        el.chips.replaceChildren();
        send(c.prompt());
      });
      el.chips.appendChild(b);
    }
  }

  /* ---------------- Send + stream ---------------- */

  function buildSystemPrompt() {
    return (
      state.soul +
      '\n\n# memory.md\n' +
      state.memory +
      '\n\n' +
      NAI_MEMORY_RULE +
      alwaysOnSkills() +
      '\n\nYou are Nai, an AI assistant inside the user\'s browser. ' +
      'The user is viewing "' + document.title + '" (' + location.href + '). ' +
      'Page context, when attached, appears under "---" markers. ' +
      'Reply in ' + (state.lang === 'id' ? 'Bahasa Indonesia' : 'English') +
      ' unless the user writes in another language.'
    );
  }

  async function send(rawText) {
    const typed = rawText.trim();
    let text = typed;
    let skill = null;
    const sm = /^\/([\w-]+)(?:\s+([\s\S]*))?$/.exec(typed);
    if (sm && findSkill(sm[1])) {
      skill = findSkill(sm[1]); // "/name rest": the skill's instructions apply to this turn
      text = (sm[2] || '').trim();
    }
    hideSkillMenu();
    if (state.listening) stopVoice(true); // e.g. a suggestion chip was clicked while dictating
    if (state.sending || (!typed && !state.attachments.length)) return;
    // The submit handler already emptied the box: put the message back, so nothing typed is lost.
    const giveBack = () => {
      el.input.value = rawText;
      el.input.dispatchEvent(new Event('input'));
    };
    if (!state.settings?.apiKey) {
      giveBack();
      addErrorMessage(t('errNoKey'), true, 'model');
      return;
    }
    if (!String(state.settings?.model || '').trim()) {
      giveBack();
      addErrorMessage(t('errNoModel'), true, 'model');
      return;
    }

    const images = [];
    let fullText = text;
    for (const a of state.attachments) {
      if (a.dataUrl) images.push(a.dataUrl);
      if (a.dataUrls) images.push(...a.dataUrls);
      if (a.text) fullText += '\n\n--- ' + a.name + ' ---\n' + a.text;
    }
    if (skill && !text && !state.attachments.length) {
      // "/summarize" on its own works on the page you are looking at.
      fullText = 'Page: ' + document.title + ' (' + location.href + ')\n\n' + pageExcerpt(12000);
    }
    if (state.followLive) {
      // Live view that follows the tab you are on: take a fresh picture of THIS tab now.
      const frame = await captureLiveFrame();
      if (frame) {
        images.push(frame);
        fullText += '\n\n' + t('liveFrameNote');
      } else {
        toast(t('toastLiveNoFrame'), 4000);
      }
    } else if (state.liveStream && state.liveFrame) {
      images.push(state.liveFrame);
      fullText += '\n\n' + t('liveFrameNote');
    } else if (state.remoteLive) {
      // Share is owned by another tab — pull the latest frame via the worker.
      try {
        const r = await sendMsg({ type: 'nai:live-get' });
        if (r?.active && r.frame) {
          images.push(r.frame);
          fullText += '\n\n' + t('liveFrameNote');
        }
      } catch { /* share ended between status and send */ }
    }

    let ctxExtra = '';
    let sources = null;
    if ((state.searchOn || skill?.search) && text) {
      if (!searchReady()) {
        toast(t('searchNeedsKey'), 5000);
      } else {
        setStatus('searching');
        const r = await sendMsg({ type: 'nai:search', query: text.slice(0, 300) }).catch(() => null);
        setStatus(idleStatus());
        if (r?.ok && r.results.length) {
          sources = r.results;
          ctxExtra = formatSearch(text, r.results);
        } else {
          toast(r?.ok ? t('searchNoResults') : searchError(r || {}), 5000);
        }
      }
    }
    const skillExtra = skill
      ? '# Skill: /' + skill.name + '\n' + skill.body + '\n\nApply this skill to the user\'s request below.'
      : '';

    const shown = state.attachments.slice();
    state.attachments = [];
    renderAttachments();
    const userDiv = addUserMessage(typed, shown);

    const sendText = fullText + ctxExtra;
    const content = images.length
      ? [{ type: 'text', text: sendText },
         ...images.map((u) => ({ type: 'image_url', image_url: { url: u } }))]
      : fullText;
    const historyText = images.length
      ? fullText + '\n[' + images.length + ' image(s) attached]'
      : fullText;

    streamReply(content, historyText, userDiv, typed, skillExtra, sources);
  }

  function streamReply(userContent, historyText, userDiv, userText, extraSystem, sources) {
    state.sending = true;
    setStatus('thinking');
    el.chips.replaceChildren();
    el.sendBtn.innerHTML = ICONS.stop;
    el.sendBtn.setAttribute('aria-label', t('stopGenerating'));

    // Unsend affordance on the pending user bubble (R4b).
    const un = document.createElement('button');
    un.className = 'nai-unsend';
    un.textContent = '×';
    un.title = t('unsend');
    un.setAttribute('aria-label', t('unsend'));
    un.addEventListener('click', () => state.cancelStream?.(true));
    userDiv.appendChild(un);

    const body = addAssistantMessage();
    if (sources) body.parentElement._naiSources = sources;
    // Reasoning models stream "reasoning_content" first (the service worker
    // skips it), so the bubble can sit empty for seconds — show a placeholder.
    body.innerHTML = '<div class="nai-think"><span>' + t('thinking') + '</span><i></i><i></i><i></i></div>';
    const messages = [
      { role: 'system', content: buildSystemPrompt() + (extraSystem ? '\n\n' + extraSystem : '') },
      ...state.history.slice(-20),
      { role: 'user', content: userContent },
    ];

    const port = openChatPort();
    if (!port) {
      // the extension was updated under this tab: undo the pending bubbles, retire() already told the user
      state.sending = false;
      el.sendBtn.innerHTML = ICONS.send;
      el.sendBtn.setAttribute('aria-label', t('sendLabel'));
      setStatus(idleStatus());
      un.remove();
      body.parentElement.remove();
      return;
    }
    let buf = '';
    let settled = false;

    const settle = () => {
      settled = true;
      state.sending = false;
      state.cancelStream = null;
      el.sendBtn.innerHTML = ICONS.send;
      el.sendBtn.setAttribute('aria-label', t('sendLabel'));
      un.remove();
      setStatus(idleStatus());
      try { port.disconnect(); } catch { /* already gone */ }
    };

    // R4: cancel a pending reply. retract=false keeps the partial answer;
    // retract=true removes both bubbles and restores the input (unsend).
    const cancel = (retract) => {
      if (settled) return;
      settle();
      if (retract) {
        body.parentElement.remove();
        userDiv.remove();
        el.input.value = userText || '';
        el.input.dispatchEvent(new Event('input'));
        el.input.focus();
      } else if (buf) {
        state.history.push({ role: 'user', content: historyText });
        state.history.push({ role: 'assistant', content: buf });
        saveChat();
        setRaw(body, buf);
        postProcess(body, buf);
        renderChips();
      } else {
        body.parentElement.remove(); // nothing streamed yet
      }
    };
    state.cancelStream = cancel;

    port.onMessage.addListener((m) => {
      if (m.type === 'delta') {
        if (!buf) body.textContent = '';
        buf += m.text;
        body.innerHTML = naiMarkdown(buf);
        setRaw(body, buf);
        scrollBottom();
      } else if (m.type === 'done') {
        settle();
        if (!buf) body.innerHTML = '<div class="nai-think">' + t('errEmpty') + '</div>';
        state.history.push({ role: 'user', content: historyText });
        state.history.push({ role: 'assistant', content: buf });
        saveChat();
        setRaw(body, buf);
        renderSources(body);
        setRaw(body, buf);
        postProcess(body, buf);
        renderChips();
      } else if (m.type === 'error') {
        settle();
        body.parentElement.remove();
        const err = explainError(m);
        addErrorMessage(err.text, err.settings);
      }
    });
    port.onDisconnect.addListener(() => {
      if (!settled) {
        settle();
        body.parentElement.remove();
        addErrorMessage(t('errDropped'), false);
      }
    });

    port.postMessage({ type: 'chat', messages });
  }

  /* Strip a ```memory-update proposal from the reply and offer approval. */
  function postProcess(body, fullText) {
    const match = fullText.match(/```memory-update\s*\n([\s\S]*?)```/);
    if (!match) return;
    const proposed = match[1].trim();
    body.innerHTML = naiMarkdown(fullText.replace(match[0], '').trim());

    const card = document.createElement('div');
    card.className = 'nai-memcard';
    const p = document.createElement('p');
    p.textContent = t('memWants');
    const row = document.createElement('div');
    row.className = 'row';
    const approve = document.createElement('button');
    approve.className = 'nai-text-btn';
    approve.textContent = t('approve');
    const dismiss = document.createElement('button');
    dismiss.className = 'nai-text-btn';
    dismiss.textContent = t('dismiss');
    row.append(approve, dismiss);
    card.append(p, row);
    body.parentElement.appendChild(card);
    scrollBottom();

    approve.addEventListener('click', async () => {
      state.memory = proposed;
      await store.set({ [K.memory]: proposed });
      card.replaceChildren();
      const note = document.createElement('p');
      note.className = 'done-note';
      note.textContent = t('memUpdated') + '.';
      card.appendChild(note);
      toast(t('memUpdated'));
    });
    dismiss.addEventListener('click', () => card.remove());
  }

  /* ---------------- Composer ---------------- */

  el.composer.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.sending) {
      state.cancelStream?.(false); // Send acts as Stop while generating
      return;
    }
    if (state.listening) {
      stopVoice(false); // the first Send just ends the dictation, so its words are in the box; send again
      return;
    }
    const v = el.input.value;
    el.input.value = '';
    el.input.style.height = 'auto';
    send(v);
  });
  el.input.addEventListener('keydown', (e) => {
    if (handleSkillMenuKey(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      el.composer.requestSubmit();
    }
  });
  el.input.addEventListener('input', () => {
    updateSkillMenu();
    el.input.style.height = 'auto';
    el.input.style.height = Math.min(140, el.input.scrollHeight) + 'px';
  });

  /* ---------------- Page screenshots (Scan this page) ---------------- */

  const capErr = (cap, e) => Object.assign(e instanceof Error ? e : new Error(cap), { cap });

  /* ---- Whole-page scan: scroll top to bottom, one screenshot per screen ---- */

  const SCAN_MAX_SECTIONS = 32;       // about 28 screens of page; the scan also stops at the bottom
  const SCAN_STEP = 0.9;        // each section advances 90% of the viewport (~10% overlap)
  const SCAN_SETTLE_MS = 450;   // let lazy-loaded content render after each scroll
  const SCAN_MIN_GAP_MS = 600;  // captureVisibleTab allows about 2 calls per second
  const SECTION_MAX_EDGE = 1600;
  const SECTION_MAX_CHARS = 1500000;     // per picture (data URL length), for short pages
  const SCAN_TOTAL_CHARS = 14000000;     // about 10 MB of pictures per scan: long pages get lighter pictures
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* What scrolls? The document, or (single-page apps) one big inner container. */
  function findScroller() {
    const doc = document.scrollingElement || document.documentElement;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const docScroller = {
      view: vh,
      rect: () => null,
      pos: () => doc.scrollTop,
      max: () => doc.scrollHeight - vh,
      scrollTo: (y) => window.scrollTo({ top: y, behavior: 'instant' }),
    };
    if (doc.scrollHeight - vh > vh * 0.3) return docScroller;
    let best = null;
    for (const n of document.querySelectorAll('div,main,section,article,aside,ul,ol,table')) {
      if (n.clientHeight < vh * 0.4 || n.scrollHeight - n.clientHeight <= n.clientHeight * 0.3) continue;
      const oy = getComputedStyle(n).overflowY;
      if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') continue;
      const r = n.getBoundingClientRect();
      if (r.width * r.height < vw * vh * 0.4 || r.bottom <= 0 || r.top >= vh) continue;
      if (!best || n.scrollHeight > best.scrollHeight) best = n;
    }
    if (!best) return docScroller;
    return {
      view: best.clientHeight,
      rect: () => {
        const r = best.getBoundingClientRect();
        const left = Math.max(0, r.left);
        const top = Math.max(0, r.top);
        return { left, top, width: Math.min(vw, r.right) - left, height: Math.min(vh, r.bottom) - top };
      },
      pos: () => best.scrollTop,
      max: () => best.scrollHeight - best.clientHeight,
      scrollTo: (y) => best.scrollTo({ top: y, behavior: 'instant' }),
    };
  }

  /* Crop a captureVisibleTab image to the scroller's area and shrink it. */
  function cropAndEncode(dataUrl, rect, maxChars = SECTION_MAX_CHARS) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = img.width / window.innerWidth; // device pixels per CSS pixel
        const sx = rect ? Math.round(rect.left * k) : 0;
        const sy = rect ? Math.round(rect.top * k) : 0;
        const sw = rect ? Math.round(rect.width * k) : img.width;
        const sh = rect ? Math.round(rect.height * k) : img.height;
        let edge = Math.min(SECTION_MAX_EDGE, Math.max(sw, sh));
        for (let i = 0; i < 4; i++) {
          const scale = Math.min(1, edge / Math.max(sw, sh));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(sw * scale));
          c.height = Math.max(1, Math.round(sh * scale));
          c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
          const url = c.toDataURL('image/jpeg', i === 0 ? 0.8 : 0.7);
          c.width = c.height = 0;
          if (url.length <= maxChars) return resolve({ url, cssHeight: sh / k });
          edge = Math.round(edge * 0.7);
        }
        reject(capErr('toolarge'));
      };
      img.onerror = () => reject(capErr('failed'));
      img.src = dataUrl;
    });
  }

  /* Scroll the page from the top to the bottom and take one screenshot per screen.
     Nai hides itself meanwhile (so it isn't in the pictures), the page scroll
     position is restored, and Esc cancels. Cap: SCAN_MAX_SECTIONS screens. */
  async function captureWholePage() {
    const sc = findScroller();
    const startY = sc.pos();
    const wasPushed = pushed;
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      el.scanCancel.disabled = true;
      el.scanText.textContent = t('scanCancelling');
    };
    const stopped = () => Object.assign(capErr('cancelled'), { fromScan: true });
    const onKey = (e) => { if (e.key === 'Escape') cancel(); };
    document.addEventListener('keydown', onKey, true);
    el.scanCancel.addEventListener('click', cancel);
    unpushPage();
    // Nai's own UI is hidden while scanning (data-scanning) so it is not in the pictures, except
    // a small Cancel bar. It is hidden too (data-capturing) for the instant of each screenshot.
    host.setAttribute('data-scanning', '');
    el.scanBar.hidden = false;
    const images = [];
    let truncated = false;
    let lastShot = 0;
    const progress = (total) => {
      el.scanText.textContent = t('scanProgress').replace('{n}', images.length).replace('{total}', total);
    };
    try {
      await sleep(300);
      const first = Math.max(1, sc.view * SCAN_STEP);
      const guess = () => Math.min(SCAN_MAX_SECTIONS, Math.max(images.length + 1, Math.ceil(Math.max(0, sc.max()) / first) + 1));
      const perImage = Math.min(SECTION_MAX_CHARS, Math.max(300000, Math.floor(SCAN_TOTAL_CHARS / guess())));
      progress(guess());
      let y = 0;
      for (;;) {
        if (cancelled || document.hidden) throw stopped(); // switching tabs would photograph another page
        sc.scrollTo(y);
        await sleep(SCAN_SETTLE_MS);
        const wait = SCAN_MIN_GAP_MS - (Date.now() - lastShot);
        if (wait > 0) await sleep(wait);
        if (cancelled || document.hidden) throw stopped();
        host.setAttribute('data-capturing', '');
        await sleep(80); // let the bar leave the screen before the picture is taken
        lastShot = Date.now();
        const r = await sendMsg({ type: 'nai:screenshot', quality: 0.9 }).catch(() => null);
        host.removeAttribute('data-capturing');
        if (!r || !r.dataUrl) {
          if (!images.length) throw capErr('nopage'); // can't screenshot this tab at all
          truncated = true;                           // failed midway: keep what we have
          break;
        }
        const shot = await cropAndEncode(r.dataUrl, sc.rect(), perImage);
        images.push(shot.url);
        // Step by what the screenshot really covered (normally the viewport height).
        const covered = Math.min(sc.view, shot.cssHeight);
        const at = sc.pos();
        progress(guess());
        if (at >= sc.max() - 2) break;                // reached the bottom
        if (images.length >= SCAN_MAX_SECTIONS) { truncated = true; break; }
        y = Math.min(sc.max(), at + covered * SCAN_STEP);
        if (y <= at + 1) break;                       // can't scroll any further
      }
      return { images, truncated };
    } finally {
      document.removeEventListener('keydown', onKey, true);
      el.scanCancel.removeEventListener('click', cancel);
      el.scanCancel.disabled = false;
      el.scanBar.hidden = true;
      host.removeAttribute('data-capturing');
      host.removeAttribute('data-scanning');
      sc.scrollTo(startY);
      if (wasPushed) pushPage();
    }
  }

  /* ---------------- Voice ---------------- */

  /* Click the mic to start, click again to stop: the words land in the message box (never
     auto-sent). Engines (Settings -> Voice):
     - "browser": the Web Speech API. It relies on Google's speech servers, which Opera, Brave and
       some other Chromium builds don't ship: there it fails with "network", or just ends silently.
     - "recorder": MediaRecorder + the provider's /audio/transcriptions endpoint (Whisper-compatible),
       called by the service worker with the user's own key.
     - "auto" (default): the browser engine for live text, WITH a recording running next to it as a
       safety net. If the browser engine returns nothing, the recording is transcribed instead, so
       nobody has to repeat themselves. A live level meter in the header shows whether sound arrives.
     Every outcome has its own message: too short, no sound, nothing recognized, empty transcription. */

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canRecord = !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (!SR && !canRecord) {
    el.micBtn.disabled = true;
    el.micBtn.dataset.tip = t('toastNoVoice');
  }

  let voice = null; // the running session
  const MAX_RECORD_MS = 120000;
  const GLYPHS = ' ▁▂▃▄▅▆▇';
  const SILENT_PEAK = 0.015; // loudest sample of the whole take, 0..1: below this the mic delivered silence

  const sttMode = () => {
    const engine = state.settings?.sttEngine || 'auto';
    const recorderOnly = !SR || engine === 'recorder' || (engine === 'auto' && !!state.settings?.sttAutoFallback);
    return {
      engine,
      useSR: !!SR && !recorderOnly,
      record: canRecord && (recorderOnly || engine === 'auto'),
    };
  };

  function voiceUi(on) {
    state.listening = on;
    el.micBtn.classList.toggle('active', on);
    el.micBtn.setAttribute('aria-pressed', String(on));
    el.micBtn.dataset.tip = on ? t('micStop') : t('mic');
    el.micBtn.setAttribute('aria-label', on ? t('micStop') : t('mic'));
    setStatus(on ? 'listening' : idleStatus());
  }

  function putVoiceText(v, text) {
    const live = String(text || '').trim();
    el.input.value = (v.prev && live ? v.prev.replace(/\s+$/, '') + ' ' : v.prev) + live;
    el.input.dispatchEvent(new Event('input'));
  }

  function sttError(r) {
    if (r.code === 'NO_KEY') return t('toastSavedNoKey');
    if (r.code === 'HTTP' && (r.status === 404 || r.status === 405)) return t('toastSttUnsupported');
    if (r.code === 'HTTP') return t('toastSttFailed') + r.status + (r.detail ? ' ' + String(r.detail).slice(0, 120) : '');
    return t('toastSttFailed') + (r.detail || '');
  }

  function startMeter(v) {
    if (!v.ac) return;
    try {
      if (v.ac.state === 'suspended') v.ac.resume();
      const an = v.ac.createAnalyser();
      an.fftSize = 512;
      v.ac.createMediaStreamSource(v.stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const hist = [];
      v.meter = setInterval(() => {
        an.getByteTimeDomainData(buf);
        let p = 0;
        for (const x of buf) p = Math.max(p, Math.abs(x - 128) / 128);
        v.peak = Math.max(v.peak, p);
        hist.push(GLYPHS[Math.min(GLYPHS.length - 1, Math.round(Math.sqrt(p) * 7))]);
        if (hist.length > 8) hist.shift();
        el.statusText.textContent = t('listening') + ' ' + hist.join('');
      }, 120);
    } catch {
      /* no meter: voice still works */
    }
  }

  async function startVoice() {
    if (state.listening || voice) return;
    if (!window.isSecureContext) {
      toast(t('toastVoiceSecure'), 5000);
      return;
    }
    const v = {
      prev: el.input.value, said: '', cancel: false, peak: 0, startedAt: 0, finished: false,
      stream: null, ac: null, meter: null, timer: null,
      sr: null, srActive: false, srError: '',
      rec: null, recActive: false, chunks: [], mime: '',
      ...sttMode(),
    };
    voice = v;
    try {
      v.ac = new (window.AudioContext || window.webkitAudioContext)(); // created inside the click, so it may run
    } catch { /* no meter */ }
    try {
      v.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      toast(e && e.name === 'NotAllowedError' ? t('toastMicDenied') : t('toastMicFailed') + ((e && e.name) || ''), 6000);
      cleanupVoice(v);
      voice = null;
      return;
    }
    v.startedAt = Date.now();
    startMeter(v);
    if (v.record) startRecording(v);
    if (v.useSR) startRecognition(v);
    if (!v.srActive && !v.recActive) {
      toast(t('toastVoiceStart'), 4000);
      cleanupVoice(v);
      voice = null;
      return;
    }
    v.timer = setTimeout(() => stopVoice(false), MAX_RECORD_MS);
    voiceUi(true);
  }

  function startRecognition(v) {
    let rec;
    try {
      rec = new SR();
    } catch {
      return;
    }
    v.sr = rec;
    rec.lang = state.lang === 'id' ? 'id-ID' : 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      // resultIndex marks new results: without it, cumulative finals duplicate.
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) v.said += (v.said ? ' ' : '') + r[0].transcript.trim();
        else interim += r[0].transcript;
      }
      putVoiceText(v, v.said + (interim ? (v.said ? ' ' : '') + interim : ''));
    };
    rec.onerror = (e) => {
      v.srError = e.error || 'error';
    };
    rec.onend = () => {
      v.srActive = false;
      const recording = v.rec && v.rec.state !== 'inactive';
      if (recording && ['network', 'service-not-allowed', 'language-not-supported', 'audio-capture'].includes(v.srError) && !v.stopping) {
        // This browser can't recognize speech (typical in Opera and Brave): keep recording, so the user
        // can simply carry on speaking; the recording is transcribed when they stop.
        v.notified = true;
        toast(t('toastVoiceFallback'), 6000);
        if (v.engine === 'auto' && !state.settings?.sttAutoFallback) {
          state.settings = { ...state.settings, sttAutoFallback: true };
          store.set({ [K.settings]: state.settings });
        }
        return;
      }
      // the recognizer is done (silence, or stopped): end the take too
      if (recording) v.rec.stop();
      else maybeFinish(v);
    };
    try {
      rec.start();
      v.srActive = true;
    } catch {
      v.sr = null;
    }
  }

  function startRecording(v) {
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find((m) => MediaRecorder.isTypeSupported(m)) || '';
    let mr;
    try {
      mr = new MediaRecorder(v.stream, mime ? { mimeType: mime } : undefined);
    } catch {
      return;
    }
    v.rec = mr;
    v.mime = mr.mimeType || mime || 'audio/webm';
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size) v.chunks.push(e.data);
    };
    mr.onstop = () => {
      v.recActive = false;
      maybeFinish(v);
    };
    try {
      mr.start();
      v.recActive = true;
    } catch {
      v.rec = null;
    }
  }

  function stopVoice(cancel) {
    const v = voice;
    if (!v) return;
    v.stopping = true;
    v.cancel = v.cancel || !!cancel;
    if (v.sr && v.srActive) {
      try { v.sr.stop(); } catch { /* already stopped */ }
    }
    if (v.rec && v.rec.state !== 'inactive') v.rec.stop();
    maybeFinish(v);
  }

  const maybeFinish = (v) => {
    if (!v.srActive && !v.recActive) finishVoice(v);
  };

  function cleanupVoice(v) {
    clearTimeout(v.timer);
    clearInterval(v.meter); // v.meter stays set: finishVoice uses it to know a level meter was running
    if (v.stream) v.stream.getTracks().forEach((tr) => tr.stop());
    if (v.ac) v.ac.close().catch(() => {});
    v.stream = null;
    v.ac = null;
  }

  async function finishVoice(v) {
    if (v.finished) return;
    v.finished = true;
    cleanupVoice(v);
    voice = null;
    voiceUi(false);
    if (v.cancel) {
      putVoiceText(v, '');
      return;
    }
    const err = v.srError;
    if (err === 'not-allowed') {
      toast(t('toastMicDenied'), 6000);
      return;
    }
    const broken = ['network', 'service-not-allowed', 'language-not-supported', 'audio-capture'].includes(err);

    // 1) the browser's recognizer produced text
    if (v.said.trim()) {
      putVoiceText(v, v.said);
      return;
    }
    // 2) nothing from it: use the recording if there is one (auto and recorder modes)
    if (!v.record || !v.chunks.length) {
      if (err && err !== 'aborted' && err !== 'no-speech') toast(t('toastVoiceFailed') + err, 6000);
      else toast(Date.now() - v.startedAt < 1200 ? t('toastVoiceShort') : t('toastVoiceNothing'), 7000);
      return;
    }
    const ms = Date.now() - v.startedAt;
    const blob = new Blob(v.chunks, { type: v.mime });
    // order matters: silence compresses to a tiny file, so judge the sound level before the file size
    if (ms < 700) {
      toast(t('toastVoiceShort'), 5000);
      return;
    }
    if (v.meter !== null && v.peak < SILENT_PEAK) {
      toast(t('toastVoiceNoSound'), 8000);
      return;
    }
    if (blob.size < 2000) {
      toast(t('toastVoiceShort'), 5000);
      return;
    }
    if (broken && v.engine === 'auto' && !v.notified) toast(t('toastVoiceFallback'), 5000);
    setStatus('transcribing');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
      const r = await sendMsg({ type: 'nai:transcribe', dataUrl, mime: blob.type, lang: state.lang === 'id' ? 'id' : 'en' });
      if (r && r.ok && r.text) {
        v.prev = el.input.value; // keep anything typed while we were transcribing
        putVoiceText(v, r.text);
        if (v.engine === 'auto' && !state.settings?.sttAutoFallback) {
          // the browser's recognizer gave nothing but the recording worked: use the recording from now on
          state.settings = { ...state.settings, sttAutoFallback: true };
          store.set({ [K.settings]: state.settings });
        }
      } else if (r && r.ok) {
        toast(t('toastSttEmpty').replace('{s}', (ms / 1000).toFixed(1)), 7000);
      } else if (r) {
        // in auto mode the user never asked for transcription: say what really happened
        toast(v.engine === 'auto' ? t('toastVoiceNothing') : sttError(r), 8000);
      }
    } catch (e) {
      toast(t('toastSttFailed') + ((e && e.message) || ''), 6000);
    } finally {
      setStatus(idleStatus());
    }
  }

  el.micBtn.addEventListener('click', () => (state.listening ? stopVoice(false) : startVoice()));

  /* ---------------- Files ---------------- */

  el.fileBtn.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () => {
    handleFiles(el.fileInput.files);
    el.fileInput.value = '';
  });

  /* Paste: Ctrl+V with an image on the clipboard (a screenshot, "Copy image", a file copied in the
     file manager) attaches it. Plain text pastes are never touched, and a mixed clipboard (a copied
     spreadsheet cell carries a picture AND its text) pastes as text. */
  let pasteCount = 0;
  panel.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    const files = cd && cd.files ? [...cd.files] : [];
    if (!files.length || (cd.getData('text/plain') || '').trim()) return;
    e.preventDefault();
    handleFiles(
      files.map((f) =>
        f.type.startsWith('image/') && /^image\.\w+$/i.test(f.name) // the generic name browsers give clipboard pictures
          ? new File([f], 'pasted-image-' + ++pasteCount + '.' + (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg'), { type: f.type })
          : f
      )
    );
  });

  panel.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.drop.hidden = false;
  });
  panel.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null || !panel.contains(e.relatedTarget)) el.drop.hidden = true;
  });
  panel.addEventListener('drop', (e) => {
    e.preventDefault();
    el.drop.hidden = true;
    handleFiles(e.dataTransfer.files);
  });

  const TEXT_EXT = /\.(txt|md|markdown|csv|json|xml|ya?ml|log|jsx?|tsx?|html?|css|py)$/i;

  async function handleFiles(fileList) {
    for (const file of fileList) {
      try {
        if (file.type.startsWith('image/')) {
          if (state.settings?.vision === false) {
            toast(t('toastTextOnly'));
            continue;
          }
          state.attachments.push({ name: file.name, dataUrl: await readImage(file) });
        } else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          const att = await attachPdf(file);
          if (att) state.attachments.push(att);
        } else if (file.type.startsWith('text/') || TEXT_EXT.test(file.name)) {
          const text = await file.text();
          state.attachments.push({ name: file.name, text: text.slice(0, 20000) });
        } else {
          toast(file.name + t('toastFileType'));
        }
      } catch {
        toast(file.name + t('toastFileRead'));
      }
    }
    renderAttachments();
    el.input.focus();
  }

  /* PDFs are read by pdf.js in an offscreen document (see the service worker). Text PDFs
     become text; scans (no selectable text) become page images for a vision model. */
  async function attachPdf(file) {
    if (file.size > PDF_MAX_BYTES) {
      toast(file.name + t('toastPdfBig'), 6000);
      return null;
    }
    const data = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    return attachPdfData(file.name, data, 40000);
  }

  async function attachPdfData(name, data, maxChars) {
    setStatus('reading');
    try {
      const r = await sendMsg({ type: 'nai:pdf', data, maxChars, wantImages: state.settings?.vision !== false });
      if (!r || !r.ok) {
        toast(name + (r && r.code === 'PASSWORD' ? t('toastPdfPassword') : t('toastPdfFailed')), 6000);
        return null;
      }
      if (r.text && r.text.replace(/\[Page \d+\]/g, '').trim().length >= 50) {
        const more = r.pagesRead < r.numPages ? '\n\n[Only the first ' + r.pagesRead + ' of ' + r.numPages + ' pages were read.]' : '';
        return { name, text: r.text + more, pages: r.numPages };
      }
      if (r.images && r.images.length) {
        toast(t('toastPdfScanned').replace('{n}', r.images.length), 6000);
        const note = 'Scanned PDF without selectable text. The first ' + r.images.length + ' of ' + r.numPages + ' pages are attached as images.';
        return { name, dataUrls: r.images, text: note, pages: r.numPages };
      }
      toast(name + (state.settings?.vision === false ? t('toastPdfNoText') : t('toastPdfEmpty')), 6000);
      return null;
    } finally {
      setStatus(idleStatus());
    }
  }

  const PDF_MAX_BYTES = 30 * 1024 * 1024;

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const max = 1280;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 1500000) {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(file);
          return;
        }
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function renderAttachments() {
    el.attachRow.replaceChildren();
    state.attachments.forEach((a, i) => {
      const pill = document.createElement('span');
      pill.className = 'nai-pill-file';
      const pic = a.dataUrl || (a.dataUrls && a.dataUrls[0]);
      if (pic) {
        const thumb = document.createElement('img');
        thumb.className = 'nai-pill-thumb';
        thumb.src = pic;
        thumb.alt = '';
        pill.appendChild(thumb);
      }
      const name = document.createElement('span');
      name.textContent = a.name + (a.dataUrls && a.dataUrls.length > 1 ? ' · ' + t('attachImages').replace('{n}', a.dataUrls.length) : '');
      const x = document.createElement('button');
      x.textContent = '×';
      x.setAttribute('aria-label', t('removeLabel') + a.name);
      x.addEventListener('click', () => {
        state.attachments.splice(i, 1);
        renderAttachments();
      });
      pill.append(name, x);
      el.attachRow.appendChild(pill);
    });
  }

  /* ---------------- Screen: scan + live ---------------- */

  function hideScreenMenu() { el.screenMenu.hidden = true; }
  el.screenBtn.addEventListener('click', () => {
    el.screenMenu.hidden = !el.screenMenu.hidden;
    const liveOn = !!(state.liveStream || state.followLive);
    el.screenMenu.querySelector('[data-screen="live"]').hidden = liveOn;
    el.screenMenu.querySelector('[data-screen="window"]').hidden = liveOn;
  });
  document.addEventListener('pointerdown', (e) => {
    // composedPath sees inside our open shadow root; e.target would be the host.
    if (el.screenMenu.hidden) return;
    const path = e.composedPath();
    if (!path.includes(el.screenMenu) && !path.includes(el.screenBtn)) hideScreenMenu();
  });

  el.screenMenu.addEventListener('click', (e) => {
    const action = e.target.closest('button')?.dataset.screen;
    hideScreenMenu();
    if (action === 'scan') scanPage();
    if (action === 'live') startFollowLive();
    if (action === 'window') startLive();
  });
  el.stopBtn.addEventListener('click', () => {
    if (state.liveStream) stopLive();
    else if (state.followLive) stopFollowLive();
    else sendMsg({ type: 'nai:live-stop' }).catch(() => {}); // share lives in another tab
  });

  /* "Scan this page": scrolls the page from top to bottom taking one screenshot per screen
     (same engine as Capture), then reads the page text AFTER the scroll so lazy-loaded
     content is included. Pages that can't be screenshotted fall back to a text-only scan. */
  /* The browser's PDF viewer scrolls inside its own plugin: a page script can neither scroll
     nor read it, so a screenshot loop would just photograph page one. Fetch the same file and
     read it with pdf.js instead: every page, top to bottom. */
  const isPdfPage = () => document.contentType === 'application/pdf' || !!document.querySelector('embed[type="application/pdf"]');

  function bytesToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function scanPdfPage() {
    setStatus('reading');
    try {
      let buf;
      try {
        const res = await fetch(location.href, { credentials: 'include' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        buf = await res.arrayBuffer();
      } catch {
        toast(t('toastPdfFetch'), 8000);
        return;
      }
      const name = decodeURIComponent((location.pathname.split('/').pop() || '').trim()) || document.title || 'document.pdf';
      if (buf.byteLength > PDF_MAX_BYTES) {
        toast(name + t('toastPdfBig'), 6000);
        return;
      }
      const att = await attachPdfData(name, bytesToBase64(buf), 80000);
      if (!att) return;
      state.attachments.push(att);
      renderAttachments();
      toast(t('toastScannedPdf').replace('{n}', att.pages), 5000);
    } finally {
      setStatus(idleStatus());
    }
  }

  async function scanPage() {
    if (isPdfPage()) return scanPdfPage();
    setStatus('reading');
    let shots = null;
    if (state.settings?.vision !== false) {
      try {
        shots = await captureWholePage();
      } catch (e) {
        if (e && e.cap === 'cancelled') {
          setStatus(idleStatus());
          toast(t('scanCancelled'), 4000);
          return;
        }
        // can't screenshot this tab (e.g. a browser page): the text scan below still works
      }
    }
    const headings = [...document.querySelectorAll('h1,h2,h3')]
      .slice(0, 30)
      .map((h) => '- ' + h.textContent.trim())
      .join('\n');
    const sel = String(window.getSelection?.() || '').trim();
    let text =
      'URL: ' + location.href + '\nTitle: ' + document.title +
      (headings ? '\n\nOutline:\n' + headings : '') +
      (sel ? '\n\nSelected text:\n' + sel.slice(0, 4000) : '') +
      '\n\nPage text (top to bottom):\n' + pageExcerpt(30000);
    const attachment = { name: t('pagePrefix') + (document.title || location.hostname) };
    const n = shots ? shots.images.length : 0;
    if (n) {
      attachment.dataUrls = shots.images;
      text +=
        '\n\n[' + n + ' screenshots of the page follow, from top to bottom; neighboring ones overlap slightly.' +
        (shots.truncated ? ' The page is longer: only the first part was captured.' : '') + ']';
    }
    attachment.text = text;
    state.attachments.push(attachment);
    renderAttachments();
    setStatus(idleStatus());
    toast(n ? t('toastScannedPage').replace('{n}', n) : t('toastScanned'), 4000);
  }

  function downscaleDataUrl(dataUrl, max) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        if (scale === 1) return resolve(dataUrl);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  /* Live view that follows your tab. Nothing is recorded: when you send a message, Nai
     takes one picture of the tab you are on right then (the Nai panel is cropped out),
     so switching tabs just works. The on/off flag lives in storage so every tab agrees. */
  async function captureLiveFrame() {
    try {
      const r = await sendMsg({ type: 'nai:screenshot', quality: 0.8 });
      if (!r || !r.dataUrl) return null;
      const panelW = state.open ? Math.round(panel.getBoundingClientRect().width) : 0;
      const rect = { left: 0, top: 0, width: Math.max(200, window.innerWidth - panelW), height: window.innerHeight };
      return (await cropAndEncode(r.dataUrl, rect)).url;
    } catch {
      return null;
    }
  }

  function applyFollow(on) {
    state.followLive = on;
    if (on) {
      el.stopBtn.hidden = false;
      el.screenBtn.classList.add('active');
      setStatus('viewing');
    } else if (!state.liveStream && !state.remoteLive) {
      el.stopBtn.hidden = true;
      el.screenBtn.classList.remove('active');
      setStatus('ready');
    }
  }

  function startFollowLive() {
    if (state.settings?.vision === false) {
      toast(t('liveNeedsVision'));
      return;
    }
    if (state.liveStream) stopLive();
    sendMsg({ type: 'nai:live-stop' }).catch(() => {}); // end a window/screen share in another tab
    store.set({ [K.liveFollow]: true });
    applyFollow(true);
    toast(t('toastLiveFollow'), 6000);
  }
  function stopFollowLive() {
    store.set({ [K.liveFollow]: false });
    applyFollow(false);
    toast(t('toastLiveOff'));
  }
  store.get(K.liveFollow).then((r) => applyFollow(!!r[K.liveFollow]));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[K.liveFollow]) applyFollow(!!changes[K.liveFollow].newValue);
  });

  async function startLive() {
    if (state.settings?.vision === false) {
      toast(t('liveNeedsVision'));
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      toast(t('toastScreenDenied'));
      return;
    }
    store.set({ [K.liveFollow]: false }); // one live mode at a time
    state.liveStream = stream;
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play().catch(() => {});
    state.liveVideo = video;

    const grab = () => {
      if (!video.videoWidth) return;
      const max = 1024;
      const scale = Math.min(1, max / video.videoWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(video.videoWidth * scale);
      c.height = Math.round(video.videoHeight * scale);
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      state.liveFrame = c.toDataURL('image/jpeg', 0.6);
      // Relay frames through the worker so other tabs can use the share too.
      try {
        chrome.runtime.sendMessage({ type: 'nai:live-frame', dataUrl: state.liveFrame }, () => void chrome.runtime.lastError);
      } catch {
        retire(); // stale copy: also stops this timer
      }
    };
    grab();
    state.liveTimer = setInterval(grab, 2000);
    stream.getVideoTracks()[0].addEventListener('ended', () => stopLive());

    el.stopBtn.hidden = false;
    el.screenBtn.classList.add('active');
    setStatus('viewing');
    sendMsg({ type: 'nai:live-start' }).catch(() => {});
    toast(t('toastLiveOn'));
  }

  function stopLive(notify) {
    clearInterval(state.liveTimer);
    state.liveTimer = null;
    state.liveFrame = null;
    if (state.liveStream) {
      state.liveStream.getTracks().forEach((t) => t.stop());
      state.liveStream = null;
    }
    state.liveVideo = null;
    state.remoteLive = false;
    el.stopBtn.hidden = true;
    el.screenBtn.classList.remove('active');
    setStatus('ready');
    if (notify !== false) sendMsg({ type: 'nai:live-stop' }).catch(() => {});
    toast(t('toastLiveOff'));
  }

  // Ask the worker whether another tab is sharing right now (panel just opened).
  function syncLiveState() {
    sendMsg({ type: 'nai:live-state' })
      .then((r) => {
        if (!r) return;
        if (r.active && !state.liveStream) {
          state.remoteLive = true;
          el.stopBtn.hidden = false;
          el.screenBtn.classList.add('active');
          setStatus('viewing');
        } else if (!r.active && state.remoteLive) {
          state.remoteLive = false;
          el.stopBtn.hidden = true;
          el.screenBtn.classList.remove('active');
          setStatus('ready');
        }
      })
      .catch(() => {});
  }

  /* ---------------- Skills ---------------- */

  /* Skills are created and edited on the Settings page. Here they are only used: "always on"
     skills go into every system prompt, and /name runs one for a single message. */

  const findSkill = (name) => state.skills.find((k) => k.enabled !== false && k.name === String(name).toLowerCase());

  function alwaysOnSkills() {
    const on = state.skills.filter((k) => k.enabled !== false && k.always);
    return on.length ? '\n\n# Always-on skills\n' + on.map((k) => '## /' + k.name + '\n' + k.body).join('\n\n') : '';
  }

  async function loadSkills() {
    const r = await store.get(K.skills);
    if (Array.isArray(r[K.skills])) {
      state.skills = r[K.skills];
      return;
    }
    state.skills = NAI_STARTER_SKILLS.map((k) => ({ enabled: true, always: false, search: false, ...k }));
    await store.set({ [K.skills]: state.skills });
  }

  /* Typing "/" at the start of the message lists the skills. */
  function filterSkills(skills, q) {
    const query = String(q || '').toLowerCase();
    return skills
      .filter((k) => k.enabled !== false && k.name.includes(query))
      .sort((a, b) => (a.name.startsWith(query) ? 0 : 1) - (b.name.startsWith(query) ? 0 : 1))
      .slice(0, 6);
  }
  let menuSkills = [];
  function hideSkillMenu() {
    el.skillMenu.hidden = true;
    menuSkills = [];
  }
  function pickSkill(k) {
    el.input.value = '/' + k.name + ' ';
    hideSkillMenu();
    el.input.dispatchEvent(new Event('input'));
    el.input.focus();
  }
  function updateSkillMenu() {
    const m = /^\/([\w-]*)$/.exec(el.input.value);
    if (!m || state.sending) return hideSkillMenu();
    menuSkills = filterSkills(state.skills, m[1]);
    if (!menuSkills.length) return hideSkillMenu();
    state.skillIdx = Math.min(state.skillIdx, menuSkills.length - 1);
    el.skillMenu.replaceChildren();
    menuSkills.forEach((k, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(i === state.skillIdx));
      b.className = i === state.skillIdx ? 'sel' : '';
      const n = document.createElement('strong');
      n.textContent = '/' + k.name;
      const d = document.createElement('small');
      d.textContent = k.description;
      b.append(n, d);
      b.addEventListener('click', () => pickSkill(k));
      el.skillMenu.appendChild(b);
    });
    el.skillMenu.hidden = false;
  }
  function handleSkillMenuKey(e) {
    if (el.skillMenu.hidden || !menuSkills.length) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = menuSkills.length;
      state.skillIdx = (state.skillIdx + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      updateSkillMenu();
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pickSkill(menuSkills[state.skillIdx] || menuSkills[0]);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // don't close the panel, just the menu
      hideSkillMenu();
      return true;
    }
    return false;
  }
  el.skillMenu.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus in the input
  el.input.addEventListener('blur', () => setTimeout(hideSkillMenu, 120));

  /* ---------------- Web search ---------------- */

  /* The query goes to the provider the user picked, with the user's own key (worker side);
     the top results are added to the message and shown as Sources under the answer. */

  const searchReady = () => !!(state.settings?.searchProvider && state.settings.searchProvider !== 'none' && state.settings.searchKey);

  function formatSearch(query, results) {
    return (
      '\n\n--- Web search results for "' + String(query).replace(/"/g, "'") + '" ---\n' +
      results.map((r, i) => '[' + (i + 1) + '] ' + r.title + '\n' + r.url + '\n' + r.snippet).join('\n\n') +
      '\n--- end of results ---\nUse these results where they help. Cite sources as [1], [2] matching the numbers above. ' +
      'If they do not answer the question, say so instead of guessing.'
    );
  }
  function searchError(r) {
    if (r.code === 'NO_SEARCH') return t('searchNeedsKey');
    if (r.code === 'HTTP' && (r.status === 401 || r.status === 403)) return t('searchBadKey');
    if (r.code === 'HTTP' && r.status === 429) return t('searchRate');
    return t('searchFailed') + (r.status ? r.status + ' ' : '') + String(r.detail || r.code || '').slice(0, 120);
  }

  function renderSources(body) {
    const div = body.parentElement;
    const list = div._naiSources;
    if (!list || !list.length || div.querySelector('.nai-sources')) return;
    const box = document.createElement('div');
    box.className = 'nai-sources';
    const h = document.createElement('div');
    h.className = 'nai-sources-title';
    h.textContent = t('sources');
    const ol = document.createElement('ol');
    for (const r of list) {
      if (!/^https?:\/\//i.test(r.url)) continue;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = r.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = r.title || r.url;
      li.appendChild(a);
      let host = '';
      try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
      if (host) {
        const sm = document.createElement('small');
        sm.textContent = ' ' + host;
        li.appendChild(sm);
      }
      ol.appendChild(li);
    }
    box.append(h, ol);
    div.insertBefore(box, div.querySelector('.nai-copy'));
    div._naiSourcesMd = '\n\nSources:\n' + list.map((r, i) => (i + 1) + '. ' + (r.title || r.url) + ' - ' + r.url).join('\n');
  }

  function applySearchOn(on) {
    state.searchOn = on;
    el.webBtn.classList.toggle('active', on);
    el.webBtn.setAttribute('aria-pressed', String(on));
  }
  el.webBtn.addEventListener('click', () => {
    if (!state.searchOn && !searchReady()) {
      addErrorMessage(t('searchNeedsKey'), true, 'search');
      return;
    }
    const on = !state.searchOn;
    applySearchOn(on);
    store.set({ [K.searchOn]: on });
    toast(on ? t('searchOnToast') : t('searchOffToast'));
  });

  loadSkills();
  store.get(K.searchOn).then((r) => applySearchOn(!!r[K.searchOn]));

  /* ---------------- Settings live on their own page ---------------- */

  function openOptions(section) {
    sendMsg({ type: 'nai:open-options', section: section || '' }).catch(() => {});
  }
  el.settingsBtn.addEventListener('click', () => openOptions());

  /* Style: the ASCII look is the default; "classic" is the rounded look. Only an attribute on the
     host: the stylesheet does the rest. */
  function applyStyle(style) {
    host.setAttribute('data-style', style === 'classic' ? 'classic' : 'ascii');
  }

  /* Theme: "system" follows the OS; light/dark force it. The host attribute drives the CSS tokens. */
  function applyTheme(theme) {
    const t2 = theme === 'light' || theme === 'dark' ? theme : 'system';
    if (t2 === 'system') host.removeAttribute('data-theme');
    else host.setAttribute('data-theme', t2);
  }

  /* The Settings page edits storage; every open tab picks the changes up live. */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const nv = changes[K.settings] && changes[K.settings].newValue;
    if (nv) {
      const langChanged = nv.lang && nv.lang !== state.lang;
      state.settings = nv;
      applyTheme(nv.theme);
      applyStyle(nv.style);
      if (langChanged) {
        state.lang = nv.lang;
        applyStrings();
      }
    }
    if (changes[K.soul]) state.soul = changes[K.soul].newValue || '';
    if (changes[K.memory]) state.memory = changes[K.memory].newValue || '';
    if (changes[K.skills] && Array.isArray(changes[K.skills].newValue)) state.skills = changes[K.skills].newValue;
  });

  /* ---------------- History ---------------- */

  /* Privacy (Settings -> Privacy): "don't save chats", and deleting chats older than N days. */
  const historyOff = () => state.settings?.historyMode === 'off';
  function pruneChats(chats) {
    const days = Number(state.settings?.historyDays) || 0;
    if (!days) return chats;
    const cutoff = Date.now() - days * 86400000;
    return chats.filter((c) => (c.time || 0) >= cutoff);
  }

  async function loadChats() {
    const r = await store.get(K.chats);
    const all = r[K.chats] || [];
    const kept = pruneChats(all);
    if (kept.length !== all.length) store.set({ [K.chats]: kept });
    return kept;
  }

  async function saveChat() {
    if (!state.history.length || historyOff()) return;
    if (!state.chatId) state.chatId = 'c' + Date.now().toString(36);
    const chats = await loadChats();
    const firstUser = state.history.find((m) => m.role === 'user');
    const title = String(firstUser ? firstUser.content : 'Chat').replace(/\s+/g, ' ').slice(0, 60);
    const entry = { id: state.chatId, title, time: Date.now(), messages: state.history };
    const i = chats.findIndex((c) => c.id === state.chatId);
    if (i >= 0) chats[i] = entry; else chats.unshift(entry);
    await store.set({ [K.chats]: chats.slice(0, 50), [K.activeChat]: state.chatId });
  }

  function openHistory() {
    el.chatView.style.display = 'none';
    el.historyView.hidden = false;
    renderHistory();
  }
  function closeHistoryView() {
    el.historyView.hidden = true;
    el.chatView.style.display = '';
  }
  el.historyBtn.addEventListener('click', openHistory);
  el.histBackBtn.addEventListener('click', closeHistoryView);
  el.newChatBtn.addEventListener('click', () => {
    state.chatId = null;
    state.history = [];
    store.set({ [K.activeChat]: null }); // other tabs start fresh too
    el.messages.replaceChildren();
    el.chips.replaceChildren();
    closeHistoryView();
    el.input.focus();
  });

  async function renderHistory() {
    const chats = await loadChats();
    el.histList.replaceChildren();
    if (!chats.length) {
      const empty = document.createElement('div');
      empty.className = 'nai-hist-empty';
      empty.textContent = t('histEmpty');
      el.histList.appendChild(empty);
      return;
    }
    for (const c of chats) {
      const item = document.createElement('div');
      item.className = 'nai-hist-item';
      const open = document.createElement('button');
      open.className = 'nai-hist-open';
      const title = document.createElement('span');
      title.className = 'nai-hist-title';
      title.textContent = c.title;
      const time = document.createElement('span');
      time.className = 'nai-hist-time';
      time.textContent = new Date(c.time).toLocaleString(state.lang === 'id' ? 'id-ID' : 'en-US', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      open.append(title, time);
      open.addEventListener('click', () => loadChat(c.id));
      const del = document.createElement('button');
      del.className = 'nai-hist-del';
      del.textContent = '×';
      del.setAttribute('aria-label', t('removeLabel') + c.title);
      del.addEventListener('click', async () => {
        const all = await loadChats();
        await store.set({ [K.chats]: all.filter((x) => x.id !== c.id) });
        if (state.chatId === c.id) state.chatId = null; // next save starts a fresh chat
        renderHistory();
      });
      item.append(open, del);
      el.histList.appendChild(item);
    }
  }

  async function loadChat(id) {
    const chats = await loadChats();
    const c = chats.find((x) => x.id === id);
    if (!c) return;
    state.chatId = c.id;
    store.set({ [K.activeChat]: c.id });
    state.history = c.messages.slice();
    el.messages.classList.add('no-anim');
    el.messages.replaceChildren();
    for (const m of state.history) {
      if (m.role === 'user') {
        addUserMessage(typeof m.content === 'string' ? m.content : '', []);
      } else {
        const body = addAssistantMessage();
        body.innerHTML = naiMarkdown(
          String(m.content).replace(/```memory-update\s*\n[\s\S]*?```/g, '').trim()
        );
        setRaw(body, String(m.content));
      }
    }
    closeHistoryView();
    renderChips();
    scrollBottom();
    requestAnimationFrame(() => requestAnimationFrame(() => el.messages.classList.remove('no-anim')));
  }

  /* ---------------- Init ---------------- */

  (async () => {
    const r = await store.get([K.settings, K.soul, K.memory, K.panelWidth]);
    state.settings = Object.assign({}, NAI_DEFAULT_SETTINGS, r[K.settings]);
    applyTheme(state.settings.theme);
    applyStyle(state.settings.style);
    // First run: persist the defaults (endpoint, model; the key stays empty) so the service
    // worker, which reads storage directly, sees the same configuration.
    if (!r[K.settings]) store.set({ [K.settings]: state.settings });
    if (!state.settings.lang) {
      state.settings.lang = (navigator.language || '').toLowerCase().startsWith('id') ? 'id' : 'en';
    }
    state.lang = state.settings.lang;
    if (r[K.panelWidth]) setPanelWidth(r[K.panelWidth]);
    applyStrings();
    loadChats(); // prunes chats older than the retention setting
    state.soul = typeof r[K.soul] === 'string' ? r[K.soul] : NAI_DEFAULT_SOUL;
    state.memory = typeof r[K.memory] === 'string' ? r[K.memory] : NAI_DEFAULT_MEMORY;
    const seed = {};
    if (typeof r[K.soul] !== 'string') seed[K.soul] = state.soul;
    if (typeof r[K.memory] !== 'string') seed[K.memory] = state.memory;
    if (Object.keys(seed).length) store.set(seed);
  })();
})();

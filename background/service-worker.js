/* Nai service worker.
   Owns everything the content script can't or shouldn't do:
   - LLM requests (an extension worker isn't bound by the page's CSP, so any
     user-configured endpoint works; the API key only ever goes to that endpoint)
   - tab screenshots for "Scan this page"
   - the Alt+N keyboard command
   The key is read from chrome.storage.local per request and never logged. */

const SETTINGS_KEY = 'nai.settings';

function getSettings() {
  return new Promise((resolve) =>
    chrome.storage.local.get(SETTINGS_KEY, (r) => resolve(r[SETTINGS_KEY] || {}))
  );
}

async function readErrorBody(res) {
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      return String(j.error?.message || j.message || text).slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return '';
  }
}

function llmHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + apiKey,
  };
}

/* ---- Streaming chat over a long-lived port ---- */

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'nai-chat') return;

  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type !== 'chat') return;

    const ctrl = new AbortController();
    const abort = () => ctrl.abort();
    port.onDisconnect.addListener(abort);
    const send = (obj) => {
      try { port.postMessage(obj); } catch { /* panel closed mid-stream */ }
    };

    try {
      const s = await getSettings();
      if (!s.apiKey) return send({ type: 'error', code: 'NO_KEY' });

      const res = await fetch(s.endpoint, {
        method: 'POST',
        signal: ctrl.signal,
        headers: llmHeaders(s.apiKey),
        body: JSON.stringify({ model: s.model, messages: msg.messages, stream: true }),
      });

      if (!res.ok || !res.body) {
        return send({ type: 'error', code: 'HTTP', status: res.status, detail: await readErrorBody(res) });
      }

      // Parse OpenAI-style SSE: "data: {...}\n\n" events, "[DONE]" terminator.
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const evt = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of evt.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const delta = JSON.parse(data).choices?.[0]?.delta?.content;
              if (delta) send({ type: 'delta', text: delta });
            } catch { /* partial JSON event, next chunk completes it */ }
          }
        }
      }
      send({ type: 'done' });
    } catch (e) {
      if (!ctrl.signal.aborted) {
        send({ type: 'error', code: 'NETWORK', detail: String((e && e.message) || e) });
      }
    } finally {
      port.onDisconnect.removeListener(abort);
    }
  });
});

/* ---- Speech-to-text: OpenAI-compatible /audio/transcriptions ---- */

function sttEndpoint(s) {
  if (s.sttEndpoint) return s.sttEndpoint;
  const ep = s.endpoint || '';
  if (/\/chat\/completions\/?$/.test(ep)) return ep.replace(/\/chat\/completions\/?$/, '/audio/transcriptions');
  try { return new URL(ep).origin + '/v1/audio/transcriptions'; } catch { return ep; }
}

async function transcribe(msg) {
  const s = await getSettings();
  if (!s.apiKey) return { ok: false, code: 'NO_KEY' };
  try {
    const blob = await (await fetch(msg.dataUrl)).blob();
    const ext = /ogg/.test(msg.mime) ? 'ogg' : /mp4/.test(msg.mime) ? 'm4a' : 'webm';
    const fd = new FormData();
    fd.append('file', blob, 'voice.' + ext);
    fd.append('model', s.sttModel || 'whisper-1');
    if (msg.lang) fd.append('language', msg.lang);
    // No Content-Type header: fetch sets the multipart boundary itself.
    const res = await fetch(sttEndpoint(s), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + s.apiKey },
      body: fd,
    });
    if (!res.ok) return { ok: false, code: 'HTTP', status: res.status, detail: await readErrorBody(res) };
    const j = await res.json().catch(() => ({}));
    return { ok: true, text: String(j.text || '').trim() };
  } catch (e) {
    return { ok: false, code: 'NETWORK', detail: String((e && e.message) || e) };
  }
}

/* ---- PDF files: read by pdf.js in an offscreen document ---- */

let offscreenTimer;

async function ensureOffscreen() {
  const url = chrome.runtime.getURL('offscreen/pdf.html');
  const open = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (open.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen/pdf.html',
    reasons: ['WORKERS'],
    justification: 'Read the PDF files you attach, with a bundled PDF reader.',
  });
}

async function readPdf(msg) {
  try {
    await ensureOffscreen();
    const ask = () => chrome.runtime.sendMessage({ target: 'offscreen', type: 'pdf-read', data: msg.data, wantImages: !!msg.wantImages, maxChars: msg.maxChars });
    let res;
    try {
      res = await ask();
    } catch {
      await new Promise((r) => setTimeout(r, 300)); // the page may still be starting
      res = await ask();
    }
    return res || { ok: false, code: 'FAILED', detail: 'no answer from the PDF reader' };
  } catch (e) {
    return { ok: false, code: 'FAILED', detail: String((e && e.message) || e) };
  } finally {
    clearTimeout(offscreenTimer);
    offscreenTimer = setTimeout(() => chrome.offscreen.closeDocument().catch(() => {}), 30000);
  }
}

/* ---- Settings open on their own page (one tab, reused) ---- */

async function openOptions(section) {
  const base = chrome.runtime.getURL('options/options.html');
  const url = base + (section ? '#' + encodeURIComponent(section) : '');
  try {
    const [tab] = await chrome.tabs.query({ url: base + '*' });
    if (tab) {
      await chrome.tabs.update(tab.id, { url, active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return;
    }
  } catch { /* fall through and open a new tab */ }
  await chrome.tabs.create({ url });
}

/* ---- Web search: Brave / Tavily / Serper, with the user's own key ---- */

const stripTags = (v) => String(v || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

async function webSearch(query) {
  const s = await getSettings();
  const provider = s.searchProvider;
  const key = s.searchKey;
  if (!provider || provider === 'none' || !key) return { ok: false, code: 'NO_SEARCH' };
  const q = String(query || '').trim().slice(0, 300);
  if (!q) return { ok: false, code: 'EMPTY' };
  try {
    let res;
    if (provider === 'brave') {
      res = await fetch('https://api.search.brave.com/res/v1/web/search?count=6&q=' + encodeURIComponent(q), {
        headers: { Accept: 'application/json', 'X-Subscription-Token': key },
      });
    } else if (provider === 'tavily') {
      res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ query: q, max_results: 6 }),
      });
    } else if (provider === 'serper') {
      res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
        body: JSON.stringify({ q, num: 6 }),
      });
    } else {
      return { ok: false, code: 'NO_SEARCH' };
    }
    if (!res.ok) return { ok: false, code: 'HTTP', status: res.status, detail: await readErrorBody(res) };
    const j = await res.json().catch(() => ({}));
    const raw =
      provider === 'brave'
        ? (j.web?.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.description }))
        : provider === 'tavily'
        ? (j.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.content }))
        : (j.organic || []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
    const results = raw
      .filter((r) => /^https?:\/\//i.test(r.url || ''))
      .slice(0, 6)
      .map((r) => ({
        title: stripTags(r.title).slice(0, 120),
        url: r.url,
        snippet: stripTags(r.snippet).slice(0, 300),
      }));
    return { ok: true, results };
  } catch (e) {
    return { ok: false, code: 'NETWORK', detail: String((e && e.message) || e) };
  }
}

/* ---- One-shot messages: connection test + screenshot ---- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'nai:transcribe') {
    transcribe(msg).then(sendResponse);
    return true;
  }

  if (msg?.type === 'nai:pdf') {
    readPdf(msg).then(sendResponse);
    return true;
  }

  if (msg?.type === 'nai:open-options') {
    openOptions(msg.section).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg?.type === 'nai:search') {
    webSearch(msg.query).then(sendResponse);
    return true;
  }

  if (msg?.type === 'nai:screenshot') {
    const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
    chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: Math.min(100, Math.max(30, Math.round((msg.quality || 0.7) * 100))) }, (dataUrl) => {
      sendResponse(
        chrome.runtime.lastError
          ? { error: chrome.runtime.lastError.message }
          : { dataUrl }
      );
    });
    return true;
  }
});

/* ---- Toolbar icon and Alt+N toggle the panel in the active tab ----
   If the page was already open before Nai was installed or reloaded, the content
   script isn't there yet, so we inject it on demand (activeTab + scripting).
   Pages that block extensions (chrome://, Web Store, ...) get a "!" badge hint. */

function pingTab(tabId) {
  return new Promise((resolve) =>
    chrome.tabs.sendMessage(tabId, { type: 'nai:toggle' }, (res) =>
      resolve(!chrome.runtime.lastError && !!res?.ok)
    )
  );
}

/* Extension calls that target a tab reject when that tab is gone: that is fine, never an error. */
const quiet = (p) => Promise.resolve(p).catch(() => {});

async function toggleInTab(tab) {
  if (!tab?.id) return;
  if (await pingTab(tab.id)) return;
  try {
    const files = chrome.runtime.getManifest().content_scripts[0].js;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files });
    await pingTab(tab.id);
  } catch {
    // Can't run on this tab (a browser page, or the tab is already gone): hint on the icon.
    // The tab may close any moment, and every call below then rejects with "No tab with id".
    const id = tab.id;
    quiet(chrome.action.setBadgeBackgroundColor({ color: '#5B5BD6' }));
    quiet(chrome.action.setBadgeText({ text: '!', tabId: id }));
    quiet(chrome.action.setTitle({ title: 'Nai only works on regular websites (http/https). Open one and try again.', tabId: id }));
    setTimeout(() => {
      quiet(chrome.action.setBadgeText({ text: '', tabId: id }));
      quiet(chrome.action.setTitle({ title: 'Open Nai', tabId: id }));
    }, 5000);
  }
}

chrome.action.onClicked.addListener((tab) => toggleInTab(tab));

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-nai') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  toggleInTab(tab);
});

/* ---- Live screen relay ----
   getDisplayMedia belongs to the tab that started it, but the user expects the
   share to follow them across tabs. The capturing tab posts frames here every
   2s; any other tab pulls the latest frame when it sends a message.
   ponytail: kept in memory — the worker can be suspended mid-share. The
   capturing tab's frame pings re-create the state within ~2s (auto-heal). */

let liveShare = null; // {tabId, frame}

function broadcastLive(active) {
  chrome.tabs.query({}, (tabs) => {
    for (const tb of tabs) {
      chrome.tabs.sendMessage(tb.id, { type: 'nai:live-status', active }, () => void chrome.runtime.lastError);
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'nai:live-start') {
    if (liveShare && liveShare.tabId !== sender.tab?.id) {
      chrome.tabs.sendMessage(liveShare.tabId, { type: 'nai:live-stop-local' }, () => void chrome.runtime.lastError);
    }
    liveShare = { tabId: sender.tab?.id, frame: null };
    broadcastLive(true);
    sendResponse({ ok: true });
    return;
  }
  if (msg?.type === 'nai:live-frame') {
    if (!liveShare && sender.tab) {
      liveShare = { tabId: sender.tab.id, frame: null }; // auto-heal after SW suspension
      broadcastLive(true);
    }
    if (liveShare && sender.tab?.id === liveShare.tabId) liveShare.frame = msg.dataUrl;
    return; // fire-and-forget, no response
  }
  if (msg?.type === 'nai:live-stop') {
    if (liveShare) {
      if (sender.tab?.id !== liveShare.tabId) {
        chrome.tabs.sendMessage(liveShare.tabId, { type: 'nai:live-stop-local' }, () => void chrome.runtime.lastError);
      }
      liveShare = null;
      broadcastLive(false);
    }
    sendResponse({ ok: true });
    return;
  }
  if (msg?.type === 'nai:live-state') {
    sendResponse({ active: !!liveShare, own: sender.tab?.id === liveShare?.tabId });
    return;
  }
  if (msg?.type === 'nai:live-get') {
    sendResponse({ active: !!liveShare, frame: liveShare?.frame || null });
    return;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (liveShare && liveShare.tabId === tabId) {
    liveShare = null;
    broadcastLive(false);
  }
});

/* The follow-my-tab live flag lives in storage so every tab agrees; don't let it outlive the browser session. */
chrome.runtime.onStartup.addListener(() => chrome.storage.local.remove('nai.liveFollow'));
chrome.runtime.onInstalled.addListener(() => chrome.storage.local.remove('nai.liveFollow'));

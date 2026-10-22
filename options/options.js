/* Nai settings page. Reads and writes the same storage keys as the panel, so every open
   tab picks changes up live (the panel listens to chrome.storage.onChanged). */
(() => {
  'use strict';

  const K = {
    settings: 'nai.settings',
    soul: 'nai.soul',
    memory: 'nai.memory',
    skills: 'nai.skills',
    bubbleHidden: 'nai.bubbleHidden',
  };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const get = (keys) => chrome.storage.local.get(keys);
  const set = (obj) => chrome.storage.local.set(obj);

  const state = { settings: {}, lang: 'en', skills: [], editing: null, dirty: { soul: false, memory: false } };
  const t = (k) => (NAI_I18N[state.lang] && NAI_I18N[state.lang][k]) || NAI_I18N.en[k] || k;

  /* ---------- feedback ---------- */

  const statusTimers = new WeakMap();
  function say(scope, text, kind) {
    const box = $('.status', scope) || scope;
    clearTimeout(statusTimers.get(box));
    box.textContent = text;
    box.className = 'status ' + (kind || 'ok');
    statusTimers.set(box, setTimeout(() => { box.textContent = ''; box.className = 'status'; }, 4500));
    if ((kind || 'ok') === 'ok') {
      const mark = $('#mark'); // the logo blinks once: something was saved
      mark.classList.remove('blink');
      void mark.offsetWidth;
      mark.classList.add('blink');
    }
  }

  async function patchSettings(patch) {
    const r = await get(K.settings);
    state.settings = { ...NAI_DEFAULT_SETTINGS, ...r[K.settings], ...patch };
    await set({ [K.settings]: state.settings });
  }

  /* ---------- language + theme ---------- */

  function applyTheme(theme) {
    const v = theme === 'light' || theme === 'dark' ? theme : 'system';
    if (v === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', v);
    $$('input[name="theme"]').forEach((r) => (r.checked = r.value === v));
  }

  function applyStyle(style) {
    const v = style === 'classic' ? 'classic' : 'ascii'; // ASCII is the default look
    document.documentElement.setAttribute('data-style', v);
    $$('input[name="style"]').forEach((r) => (r.checked = r.value === v));
  }

  function keyToggleLabel(input, btn) {
    btn.textContent = input.type === 'password' ? t('optShow') : t('optHide');
  }

  function applyLang() {
    document.documentElement.lang = state.lang;
    document.title = t('optTitle');
    $$('[data-i18n]').forEach((n) => (n.textContent = t(n.dataset.i18n)));
    $('#version').textContent = t('optVersion').replace('{v}', chrome.runtime.getManifest().version);
    $('#keyHelp').textContent = t('setKeyHelper');
    $('#noKey').textContent = t('optNoKey');
    $('#searchProvider').options[0].textContent = t('searchOff');
    ['historyKeep', 'historyOff'].forEach((k, i) => ($('#historyMode').options[i].textContent = t(k)));
    ['daysNever', 'days7', 'days30', 'days90'].forEach((k, i) => ($('#historyDays').options[i].textContent = t(k)));
    $('#historyClear').textContent = t(historyArmed ? 'historyClearSure' : 'historyClear');
    refreshHistoryCount();
    ['sttAuto', 'sttBrowser', 'sttRecorder'].forEach((k, i) => ($('#sttEngine').options[i].textContent = t(k)));
    keyToggleLabel($('#apiKey'), $('#toggleKey'));
    keyToggleLabel($('#searchKey'), $('#toggleSearchKey'));
    $$('input[name="lang"]').forEach((r) => (r.checked = r.value === state.lang));
    $$('.doc').forEach(updateCount);
    updateNoKey();
    renderSkills();
  }

  /* ---------- model ---------- */

  const providerSel = $('#provider');
  for (const [id, p] of Object.entries(NAI_PROVIDERS)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = p.label;
    providerSel.appendChild(o);
  }
  providerSel.addEventListener('change', () => {
    const p = NAI_PROVIDERS[providerSel.value];
    const endpoint = $('#endpoint');
    const model = $('#modelName');
    if (!endpoint.value || Object.values(NAI_PROVIDERS).some((x) => x.endpoint === endpoint.value)) endpoint.value = p.endpoint;
    if (!model.value || Object.values(NAI_PROVIDERS).some((x) => x.model === model.value)) model.value = p.model;
  });

  function updateNoKey() {
    $('#noKey').hidden = !!$('#apiKey').value.trim();
  }
  $('#apiKey').addEventListener('input', updateNoKey);

  function fillModel() {
    const s = state.settings;
    providerSel.value = s.provider || 'openai';
    $('#endpoint').value = s.endpoint || '';
    $('#modelName').value = s.model || '';
    $('#apiKey').value = s.apiKey || '';
    $('#vision').checked = s.vision !== false;
    updateNoKey();
  }

  for (const [toggle, input] of [['#toggleKey', '#apiKey'], ['#toggleSearchKey', '#searchKey']]) {
    $(toggle).addEventListener('click', () => {
      const i = $(input);
      i.type = i.type === 'password' ? 'text' : 'password';
      keyToggleLabel(i, $(toggle));
    });
  }

  $('#modelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const endpoint = $('#endpoint').value.trim();
    const model = $('#modelName').value.trim();
    if (!/^https:\/\//.test(endpoint) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(endpoint)) {
      return say(form, t('toastEndpoint'), 'err');
    }
    if (!model) return say(form, t('toastModel'), 'err');
    await patchSettings({
      provider: providerSel.value,
      endpoint,
      model,
      apiKey: $('#apiKey').value.trim(),
      vision: $('#vision').checked,
    });
    say(form, state.settings.apiKey ? t('optSaved') : t('toastSavedNoKey'), state.settings.apiKey ? 'ok' : 'err');
  });

  /* ---------- soul.md / memory.md ---------- */

  const DOCS = {
    soul: { key: K.soul, fallback: NAI_DEFAULT_SOUL },
    memory: { key: K.memory, fallback: NAI_DEFAULT_MEMORY },
  };
  function updateCount(art) {
    $('.count', art).textContent = t('optChars').replace('{n}', $('textarea', art).value.length);
  }
  function download(filename, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  $$('.doc').forEach((art) => {
    const name = art.dataset.doc;
    const ta = $('textarea', art);
    ta.addEventListener('input', () => {
      state.dirty[name] = true;
      updateCount(art);
    });
    art.addEventListener('click', async (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (!act) return;
      if (act === 'save') {
        await set({ [DOCS[name].key]: ta.value });
        state.dirty[name] = false;
        say(art, t('toastSavedDoc') + name + '.md');
      }
      if (act === 'export') {
        download('nai-' + name + '.md', ta.value);
        say(art, t('toastExported') + name + '.md');
      }
      if (act === 'import') {
        const input = $('#docFile');
        input.dataset.doc = name;
        input.click();
      }
    });
  });
  $('#docFile').addEventListener('change', async (e) => {
    const input = e.currentTarget;
    const name = input.dataset.doc;
    const file = input.files[0];
    input.value = '';
    if (!name || !file) return;
    const art = $('.doc[data-doc="' + name + '"]');
    const ta = $('textarea', art);
    ta.value = await file.text();
    await set({ [DOCS[name].key]: ta.value });
    state.dirty[name] = false;
    updateCount(art);
    say(art, t('optImported').replace('{name}', name + '.md'));
  });

  /* ---------- skills ---------- */

  const slug = (v) =>
    String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const oneLine = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  const saveSkills = () => set({ [K.skills]: state.skills });

  function skillToMd(k) {
    return (
      '---\nname: ' + k.name + '\ndescription: ' + oneLine(k.description) +
      (k.always ? '\nalways: true' : '') + (k.search ? '\nsearch: true' : '') +
      '\n---\n\n' + String(k.body || '').trim() + '\n'
    );
  }
  function parseSkillMd(text, fallbackName) {
    const src = String(text || '').replace(/^\uFEFF/, '');
    const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(src);
    const meta = {};
    let body = src;
    if (m) {
      body = m[2];
      for (const line of m[1].split(/\r?\n/)) {
        const kv = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line);
        if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '');
      }
    }
    const name = slug(meta.name || fallbackName);
    body = body.trim();
    if (!name || !body) return null;
    return {
      name,
      description: oneLine(meta.description),
      body,
      enabled: true,
      always: /^true$/i.test(meta.always || ''),
      search: /^true$/i.test(meta.search || ''),
    };
  }
  function uniqueName(name) {
    let n = name;
    let i = 2;
    while (state.skills.some((k) => k.name === n)) n = name.slice(0, 36) + '-' + i++;
    return n;
  }

  function renderSkills() {
    const list = $('#skillList');
    list.replaceChildren();
    if (!state.skills.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = t('skillsEmpty');
      list.appendChild(p);
      return;
    }
    for (const k of state.skills) {
      const row = document.createElement('div');
      row.className = 'skill-row';

      const sw = document.createElement('label');
      sw.className = 'switch';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('role', 'switch');
      cb.checked = k.enabled !== false;
      cb.setAttribute('aria-label', t('skillEnabled') + ': /' + k.name);
      cb.addEventListener('change', () => {
        k.enabled = cb.checked;
        saveSkills();
      });
      const track = document.createElement('span');
      track.className = 'track';
      sw.append(cb, track);

      const info = document.createElement('div');
      info.className = 'skill-info';
      const title = document.createElement('strong');
      title.textContent = '/' + k.name;
      info.appendChild(title);
      for (const [on, key] of [[k.always, 'skillBadgeAlways'], [k.search, 'skillBadgeWeb']]) {
        if (!on) continue;
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = t(key);
        info.appendChild(b);
      }
      const desc = document.createElement('p');
      desc.textContent = k.description;
      info.appendChild(desc);

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn ghost';
      edit.textContent = t('skillEdit');
      edit.addEventListener('click', () => openEditor(k));

      row.append(sw, info, edit);
      list.appendChild(row);
    }
  }

  const editor = $('#skillEditor');
  let deleteArmed = null;
  function openEditor(k) {
    state.editing = k ? k.name : null;
    $('#skName').value = k ? k.name : '';
    $('#skDesc').value = k ? k.description : '';
    $('#skBody').value = k ? k.body : '';
    $('#skAlways').checked = !!(k && k.always);
    $('#skSearch').checked = !!(k && k.search);
    $('#skDelete').hidden = !k;
    $('#skDelete').textContent = t('skillDelete');
    clearTimeout(deleteArmed);
    deleteArmed = null;
    editor.hidden = false;
    editor.scrollIntoView({ block: 'nearest' });
    $('#skName').focus();
  }
  const closeEditor = () => {
    editor.hidden = true;
    state.editing = null;
  };
  const skillsScope = () => $('#skills');

  $('#skillNew').addEventListener('click', () => openEditor(null));
  $('#skCancel').addEventListener('click', closeEditor);
  editor.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = slug($('#skName').value);
    const body = $('#skBody').value.trim();
    if (!name) return say(skillsScope(), t('skillNeedName'), 'err');
    if (!body) return say(skillsScope(), t('skillNeedBody'), 'err');
    if (state.skills.some((k) => k.name === name && k.name !== state.editing)) return say(skillsScope(), t('skillNameTaken'), 'err');
    const next = {
      name,
      description: oneLine($('#skDesc').value),
      body,
      enabled: true,
      always: $('#skAlways').checked,
      search: $('#skSearch').checked,
    };
    const i = state.skills.findIndex((k) => k.name === state.editing);
    if (i >= 0) {
      next.enabled = state.skills[i].enabled !== false;
      state.skills[i] = next;
    } else {
      state.skills.push(next);
    }
    saveSkills();
    closeEditor();
    renderSkills();
    say(skillsScope(), t('toastSkillSaved'));
  });
  $('#skExport').addEventListener('click', () => {
    const name = slug($('#skName').value) || 'skill';
    download(name + '.md', skillToMd({
      name,
      description: $('#skDesc').value,
      body: $('#skBody').value,
      always: $('#skAlways').checked,
      search: $('#skSearch').checked,
    }));
  });
  $('#skDelete').addEventListener('click', () => {
    const btn = $('#skDelete');
    if (!deleteArmed) {
      btn.textContent = t('skillDeleteSure');
      deleteArmed = setTimeout(() => {
        deleteArmed = null;
        btn.textContent = t('skillDelete');
      }, 4000);
      return;
    }
    clearTimeout(deleteArmed);
    deleteArmed = null;
    state.skills = state.skills.filter((k) => k.name !== state.editing);
    saveSkills();
    closeEditor();
    renderSkills();
    say(skillsScope(), t('toastSkillDeleted'));
  });
  $('#skillImport').addEventListener('click', () => $('#skillFile').click());
  $('#skillFile').addEventListener('change', async (e) => {
    const input = e.currentTarget;
    let added = 0;
    for (const f of [...input.files].slice(0, 20)) {
      if (f.size > 100000) continue;
      const k = parseSkillMd(await f.text(), f.name.replace(/\.[^.]+$/, ''));
      if (!k) continue;
      k.name = uniqueName(k.name);
      state.skills.push(k);
      added++;
    }
    input.value = '';
    if (added) {
      saveSkills();
      renderSkills();
    }
    say(skillsScope(), added ? t('toastSkillImported').replace('{n}', added) : t('toastSkillImportNone'), added ? 'ok' : 'err');
  });
  $('#skillRestore').addEventListener('click', () => {
    let added = 0;
    for (const k of NAI_STARTER_SKILLS) {
      if (state.skills.some((x) => x.name === k.name)) continue;
      state.skills.push({ enabled: true, always: false, search: false, ...k });
      added++;
    }
    if (added) {
      saveSkills();
      renderSkills();
    }
    say(skillsScope(), t('toastSkillRestored').replace('{n}', added));
  });

  /* ---------- voice ---------- */

  $('#voiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const engine = $('#sttEngine').value;
    const endpoint = $('#sttEndpoint').value.trim();
    if (endpoint && !/^https:\/\//.test(endpoint) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(endpoint)) {
      return say(e.currentTarget, t('toastEndpoint'), 'err');
    }
    await patchSettings({
      sttEngine: engine,
      sttModel: $('#sttModel').value.trim(),
      sttEndpoint: endpoint,
      // choosing "Automatic" again lets the browser's own recognition be tried first once more
      sttAutoFallback: engine === 'auto' ? false : !!state.settings.sttAutoFallback,
    });
    say(e.currentTarget, t('optSaved'));
  });

  /* ---------- privacy ---------- */

  let historyArmed = null;
  async function refreshHistoryCount() {
    const r = await get('nai.chats');
    $('#historyCount').textContent = t('historyCount').replace('{n}', (r['nai.chats'] || []).length);
  }
  $('#privacyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const days = Number($('#historyDays').value) || 0;
    await patchSettings({ historyMode: $('#historyMode').value, historyDays: days });
    if (days) {
      // apply the retention now instead of waiting for the next time a page opens Nai
      const r = await get('nai.chats');
      const cutoff = Date.now() - days * 86400000;
      const chats = r['nai.chats'] || [];
      const kept = chats.filter((c) => (c.time || 0) >= cutoff);
      if (kept.length !== chats.length) await set({ 'nai.chats': kept });
    }
    refreshHistoryCount();
    say(e.currentTarget, t('optSaved'));
  });
  $('#historyClear').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!historyArmed) {
      btn.textContent = t('historyClearSure');
      historyArmed = setTimeout(() => {
        historyArmed = null;
        btn.textContent = t('historyClear');
      }, 4000);
      return;
    }
    clearTimeout(historyArmed);
    historyArmed = null;
    btn.textContent = t('historyClear');
    await set({ 'nai.chats': [], 'nai.activeChat': null });
    refreshHistoryCount();
    say($('#privacyForm'), t('toastHistoryCleared'));
  });

  /* ---------- web search ---------- */

  const searchSel = $('#searchProvider');
  for (const p of [{ id: 'none', name: 'Off' }, ...NAI_SEARCH_PROVIDERS]) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    searchSel.appendChild(o);
  }
  $('#searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await patchSettings({ searchProvider: searchSel.value, searchKey: $('#searchKey').value.trim() });
    say(e.currentTarget, t('optSaved'));
  });

  /* ---------- appearance ---------- */

  $$('input[name="theme"]').forEach((r) =>
    r.addEventListener('change', async () => {
      applyTheme(r.value);
      await patchSettings({ theme: r.value });
      say($('#lookStatus'), t('optSaved'));
    })
  );
  $$('input[name="style"]').forEach((r) =>
    r.addEventListener('change', async () => {
      applyStyle(r.value);
      await patchSettings({ style: r.value });
      say($('#lookStatus'), t('optSaved'));
    })
  );
  $$('input[name="lang"]').forEach((r) =>
    r.addEventListener('change', async () => {
      state.lang = r.value;
      await patchSettings({ lang: r.value });
      applyLang();
      say($('#lookStatus'), t('optSaved'));
    })
  );
  $('#bubble').addEventListener('change', async (e) => {
    await set({ [K.bubbleHidden]: !e.currentTarget.checked });
    say($('#lookStatus'), t('optSaved'));
  });

  /* ---------- live sync with the panel and other tabs ---------- */

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
        applyLang();
      }
    }
    if (changes[K.skills] && Array.isArray(changes[K.skills].newValue)) {
      state.skills = changes[K.skills].newValue;
      renderSkills();
    }
    for (const [name, d] of Object.entries(DOCS)) {
      if (changes[d.key] && !state.dirty[name]) {
        const art = $('.doc[data-doc="' + name + '"]');
        $('textarea', art).value = changes[d.key].newValue || '';
        updateCount(art);
      }
    }
    if (changes[K.bubbleHidden]) $('#bubble').checked = !changes[K.bubbleHidden].newValue;
    if (changes['nai.chats']) refreshHistoryCount();
  });

  /* ---------- section highlight in the side nav ---------- */

  const links = $$('.rail nav a');
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((l) => l.removeAttribute('aria-current'));
        const a = links.find((l) => l.getAttribute('href') === '#' + e.target.id);
        if (a) a.setAttribute('aria-current', 'true');
      }
    },
    { rootMargin: '-15% 0px -70% 0px' }
  );
  links.forEach((l) => {
    const sec = $(l.getAttribute('href'));
    if (sec) io.observe(sec);
  });

  /* ---------- start ---------- */

  (async () => {
    const r = await get([K.settings, K.soul, K.memory, K.skills, K.bubbleHidden]);
    state.settings = { ...NAI_DEFAULT_SETTINGS, ...r[K.settings] };
    state.lang = state.settings.lang || ((navigator.language || '').toLowerCase().startsWith('id') ? 'id' : 'en');
    if (Array.isArray(r[K.skills])) {
      state.skills = r[K.skills];
    } else {
      state.skills = NAI_STARTER_SKILLS.map((k) => ({ enabled: true, always: false, search: false, ...k }));
      await saveSkills();
    }
    applyTheme(state.settings.theme);
    applyStyle(state.settings.style);
    fillModel();
    $('#historyMode').value = state.settings.historyMode === 'off' ? 'off' : 'keep';
    $('#historyDays').value = String([7, 30, 90].includes(Number(state.settings.historyDays)) ? Number(state.settings.historyDays) : 0);
    $('#sttEngine').value = state.settings.sttEngine || 'auto';
    $('#sttModel').value = state.settings.sttModel || '';
    $('#sttEndpoint').value = state.settings.sttEndpoint || '';
    searchSel.value = state.settings.searchProvider || 'none';
    $('#searchKey').value = state.settings.searchKey || '';
    $('#bubble').checked = !r[K.bubbleHidden];
    for (const [name, d] of Object.entries(DOCS)) {
      $('.doc[data-doc="' + name + '"] textarea').value = typeof r[d.key] === 'string' ? r[d.key] : d.fallback;
    }
    applyLang();
    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView();
    }
  })();
})();

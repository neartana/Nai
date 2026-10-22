<p align="center">
  <img src="assets/logo.svg" width="300" alt="Nai logo">
</p>

<p align="center">
  <strong>Nai. The AI that's yours.</strong><br>
  A customizable AI assistant that lives in your browser — a floating bubble on every page,<br>
  powered by your model, your API key, and your data, which never leaves your browser.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.13.1-5B5BD6?style=flat-square" alt="Version 0.13.1">
  <img src="https://img.shields.io/github/license/neartana/Nai?style=flat-square&color=5B5BD6" alt="License: MIT">
  <img src="https://img.shields.io/github/stars/neartana/Nai?style=flat-square&color=5B5BD6" alt="GitHub stars">
  <img src="https://img.shields.io/badge/manifest-V3-5B5BD6?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/dependencies-0-5B5BD6?style=flat-square" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/Chromium-116%2B-5B5BD6?style=flat-square" alt="Chromium 116+">
</p>

## What is Nai?

Nai is a browser extension (Manifest V3, vanilla JavaScript, zero dependencies) that puts a
personal AI assistant on every page you visit: a small bubble on the right edge opens a chat
panel that can read the page, look at your screen, open your PDFs, and remember what matters
to you — with your approval, every time.

There is no Nai server and no account. You bring an API key for any OpenAI-compatible
endpoint (or OpenRouter, or a local model through a custom endpoint), and everything —
chats, settings, memory — is stored only in your browser.

## Features

- **Chat anywhere** — streaming replies from your own model on any page; the conversation follows you across tabs.
- **Bring your own provider** — presets for OpenAI-compatible endpoints and OpenRouter, plus a custom endpoint for local models (Ollama, LM Studio, …).
- **Voice input** — dictate with the browser's speech recognition, or record and transcribe through your provider.
- **Eyes on the page** — one-click *Scan this page*, live screen sharing that follows your tab, and image paste & drop.
- **PDF reading** — attach PDFs and ask about them; scanned PDFs are read as page images (bundled pdf.js).
- **A soul and a memory** — `soul.md` sets Nai's character; `memory.md` holds what it knows about you. Nai proposes memory updates as approve/dismiss cards — nothing is stored without your say-so.
- **Skills** — reusable Markdown instructions you run with `/` (summarize, translate, proofread, …), editable and importable.
- **Web search** — optional, with your own Brave, Tavily, or Serper key; answers cite their sources.
- **Private by design** — no key ships with the extension, no telemetry, and chat-history controls (keep, age out, or don't save at all).
- **Two languages, two styles** — English / Indonesian UI, ASCII or Classic style, light and dark themes.

## Project structure

```
nai/
├── manifest.json               # MV3 manifest: permissions, content scripts, Alt+N command
├── background/
│   └── service-worker.js       # LLM proxy (streaming SSE), connection test, screenshots, command
├── content/
│   ├── defaults.js             # default soul.md / memory.md, provider presets
│   ├── styles.js               # design tokens + all panel/bubble CSS (shadow-DOM stylesheet)
│   ├── markdown.js             # tiny safe Markdown renderer
│   └── content-script.js       # bubble + chat panel + files/screen/capture + history view
├── lib/pdfjs/                  # bundled pdf.js (Mozilla, Apache-2.0): reads PDFs
├── offscreen/                  # hidden page where pdf.js runs (needs a DOM, worker, canvas)
├── options/                    # the Settings page
├── icons/                      # generated indigo-circle logos (tools/gen_icons.py)
├── assets/
│   ├── logo.svg                # README wordmark (the extension glyph + name)
│   ├── soul.md                 # Nai's default character (reference copy)
│   └── memory.md               # default empty memory (reference copy)
└── tools/gen_icons.py
```

**How it fits together:** a content script injects the 64px bubble (Shadow DOM, 70% opacity,
draggable, position remembered) and the 400px chat panel on every page. The panel talks to the
service worker over a port for streamed chat, and via messages for screenshots and connection
tests. Settings, soul.md, memory.md, and the bubble position live in `chrome.storage.local`.

**One design decision to know:** the spec allowed "side panel/popup, settings page" — Nai keeps
settings as a view *inside* the same panel (back button, "Settings" title), so users never switch
screens.

## Permissions (and why)

| Permission | Why |
|---|---|
| `activeTab` + `scripting` | Lets the toolbar icon / Alt+N open Nai on a page that was already open before install, by injecting it on demand |
| `storage` | API key, soul.md, memory.md, bubble position — all local, nothing synced away |
| `host_permissions: https://*/*` | The service worker must call **your** chosen LLM endpoint from an extension context (page CSP would otherwise block it); also enables the one-click page screenshot |
| `host_permissions: http://localhost/*, http://127.0.0.1/*` | Local models (Ollama, LM Studio, …) |

Files and screen capture are **not** manifest permissions — they're requested by the browser
only after you click Voice, File, or Screen. The API key is sent only to the configured endpoint.

## Load it (developer mode)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top right).
3. **Load unpacked** → select this `Nai` folder.
4. Visit any normal https page — the indigo bubble sits on the right edge.

## First run

Nai ships with **no account and no API key**. On first run, open Settings, pick a
provider preset (OpenAI-compatible, OpenRouter, or Custom), paste your own API key,
and type the model name you want — everything is stored only in this browser.

1. Click the bubble → the panel opens, ready to chat.
2. To change provider/model/key: gear icon → opens the Settings page → **Save**
   (toast "Connection saved" means you're live).
3. Chat by typing, **Voice** (the microphone button), **File** (or drag & drop), or **Screen** → *Scan this page* /
   *Share screen live*. Toggle the panel anytime with the **toolbar icon** (pin Nai from the puzzle-piece menu) or **Alt+N**.

## Known limitations

- `chrome://` pages, the Web Store, other extensions' pages, and the **built-in PDF viewer**
  (a `chrome-extension://` page) block content scripts — no bubble there. Platform limit, not fixable.
- Tabs already open before installing/reloading Nai have no content script yet — click the toolbar
  icon or Alt+N once (it injects on demand), or reload the tab.
- PDF import is best-effort (plain FlateDecode text streams only; scanned PDFs and CID fonts
- Live screen capture can be blocked by a site's `Permissions-Policy: display-capture`; the error
  surfaces as a toast.
- Plus Jakarta Sans is used if installed on the system; otherwise the UI falls back to
  `system-ui`. Bundle the woff2 files to make it exact.
- Conversation history is saved locally (last 50 chats) — open it via the clock icon in the header. Images are not kept in history, only text.
- Before publishing, check that the name **"Nai"** is available on the Chrome Web Store and as a domain.

## Features beyond the basics

- **Languages:** English (US) and Indonesia — pick in Settings. Switches the UI and Nai's reply language.
- **History:** clock icon opens the history view — reopen old chats, delete them, or start a New chat. The ongoing conversation follows you across tabs.
- **Layout:** the panel pushes the page aside when the window has room (≥900px left for the host), otherwise it overlays. Drag the panel's left edge to resize; double-click the edge to cycle compact | normal | wide. Width persists.
- **Cancel:** while a reply streams, the send button becomes Stop (keeps the partial reply), and the pending message bubble has an × that unsends it (aborts, removes both messages, restores your input).

## Follow-up ideas

1. Bundle Plus Jakarta Sans woff2 for pixel-exact typography.
2. A small live-preview thumbnail while screen sharing is active.
3. Richer error states with retry buttons inline in the chat.

## Changelog

Newest first.

### 0.13.1: no default model

- The default preset no longer suggests a model: the model field starts empty and you
  type the model name you want. (The OpenAI-compatible and OpenRouter presets still
  suggest one.) A model name you already saved is untouched by updates.
- Sending without a model says so ("No model chosen yet...") and the Settings button opens straight
  at the Model section. Sending without a key or a model now puts your typed message back in the box,
  instead of losing it.

### 0.13.0: privacy options for chat history

- New **Settings -> Privacy** section (no encryption: the chats never leave your browser anyway, and
  a key stored beside them would not protect anything; these controls do):
  - **Chat history**: *Keep my chats* (default, as before) or *Don't save chats*: nothing is written
    to storage, the last conversation is not resumed, and the chat is gone when the tab closes.
  - **Delete old chats**: never (default), or after 7, 30 or 90 days of inactivity. It applies when you
    save the setting and again each time a page opens Nai.
  - **Delete all chat history**: asks for a second click; also shows how many conversations are stored.
- `memory.md` is separate from chats: edit or clear it under Soul and memory.

### 0.12.1: no more "No tab with id" errors

- Clicking the toolbar icon (or pressing Alt+N) on a tab that Nai can't run on, or that closes right
  away, set the icon badge for a tab that no longer existed, and each of those calls rejected with
  "Uncaught (in promise) Error: No tab with id: N". The badge calls now ignore a vanished tab.

### 0.12.0: voice that explains itself, and no API key in the package

- **Voice**: "Didn't catch anything" used to cover five different situations. Now:
  - A live **level meter** in the header (`Listening ▁▃▆▇▅`) shows whether sound reaches the browser.
  - In **Automatic** mode a recording runs next to the browser's recognizer as a safety net: if the
    recognizer returns nothing (it can end silently in Opera/Brave), the recording is transcribed
    instead, so you don't have to repeat yourself. If the recognizer fails outright (`network`, ...),
    Nai keeps recording and transcribes when you stop.
  - Specific messages: *too short*, *no sound reached the microphone* (with where to check), *the browser
    returned no text* (with the setting to change), *the transcription came back empty*.
- **No API key ships in the package anymore.** It starts empty (as originally specified); Nai says
  so, and the Settings page asks for it. An existing key in your browser is untouched by updates.
  If you ever shared an older zip, rotate that key at your provider: older packages contained it.

### 0.11.1: no API key ships with Nai

- The default key that was embedded in `content/defaults.js` is gone: Nai now starts with an empty
  key, as originally specified, and the first message shows the welcome note with an **Open
  Settings** button. The model endpoint and name defaults stay, only the secret is removed.
- The panel no longer silently puts a default key back when the stored key is empty.
- Existing installs keep the key already saved in their browser (updates never overwrite settings).
  **If an earlier zip of Nai was shared anywhere, rotate that key at the provider.**

### 0.11.0: Capture becomes a microphone (voice input)

- The **Capture** button (screen to prompt) is replaced by a **microphone** button in the same spot:
  click to dictate, click again to stop; Send also just stops the dictation first. Your words land in
  the message box and are never auto-sent; closing the panel cancels. While listening the header says
  "Listening" and the button is highlighted.
- **Scan this page** is untouched: it keeps the same scrolling screenshot engine (and its Cancel bar).
  The Capture-only code (screen picker, the UI-analysis prompt, the result message) is gone.
- Two engines, chosen in **Settings -> Voice**: *Browser speech recognition* (Web Speech API; needs
  Google's speech servers, so Opera/Brave often fail) and *Record and transcribe* (MediaRecorder -> your
  provider's `/audio/transcriptions` with your key; needs a provider that offers it, such as OpenAI or Groq).
  **Automatic** (default) tries the browser first and switches to recording the first time the
  browser can't do it (errors `network`, `service-not-allowed`, `language-not-supported`,
  `audio-capture`), remembering that. Optional transcription model and endpoint fields.
- Spoken language follows the UI language (English or Indonesian). The microphone permission is the
  browser's usual per-site prompt.

### 0.10.0: paste images into the chat

- **Ctrl+V** (or right-click Paste) in the panel attaches an image from the clipboard: a screenshot,
  "Copy image" from a web page, or a picture file copied in the file manager. Pasted pictures are named
  `pasted-image-1.png`, `pasted-image-2.png`, ... and travel exactly like uploaded images (shrunk to
  1280px, sent with your message, shown as thumbnails in the chat).
- Pending attachments now show a small thumbnail in their chip.
- Plain text pastes are never touched, and a mixed clipboard (a copied spreadsheet cell carries a
  picture and its text) pastes as text. With "This model accepts images" off, a pasted image is
  refused with the usual note.

### 0.9.3: no more "Extension context invalidated" errors

- After the extension is reloaded or updated, tabs that were already open keep an old copy of
  Nai whose `chrome.*` calls all throw "Extension context invalidated" (uncaught, and "in promise"
  for the async ones). Every storage, message, port and timer call now goes through guarded wrappers:
  the old copy shows "Nai was updated. Click the Nai icon in the toolbar, or refresh this page.",
  stops its timers, and removes itself after 8 seconds instead of throwing. The toolbar icon (or a refresh)
  brings back a fresh copy.

### 0.9.2: longer scans and a Cancel button

- **Scan this page** (and Capture) now take up to **32 screenshots** (about 28 screens of page),
  and still stop earlier when they reach the bottom. If the page is longer, the model is told the end
  was not captured.
- A **Cancel** bar shows while scanning ("Scanning page... 5/32  [ Cancel ]"). **Esc** also cancels.
  Cancelling stops within about a second, restores your scroll position and attaches nothing.
  The bar and Nai's panel are hidden at the moment each screenshot is taken, so neither is in the pictures
  (checked pixel by pixel in the tests). Switching to another tab during a scan cancels it too, so it
  can never photograph the wrong page.
- Long scans use lighter pictures so the whole request stays around 10 MB: the picture budget is
  shared across the expected number of screens.

### 0.9.1: new logo for the browser tab and toolbar

- The toolbar/extension icons (16-128px) and the Settings tab's favicon are now the ASCII-style
  mark: an indigo square with an ink border and two white block eyes (`tools/gen_icons.py`
  regenerates the PNGs; `icons/icon.svg` is the crisp tab favicon). Chrome caches favicons, so
  reload the extension and reopen the Settings tab to see it.

### 0.9.0: ASCII style

- New default look, designed on a Claude Design canvas ("Nai: ASCII UI"): monospace type,
  square corners, hard 1px borders with dashed separators, `[x]` glyph buttons, a `> you` / `nai:` log
  instead of chat bubbles, `[ bracket ]` suggestion chips, a block cursor while Nai thinks, and `[x]`
  / `[ ]` switches on the Settings page. Light and dark both work.
- **Settings → Appearance → Style** switches between **ASCII** and **Classic** (the previous
  rounded look). It applies live in every tab. The ASCII look is only a stylesheet layer over the
  same markup, so nothing about how Nai works changed.
- No new fonts: it uses the system's monospace font.

### 0.8.2: Scan this page reads PDFs in the browser's PDF viewer

- The PDF viewer scrolls inside its own plugin, so the screenshot loop could only photograph the
  first page. On a PDF tab, **Scan this page** now downloads the same file and reads it with
  pdf.js: every page, top to bottom, as text (up to about 80,000 characters, with a note about how
  many pages were read), or as page images for a scanned PDF (first 6 pages).
- If the file can't be downloaded again (the server refuses, or it is a `file://` PDF, where Chrome
  doesn't run extensions unless you allow it), Nai says so and suggests attaching it with File.
- **Capture** is unchanged: it is meant for screenshots of interfaces, not documents.

### 0.8.1: no more "already declared" errors

- Injecting Nai a second time into a tab that already had it (the toolbar icon does this for
  stale or old tabs) threw "Identifier 'NAI_DEFAULT_SOUL' / 'NAI_CSS' has already been declared"
  in the extension's error list. The shared definitions are now re-runnable, so a second
  injection is silent and always leaves the newest data in place. (Tabs that still hold the
  previous version need one refresh.)
- pdf.js no longer logs harmless font warnings such as "TT: undefined function: 21".

### 0.8.0: PDFs that work, and Scan this page goes all the way down

- **PDFs**: the home-made PDF reader (it only understood the simplest files, hence "unsupported
  pdf") is replaced by **pdf.js**, bundled in `lib/pdfjs` and run in an offscreen page. Word,
  Google Docs, Chrome, LibreOffice and LaTeX PDFs are read as text. **Scanned PDFs** (no selectable
  text) are rendered to images, first 6 pages, and attached for a vision model. Password-protected
  and damaged files get a clear message. Limit: 30 MB per file, about 40,000 characters of text.
  (Uses the `offscreen` permission and Chrome 116 or newer; extension pages now allow
  `wasm-unsafe-eval` because pdf.js decodes some scanned image formats with WebAssembly.)
- **Scan this page** now scrolls from the top to the bottom like Capture: one screenshot per screen
  (up to 32, each overlapping a little), with Nai hidden and your scroll position restored, **Esc**
  cancels. The page text is read after the scroll, so lazy-loaded content is included, up to
  30,000 characters. Pages that can't be screenshotted get a text-only scan.
- Attachment chips show how many images a scan or PDF contributes.
- pdf.js is Apache-2.0 licensed; its license ships in `lib/pdfjs/LICENSE`.

### 0.7.0: Settings are a page of their own

- The gear in the panel now opens **Nai's settings in a new tab** (`options/`), reused if it is
  already open. Opening it from an error message jumps to the relevant section (for example
  Web search). Everything that used to live in the panel's settings view moved there:
  model and API key, `soul.md` / `memory.md` editors, skills, web search, theme, language, and the
  floating-bubble switch.
- The page has a side nav that follows your scroll, light/dark/system theme, English and
  Indonesian, and a layout that works down to phone width. The logo blinks once when something is saved.
- **Save** replaces "Save and test connection" (and "Save and test search"). Nothing is sent to
  the model when you save; if the key or endpoint is wrong, the chat tells you when you ask something.
- Changes apply live in every open tab: model, theme, language, skills, soul and memory.
- Removed from the panel: the settings view, its styles, and the connection-test handler in the
  service worker. The panel keeps only the history view.

### 0.6.1: cleaner composer + theme setting

- Removed the helper line under the message box. The privacy note it carried (Capture sends
  screenshots to your AI model) now lives in the Capture button's tooltip.
- **Settings → Theme**: System (follows your OS, the old behavior), Light, or Dark. It applies
  instantly and in every open tab.

### 0.6.0: layout, motion, and hardening

- **Tool buttons**: Capture, File, Screen and Web are now 40px icon buttons with a tooltip (hover
  or keyboard focus). When the panel is wide enough (about 435px or more) they show their labels
  again. Chips, header icons and text buttons went from 44px to 40px.
- **Settings** sections (Model, Soul and memory, Skills, Web search) fold open and closed with
  an animation; only Model starts open, and Web search opens by itself when you turn the Web
  button on without a key.
- **Motion**: panel slide and fade, messages rising in, animated thinking dots, menu and toast
  pop-ins, a blinking bubble, a pulsing status dot and a pulsing ring on busy tools, press
  feedback on buttons. Restoring a saved chat doesn't animate every message at once.
  `prefers-reduced-motion` turns all of it off.
- **Hardening for sites like GitHub**: a stale copy of Nai left in a tab after an update or reload
  no longer blocks the new one (it is replaced), and Nai re-attaches itself if a single-page
  site's navigation drops it from the page.

### 0.4.0 + 0.5.0: Skills and web search

#### Skills
- A skill is a markdown file: front matter (`name`, `description`) + instructions, the same shape
  other agents use for `SKILL.md`. Skills live in Settings → **Skills**: enable/disable, edit,
  create, delete, **export** and **import** `.md` files (import several at once).
- Run a skill by typing `/` in the chat (a menu lists them; Up/Down + Enter or Tab), for example
  `/summarize`. With nothing after the name, it works on the page you're viewing; with text,
  files, or a live view attached, it works on that.
- **Always on** skills are added to every message. Everything else only runs when you call it.
- Starter skills (editable, restorable): `summarize`, `translate`, `explain-simply`, `proofread`,
  `rewrite`, `write-email`, `action-items`, `brainstorm`, `compare`, `explain-code`, `research`.
  Advanced skills are yours to add.
- Optional front matter: `always: true`, `search: true` (search the web before answering).

#### Web search
- Settings → **Web search**: pick Brave Search, Tavily, or Serper (Google results) and paste your
  own key. The 🌐 button next to Screen turns search on for every message; `/research` (or any
  skill with `search: true`) searches for just that message.
- Nai sends your message text to that provider as the query. The top results (title, link,
  snippet) go to your model, which cites them as [1], [2]; links appear as **Sources** under the
  answer and are included when you copy it.
- The search runs in the service worker with your key; nothing else leaves the browser.

### 0.3.0: live view follows your tab

- Problem: "Share screen live" used the browser's share picker. A shared *tab* stays locked to
  that one tab, so after switching tabs Nai kept seeing the first one.
- **Share screen live** now follows the tab you are on: no picker, nothing recorded. Each time you
  send a message, Nai takes one picture of the current tab right then (the Nai panel is cropped
  out). Switch tabs, open Nai there, ask: it sees the new tab. Stop it from any tab.
- The old picker mode is still there as **Share a window or screen…** for sharing other apps. A
  shared window or whole screen follows tab switches, a shared tab does not.
- Browser pages (chrome://, the Web Store) can't be screenshotted; you get a note instead.
- The live flag is cleared when the browser restarts.

### 0.2.5: no browser tabs / address bar in the prompt

- Cause: Chrome only lets an extension screenshot a tab silently when it holds the `<all_urls>`
  host permission (or `activeTab`, which a click on the in-page bubble doesn't grant). Nai only
  had `https://*/*`, so the page scan failed and Nai fell back to the screen picker, where a
  window/screen share includes the tab strip and address bar.
- Fix: `host_permissions` is now `<all_urls>` (Chrome will show "Read and change all your data on
  all websites"; Nai still only runs on http/https pages and only acts when you click Capture).
  The page scan therefore works on every normal page and never contains browser UI.
- The fallback picker now asks for the current tab first (`preferCurrentTab`), and the request to
  the model also says to ignore browser tabs, the address bar, title bars and the taskbar.

### 0.2.4: Nai no longer shows up in the generated prompt

- Cause: while capturing, Nai hid itself with `visibility: hidden`, but the open panel sets
  `visibility: visible` on itself, which beats the inherited value, so the panel stayed in the
  screenshots (and the model described it). Nai now hides with `display: none`.
- The screen-picker fallback also waits for fresh video frames after Nai disappears.
- As a second safety net, the request to the model says to ignore any "Nai" bubble or panel.

### 0.2.3: result as a message + sturdier copy

- The Capture result is now a normal chat message (a short "Capture this screen as a prompt"
  message from you, then the prompt from Nai) instead of text dropped into the input box.
  Use the copy button on the message to take it. It is also saved in the chat history, so you can
  ask Nai to adjust it. If the model answers something else (for example "this isn't a UI
  screenshot"), that answer is shown the same way.
- Copy fix: the fallback used when the page blocks the clipboard API never focused its hidden
  text field, so it could copy nothing. It now focuses and selects it first.

### 0.2.2: Capture scans the whole page

- **Capture** now scrolls the page from top to bottom and takes one screenshot per screen
  (about 10% overlap, up to 8 sections), then sends them together to your model as one page.
  Nai hides itself while scanning, restores your scroll position afterwards, and **Esc** cancels.
- Works for normal pages and for single-page apps that scroll inside one big container.
- Fixed headers and sticky bars repeat in every section; the model is told about that.
- Very long pages are cut after 8 sections (you get a note, and the model is told the page continues).
- Pages Chrome won't let Nai screenshot silently fall back to the screen picker with a single frame.

### 0.2.1: hide the bubble

- A small **x** appears on the bubble when you hover it (always visible on touch screens, and
  reachable with Tab). It hides the bubble on every site, in every open tab.
- Nai still opens from the **toolbar icon** or **Alt+N** while hidden.
- Bring the bubble back with **Undo** (shown for 8 seconds after hiding) or the
  **Show floating bubble** switch in Settings.

### 0.2.0: Capture screen to prompt (replaces Voice)

- The **Voice** button is gone. In the same spot, **Capture** (tooltip and aria-label:
  "Capture screen to prompt") takes ONE screenshot of a screen, window or tab you pick,
  stops the screen share immediately, and sends the image to your model through the same
  path as chat (service worker, your own key) with a UI/UX analysis instruction.
- The **READY-TO-USE PROMPT** section of the answer is shown as a chat message (see 0.2.3).
- Privacy: the image exists only in memory. It is not saved, not added to chat history or
  attachments, and not logged. It is sent to the model you configured, which is stated
  next to the composer and in the button tooltip. Large screenshots are downscaled
  (longest side 1600px, JPEG) and shrunk further if still too big.
- Needs a model that accepts images (Settings → "This model accepts images").
- Nai's own panel is hidden for the quarter second the frame is grabbed, so it doesn't
  show up when you capture the current tab.
- Removed with Voice: the speech-recognition and recording code, the transcription call in the
  service worker, the Voice section in Settings (microphone, speech engine, transcription
  model/endpoint), and the related strings. Nothing from it is used by another feature.
- Every message still has a copy button (added in 0.1.3).

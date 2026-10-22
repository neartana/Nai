/* Reads PDF files the user attaches in the panel, with a bundled copy of Mozilla's pdf.js
   (lib/pdfjs, Apache-2.0). It runs in an offscreen document because it needs a DOM, a worker
   and a canvas, none of which a content script or the service worker can offer safely.
   Text PDFs come back as text. PDFs without selectable text (scans) come back as page images
   so a vision model can read them. */
import * as pdfjs from '../lib/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdfjs/pdf.worker.min.mjs');

const MAX_TEXT_PAGES = 150;
const MAX_CHARS = 40000;
const MAX_IMAGE_PAGES = 6;
const IMAGE_EDGE = 1400;

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pageText(page) {
  const tc = await page.getTextContent();
  const lines = [];
  let line = '';
  for (const it of tc.items) {
    if (typeof it.str !== 'string') continue;
    line += it.str;
    if (it.hasEOL) {
      lines.push(line);
      line = '';
    }
  }
  if (line) lines.push(line);
  return lines.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function renderPages(doc) {
  const images = [];
  for (let i = 1; i <= Math.min(doc.numPages, MAX_IMAGE_PAGES); i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, IMAGE_EDGE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // JPEG has no alpha: paint paper first
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // intent 'print': the default 'display' schedules work with requestAnimationFrame, which
    // never fires in a hidden offscreen document, so the render would hang forever.
    await page.render({ canvasContext: ctx, viewport, canvas, intent: 'print' }).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.8));
    canvas.width = canvas.height = 0;
    page.cleanup();
  }
  return images;
}

async function readPdf({ data, wantImages, maxChars }) {
  const limit = Math.min(Math.max(Number(maxChars) || MAX_CHARS, 1000), 120000);
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: base64ToBytes(data),
      isEvalSupported: false, // extension pages don't allow eval
      verbosity: pdfjs.VerbosityLevel.ERRORS, // no console noise for harmless font warnings ("TT: undefined function")
      useSystemFonts: true,
      wasmUrl: chrome.runtime.getURL('lib/pdfjs/wasm/'),
    }).promise;
  } catch (e) {
    return { ok: false, code: e && e.name === 'PasswordException' ? 'PASSWORD' : 'INVALID', detail: String((e && e.message) || e) };
  }
  try {
    let text = '';
    let pagesRead = 0;
    for (let i = 1; i <= Math.min(doc.numPages, MAX_TEXT_PAGES) && text.length < limit; i++) {
      const page = await doc.getPage(i);
      const body = await pageText(page);
      page.cleanup();
      pagesRead = i;
      if (body) text += (text ? '\n\n' : '') + '[Page ' + i + ']\n' + body;
    }
    const readable = text.replace(/\[Page \d+\]/g, '').trim().length >= 50;
    const out = { ok: true, numPages: doc.numPages, pagesRead, text: text.slice(0, limit) };
    if (!readable && wantImages) out.images = await renderPages(doc);
    return out;
  } catch (e) {
    return { ok: false, code: 'FAILED', detail: String((e && e.message) || e) };
  } finally {
    doc.destroy();
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'pdf-read') return;
  readPdf(msg).then(sendResponse, (e) => sendResponse({ ok: false, code: 'FAILED', detail: String((e && e.message) || e) }));
  return true;
});

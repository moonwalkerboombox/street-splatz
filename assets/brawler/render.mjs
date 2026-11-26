#!/usr/bin/env node
// Street Splatz Brawler renderer (Playwright Chromium).
//
//   node render.mjs --out DIR a.svg b.svg ...      SVG -> DIR/<name>.png
//   node render.mjs --dir SVGDIR --out DIR         every *.svg in SVGDIR
//   node render.mjs --sheet sheet.png [--cols 4] [--title "text"] a.png b.png ...
//   node render.mjs --layout layout.json           captioned / cropped sheet, see renderLayout
//
// Card PNGs are always 1040 x 1520: the 520 x 760 card at deviceScaleFactor 2
// (same size and ratio as the approved sample card.png).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);   // honours NODE_PATH for the global playwright
const { chromium } = require('playwright');

export const CARD_W = 520, CARD_H = 760, SCALE = 2;

function parse(argv) {
  const o = { files: [], cols: 4, scale: SCALE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--dir') o.dir = argv[++i];
    else if (a === '--sheet') o.sheet = argv[++i];
    else if (a === '--cols') o.cols = parseInt(argv[++i], 10);
    else if (a === '--title') o.title = argv[++i];
    else if (a === '--thumb') o.thumb = parseInt(argv[++i], 10);
    else if (a === '--layout') o.layout = argv[++i];
    else o.files.push(a);
  }
  return o;
}

async function renderCards(browser, files, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: CARD_W, height: CARD_H }, deviceScaleFactor: SCALE });
  for (const f of files) {
    const svg = fs.readFileSync(f, 'utf8');
    // inline the SVG in a page so the embedded font can be awaited before the shot
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`);
    await page.evaluate(async () => {
      await document.fonts.load('40px SplatzBangers');
      await document.fonts.ready;
    });
    const out = path.join(outDir, path.basename(f).replace(/\.svg$/i, '') + '.png');
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: CARD_W, height: CARD_H }, omitBackground: true });
    console.log(out);
  }
  await page.close();
}

async function renderSheet(browser, files, outFile, cols, title, thumb) {
  const tw = thumb || 300;                       // css px per card, shot at 2x
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cells = files.map((f) => {
    const label = path.basename(f).replace(/\.png$/i, '');
    return `<figure><img src="${pathToFileURL(path.resolve(f)).href}"><figcaption>${esc(label)}</figcaption></figure>`;
  }).join('');
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;background:#15121f;color:#ede7ff;font:600 15px/1.2 "DejaVu Sans",Arial,sans-serif}
    h1{margin:0;padding:18px 20px 0;font-size:20px;letter-spacing:.04em}
    .g{display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:18px;padding:20px;width:max-content}
    figure{margin:0}img{display:block;width:${tw}px;height:auto}
    figcaption{padding:7px 2px 0;text-align:center;letter-spacing:.03em}
  </style></head><body>${title ? `<h1>${esc(title)}</h1>` : ''}<div class="g">${cells}</div></body></html>`;
  const tmp = path.join(path.dirname(path.resolve(outFile)), `.sheet-${process.pid}.html`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, html);
  const page = await browser.newPage({ viewport: { width: cols * (tw + 18) + 22, height: 600 }, deviceScaleFactor: 2 });
  try {
    await page.goto(pathToFileURL(tmp).href);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    const box = await page.evaluate(() => {
      const r = document.body.getBoundingClientRect();
      return { w: Math.ceil(document.querySelector('.g').getBoundingClientRect().width), h: Math.ceil(r.height) };
    });
    await page.setViewportSize({ width: box.w, height: box.h });
    await page.screenshot({ path: outFile, fullPage: true });
    console.log(outFile);
  } finally {
    fs.unlinkSync(tmp);
    await page.close();
  }
}

// Captioned sheet from a JSON layout:
//   { "out": "sheet.png", "title": "...", "subtitle": "...", "thumb": 300,
//     "rows": [ { "label": "POSES", "thumb": 300,
//                 "cells": [ { "png": "016.png", "caption": "#016 ...", "sub": "...",
//                              "crop": [x, y, w, h] } ] } ] }
// png paths are relative to the layout file. crop is in card units (520 x 760).
async function renderLayout(browser, layoutFile) {
  const L = JSON.parse(fs.readFileSync(layoutFile, 'utf8'));
  const base = path.dirname(path.resolve(layoutFile));
  const outFile = path.resolve(base, L.out);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const font = pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), 'fonts', 'bangers-latin.woff2')).href;
  const rows = L.rows.map((r) => {
    const tw = r.thumb || L.thumb || 300;
    const cells = r.cells.map((c) => {
      const src = pathToFileURL(path.resolve(base, c.png)).href;
      const [cx, cy, cw, ch] = c.crop || [0, 0, CARD_W, CARD_H];
      const k = tw / cw;
      const img = `<div class="crop${c.crop ? ' cut' : ''}" style="width:${tw}px;height:${(ch * k).toFixed(1)}px">`
        + `<img src="${src}" style="width:${(CARD_W * k).toFixed(1)}px;left:${(-cx * k).toFixed(1)}px;top:${(-cy * k).toFixed(1)}px"></div>`;
      return `<figure style="width:${tw}px">${img}<figcaption><b>${esc(c.caption || '')}</b>${c.sub ? `<span>${esc(c.sub)}</span>` : ''}</figcaption></figure>`;
    }).join('');
    return `${r.label ? `<h2>${esc(r.label)}</h2>` : ''}<div class="g">${cells}</div>`;
  }).join('');
  const html = `<!doctype html><html><head><style>
    @font-face{font-family:SheetBangers;src:url("${font}") format("woff2")}
    html,body{margin:0;background:#0d0a17;color:#ede7ff;font:600 14px/1.25 "DejaVu Sans",Arial,sans-serif}
    body{padding:26px 28px 30px;width:max-content}
    h1{margin:0 0 4px;font:400 34px/1 SheetBangers,sans-serif;letter-spacing:.06em;color:#fff}
    p{margin:0 0 20px;color:#8c84b5;font-weight:400}
    h2{margin:22px 0 10px;font:400 22px/1 SheetBangers,sans-serif;letter-spacing:.08em;color:#ffb300}
    .g{display:flex;gap:20px;margin-bottom:6px}
    figure{margin:0}
    .crop{position:relative;overflow:hidden}
    .crop.cut{border-radius:10px;outline:2px solid #2a2148}
    .crop img{position:absolute;display:block;height:auto}
    figcaption{padding:8px 2px 10px;text-align:center}
    figcaption b{display:block;font:400 19px/1.1 SheetBangers,sans-serif;letter-spacing:.06em;color:#fff}
    figcaption span{display:block;margin-top:3px;color:#a59dcc;font-weight:400;font-size:13px}
  </style></head><body>${L.title ? `<h1>${esc(L.title)}</h1>` : ''}${L.subtitle ? `<p>${esc(L.subtitle)}</p>` : ''}${rows}</body></html>`;
  const tmp = path.join(base, `.layout-${process.pid}.html`);
  fs.writeFileSync(tmp, html);
  const page = await browser.newPage({ viewport: { width: 1200, height: 600 }, deviceScaleFactor: L.scale || 2 });
  try {
    await page.goto(pathToFileURL(tmp).href);
    await page.evaluate(async () => { await document.fonts.load('20px SheetBangers'); await document.fonts.ready; });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    const box = await page.evaluate(() => { const r = document.body.getBoundingClientRect(); return { w: Math.ceil(r.width), h: Math.ceil(r.height) }; });
    await page.setViewportSize({ width: box.w, height: box.h });
    await page.screenshot({ path: outFile, fullPage: true });
    console.log(outFile);
  } finally {
    fs.unlinkSync(tmp);
    await page.close();
  }
}

const o = parse(process.argv.slice(2));
if (o.layout) {
  const b = await chromium.launch();
  try { await renderLayout(b, o.layout); } finally { await b.close(); }
  process.exit(0);
}
if (o.dir) o.files.push(...fs.readdirSync(o.dir).filter((f) => f.endsWith('.svg')).sort().map((f) => path.join(o.dir, f)));
if (!o.files.length || (!o.sheet && !o.out)) {
  console.error('usage: render.mjs --out DIR [--dir SVGDIR] a.svg ...\n       render.mjs --sheet OUT.png [--cols N] [--title T] [--thumb PX] a.png ...');
  process.exit(2);
}
const browser = await chromium.launch();
try {
  if (o.sheet) await renderSheet(browser, o.files, o.sheet, o.cols, o.title, o.thumb);
  else await renderCards(browser, o.files, o.out);
} finally {
  await browser.close();
}

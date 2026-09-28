// Renders the share images (public/og/*.jpg, 1200x630) shown when a page is posted
// in a chat app or social feed. Needs Playwright with Chromium:
//   node scripts/build-pages.mjs && node scripts/build-og.mjs
// The images use the site's fonts when the machine can reach Google Fonts.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = new URL('..', import.meta.url).pathname;
const DECKS = JSON.parse(readFileSync(ROOT + 'scripts/og-decks.json', 'utf8'));
const TOTAL = DECKS.reduce((n, d) => n + d.count, 0);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LOGO = readFileSync(ROOT + 'public/icon.svg', 'utf8');

const css = `
  * { box-sizing:border-box; margin:0; }
  body { width:1200px; height:630px; overflow:hidden; background:#1d1420 radial-gradient(90% 90% at 30% 0%, #43263f 0%, transparent 70%);
    color:#f4e9ef; font-family:Inter, system-ui, sans-serif; display:flex; align-items:center; padding:0 80px; gap:60px; }
  .l { flex:1; display:flex; flex-direction:column; gap:26px; }
  .brand { display:flex; align-items:center; gap:16px; font:600 34px Fraunces, Georgia, serif; }
  .brand svg { width:60px; height:60px; }
  h1 { font:600 64px/1.08 Fraunces, Georgia, serif; letter-spacing:-.01em; }
  p { font-size:28px; color:#b9a4b9; line-height:1.35; }
  .cards { position:relative; width:360px; height:470px; flex:none; }
  .b, .f { position:absolute; inset:0; border-radius:30px; }
  .b { background:linear-gradient(150deg, var(--c1), var(--c2)); transform:rotate(-9deg) translate(-26px, 8px); opacity:.85; }
  .f { background:#fbf3ea; color:#2b1d2e; transform:rotate(4deg); padding:40px 36px; display:flex; flex-direction:column; gap:18px; box-shadow:0 40px 80px -30px #000; }
  .f small { font:600 16px Inter, sans-serif; letter-spacing:.14em; text-transform:uppercase; color:var(--c2); }
  .f q { font:500 31px/1.28 Fraunces, Georgia, serif; quotes:none; }
  .art { width:110px; height:110px; }
  .art svg { width:100%; height:100%; fill:none; stroke:var(--c2); stroke-width:3; stroke-linecap:round; stroke-linejoin:round; overflow:visible; }
  .art .fill { fill:var(--c2); stroke:none; } .art .tint { fill:var(--c1); stroke:none; opacity:.28; } .art .soft { opacity:.45; }
  .art .gold { stroke:#c8912a; } .art .card { stroke:#fffaf4; }`;

const html = ({ title, sub, deck }) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>${css}</style></head><body style="--c1:${deck.colors[0]};--c2:${deck.colors[1]}">
<div class="l"><div class="brand">${LOGO}<span>Duet Deck</span></div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>
<div class="cards"><div class="b"></div><div class="f"><div class="art"><svg viewBox="${deck.art[0]}">${deck.art[1]}</svg></div><small>${esc(deck.name)}</small><q>${esc(deck.sample)}</q></div></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
// Behind a proxy the browser may not reach Google Fonts; FONTS_VIA_CURL=1 fetches them with curl.
if (process.env.FONTS_VIA_CURL) {
  const { execFileSync } = await import('node:child_process');
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: execFileSync('curl', ['-s', '-A', ua, r.request().url()]),
    headers: { 'content-type': r.request().url().includes('googleapis') ? 'text/css' : 'font/woff2', 'access-control-allow-origin': '*' } }));
}
const shoot = async (file, opts) => {
  await page.setContent(html(opts), { waitUntil: 'networkidle' }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${ROOT}public/og/${file}.jpg`, type: 'jpeg', quality: 86 });
};
const midnight = DECKS.find(d => d.slug === 'midnight-questions');
await shoot('duet-deck', { title: 'Deep questions for two', sub: `${TOTAL.toLocaleString('en-US')} question cards for couples. Same card, same moment, wherever you are.`, deck: midnight });
for (const d of DECKS) await shoot(d.slug, { title: d.name, sub: `${d.count} ${d.count === 1 ? 'card' : 'cards'} for couples. Play together, free, in Duet Deck.`, deck: d });
await browser.close();
console.log(`Rendered ${DECKS.length + 1} share images.`);

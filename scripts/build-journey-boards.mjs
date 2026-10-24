// Lays out the screenshots from capture-journeys.mjs as Figma-style journey boards (PNG).
// Usage: node scripts/build-journey-boards.mjs

import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const SCREENS = resolve('docs/journeys/screens');
const OUT = resolve('docs/journeys');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const boards = [
  {
    file: 'journey-1-new-subscriber',
    title: 'New subscriber',
    persona: 'Alex, a policy analyst, has never received an OECD newsletter.',
    goal: 'Sign up to several newsletters and a blog in one go.',
    steps: [
      ['a1-catalogue', 'Browse everything in one place', 'Newsletters and blog alerts, grouped by theme, with filters and search.', 'Picks 3 cards'],
      ['a2-select', 'Pick several, enter email once', 'Selections collect in a tray. One email field for all of them.', 'Subscribe'],
      ['a3-check-inbox', 'Asked to confirm', 'Same message for everyone, so the form never reveals who is already subscribed.', 'Opens email'],
      ['a4-confirm-email', 'Confirmation email', 'Lists exactly what they asked for. Link valid for 7 days.', 'Clicks link'],
      ['a5-confirm-page', 'One click to confirm', 'A button, not an automatic confirm, so corporate link scanners can’t subscribe people.', 'Confirm'],
      ['a6-confirmed', 'Done, and signed in', 'Subscriptions active and sent to Adestra. Alex can now manage them without logging in.', null],
    ],
  },
  {
    file: 'journey-2-returning-subscriber',
    title: 'Returning subscriber',
    persona: 'A few weeks later, Alex wants to add a blog alert.',
    goal: 'See and change subscriptions without a password.',
    steps: [
      ['b1-manage', 'Asks to manage subscriptions', 'Just an email address. No account, no password.', 'Send link'],
      ['b2-signin-email', 'Sign-in link by email', 'Proves they own the address. Valid for 1 hour.', 'Clicks link'],
      ['b3-continue', 'Continue', 'One click and they’re in.', 'Continue'],
      ['b4-my-subscriptions', 'Sees what they receive', '“My subscriptions” shows everything in one view.', 'Browses all'],
      ['b5-instant-add', 'Changes apply instantly', 'Known and signed in, so no extra confirmation. Undo is one click away.', null],
    ],
  },
  {
    file: 'journey-3-section-widget',
    title: 'Signing up from a topic page',
    persona: 'Sam is reading the Tax page on oecd.org.',
    goal: 'Get the Tax newsletter without leaving the page.',
    steps: [
      ['c1-section-page', 'Signup box on the topic page', 'A widget any AEM page can embed with two lines of HTML.', 'Enters email'],
      ['c2-widget-done', 'Asked to confirm', 'Same double opt-in as the main page.', 'Opens email'],
      ['c3-confirm-email', 'Same confirmation email', 'From here it’s identical to journey 1, and the source page is recorded.', null],
    ],
  },
  {
    file: 'journey-4-unsubscribe',
    title: 'Unsubscribing',
    persona: 'Alex no longer wants one of the emails they get.',
    goal: 'Stop it quickly, without affecting the others.',
    steps: [
      ['d1-newsletter-footer', 'Footer of every newsletter', 'Adestra sends it; the links point to the preference centre.', 'Unsubscribe'],
      ['d2-unsubscribe', 'Confirm the unsubscribe', 'Just that one email. Mail apps’ own one-click unsubscribe also works.', 'Confirms'],
      ['d3-unsubscribed', 'Done', 'Saved, logged, and sent to Adestra.', null],
    ],
  },
];

const css = `
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Noto Sans', system-ui, sans-serif; color: #586179; }
.board { width: 1680px; padding: 56px 72px 72px; position: relative;
  background: #f5f5f5 radial-gradient(circle, #d4d4d4 1.1px, transparent 1.3px) 0 0 / 24px 24px; }
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 40px; margin-bottom: 48px; }
.kicker { font-size: 15px; font-weight: 700; color: #156df9; text-transform: uppercase; letter-spacing: .06em; }
h1 { font: 900 44px/1.1 'Noto Sans Display', sans-serif; color: #101d40; margin: 6px 0 0; letter-spacing: -.01em; }
.persona { background: #fff; border: 1px solid #e3e3e3; border-radius: 12px; padding: 16px 20px; max-width: 560px; font-size: 17px; line-height: 1.45; }
.persona b { color: #101d40; }
.grid { display: grid; grid-template-columns: repeat(3, 400px); column-gap: 168px; row-gap: 110px; }
.step { position: relative; }
.frame-name { font-size: 13px; color: #8c8c8c; margin-bottom: 8px; font-family: ui-monospace, Menlo, monospace; }
.frame { background: #fff; border-radius: 6px; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 6px 20px rgba(16,29,64,.12); overflow: hidden; }
.frame img { display: block; width: 100%; }
.cap { margin-top: 16px; display: flex; gap: 12px; }
.num { flex: none; width: 30px; height: 30px; border-radius: 50%; background: #101d40; color: #fff; font: 800 15px/30px 'Noto Sans', sans-serif; text-align: center; }
.cap h3 { margin: 2px 0 4px; font: 800 20px/1.25 'Noto Sans Display', sans-serif; color: #101d40; }
.cap p { margin: 0; font-size: 16px; line-height: 1.45; }
svg.wires { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.label { position: absolute; transform: translate(-50%, -50%); background: #0d99ff; color: #fff; font: 700 13px/1 'Noto Sans', sans-serif; padding: 6px 10px; border-radius: 999px; white-space: nowrap; }
`;

function boardHtml(b) {
  const steps = b.steps
    .map(
      ([img, title, cap], i) => `<div class="step" id="s${i}">
        <div class="frame-name">${String(i + 1).padStart(2, '0')} · ${img.replace(/^[a-z]\d-/, '')}</div>
        <div class="frame"><img src="file://${SCREENS}/${img}.png"></div>
        <div class="cap"><div class="num">${i + 1}</div><div><h3>${title}</h3><p>${cap}</p></div></div>
      </div>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Display:wght@800;900&family=Noto+Sans:wght@400;700;800&display=swap" rel="stylesheet">
  <style>${css}</style></head><body>
  <div class="board" id="board">
    <div class="head">
      <div><div class="kicker">User journey</div><h1>${b.title}</h1></div>
      <div class="persona"><b>Who:</b> ${b.persona}<br><b>Goal:</b> ${b.goal}</div>
    </div>
    <div class="grid">${steps}</div>
  </div>
  <script>window.LABELS = ${JSON.stringify(b.steps.map((s) => s[3]))};</script>
  </body></html>`;
}

// Draws Figma-style prototype connectors between consecutive frames.
function drawWires() {
  const board = document.getElementById('board');
  const o = board.getBoundingClientRect();
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'wires');
  svg.setAttribute('width', o.width);
  svg.setAttribute('height', o.height);
  svg.innerHTML = `<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0 0L10 5L0 10z" fill="#0d99ff"/></marker></defs>`;
  board.appendChild(svg);
  const frames = [...document.querySelectorAll('.frame')].map((f) => {
    const r = f.getBoundingClientRect();
    return { l: r.left - o.left, r: r.right - o.left, t: r.top - o.top, b: r.bottom - o.top, cx: (r.left + r.right) / 2 - o.left };
  });
  const caps = [...document.querySelectorAll('.step')].map((s) => s.getBoundingClientRect().bottom - o.top);
  const addLabel = (text, x, y) => {
    if (!text) return;
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    board.appendChild(el);
  };
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1];
    let d, lx, ly;
    if (Math.abs(a.t - b.t) < 5) {
      const y = a.t + Math.min(a.b - a.t, b.b - b.t) / 2;
      d = `M${a.r + 6} ${y} H${b.l - 8}`;
      lx = (a.r + b.l) / 2; ly = y;
    } else {
      // Wrap to the next row: down from the caption, across, and down into the next frame.
      const y0 = caps[i] + 8, mid = (caps[i] + b.t) / 2 - 10;
      d = `M${a.cx} ${y0} V${mid} H${b.cx} V${b.t - 30}`;
      lx = (a.cx + b.cx) / 2; ly = mid;
    }
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#0d99ff');
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('marker-end', 'url(#ah)');
    svg.appendChild(path);
    const dot = document.createElementNS(NS, 'circle');
    const [, sx, sy] = d.match(/^M([\d.]+) ([\d.]+)/);
    dot.setAttribute('cx', sx); dot.setAttribute('cy', sy); dot.setAttribute('r', 5); dot.setAttribute('fill', '#0d99ff');
    svg.appendChild(dot);
    addLabel(window.LABELS[i], lx, ly);
  }
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 1.5 });
const tmp = resolve(OUT, '.board.html');

for (const b of boards) {
  const missing = b.steps.map((s) => s[0]).filter((s) => !existsSync(`${SCREENS}/${s}.png`));
  if (missing.length) throw new Error(`Missing screenshots: ${missing.join(', ')}. Run capture-journeys.mjs first.`);
  writeFileSync(tmp, boardHtml(b));
  await page.goto(`file://${tmp}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(drawWires);
  const el = await page.$('#board');
  await el.screenshot({ path: `${OUT}/${b.file}.png` });
  console.log('  ✓', b.file);
}
rmSync(tmp);
await browser.close();

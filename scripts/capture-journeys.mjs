// Walks through the user journeys against a running local dev server and saves a screenshot of each step.
// Usage: npm run dev (in another terminal), then: node scripts/capture-journeys.mjs
// Then: node scripts/build-journey-boards.mjs

import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const OUT = 'docs/journeys/screens';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 2 };

mkdirSync(OUT, { recursive: true });

// Start from an empty local database so every run produces the same screens.
execSync(
  `npx wrangler d1 execute prefs --local --command "DELETE FROM subscriptions; DELETE FROM contacts; DELETE FROM consent_events; DELETE FROM outbox; DELETE FROM dev_mail;"`,
  { stdio: 'ignore' },
);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: VIEWPORT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(VIEWPORT);
  // The prototype tools bar isn't part of the product.
  await page.evaluateOnNewDocument(() =>
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = '.proto-tools, .mailbox-link { display: none !important; }';
      document.head.append(s);
    }),
  );
  return page;
}

async function shot(page, name, opts = {}) {
  await page.mouse.move(1, 1); // no stray hover states
  await sleep(350); // let transitions finish
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
  console.log('  ✓', name);
}

/** Server-rendered pages (confirm, sign in, unsubscribe) are small, so capture them in a smaller window. */
async function shotPanel(page, name) {
  await page.setViewport({ ...VIEWPORT, width: 820, height: 520 });
  await shot(page, name);
  await page.setViewport(VIEWPORT);
}

async function gotoCatalogue(page, path = '/') {
  await page.goto(BASE + path, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.card, .empty');
  await page.evaluate(() => document.fonts.ready);
}

/** Opens the most recent email in the prototype mailbox; returns its first link. */
async function latestMail(page, to) {
  await page.goto(`${BASE}/dev/mailbox?to=${encodeURIComponent(to)}`, { waitUntil: 'networkidle0' });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('.row')]);
  return page.evaluate(() => {
    const html = document.querySelector('iframe').getAttribute('srcdoc');
    return { href: new DOMParser().parseFromString(html, 'text/html').querySelector('a').getAttribute('href') };
  });
}

/** Screenshot of the open email in the mailbox, as the tester sees it. */
async function shotMail(page, name) {
  await page.setViewport({ ...VIEWPORT, width: 1180, height: 760 });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await shot(page, name);
  await page.setViewport(VIEWPORT);
}

/** Renders an email (or any HTML) on its own, as it would look in a mail client. */
async function shotHtml(page, name, html, width = 720) {
  await page.setViewport({ ...VIEWPORT, width, height: 400 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await shot(page, name, { fullPage: true });
  await page.setViewport(VIEWPORT);
}

const scrollToSection = (page, id) =>
  page.evaluate((id) => window.scrollTo(0, document.getElementById(id).getBoundingClientRect().top + scrollY - 150), id);

// ---------------------------------------------------------------- Journey A: new subscriber
console.log('Journey A: new subscriber');
const alex = 'alex.morgan@example.org';
const a = await newPage();
await gotoCatalogue(a);
await shot(a, 'a1-catalogue');

for (const id of ['economy-en', 'tax-en', 'blog-economy-en']) await a.click(`[data-toggle="${id}"]`);
await scrollToSection(a, 'th-economy');
await a.type('#tray-email', alex);
await shot(a, 'a2-select');

await a.keyboard.press('Enter');
await a.waitForSelector('.tray-done');
await shot(a, 'a3-check-inbox');

let mail = await latestMail(a, alex);
await shotMail(a, 'a4-confirm-email');

await a.goto(mail.href, { waitUntil: 'networkidle0' });
await shotPanel(a, 'a5-confirm-page');

await Promise.all([a.waitForNavigation({ waitUntil: 'networkidle0' }), a.click('button[type=submit]')]);
await a.waitForSelector('.card');
await scrollToSection(a, 'th-economy');
await a.evaluate(() => window.scrollTo(0, 0));
await shot(a, 'a6-confirmed');

// ---------------------------------------------------------------- Journey B: returning subscriber
console.log('Journey B: returning subscriber');
const b = await newPage();
await gotoCatalogue(b);
await b.click('#account [data-open-signin]');
await b.type('#signin-form input[type=email]', alex);
await shot(b, 'b1-manage');

await b.click('#signin-form button[type=submit]');
await b.waitForSelector('.toast.show');
mail = await latestMail(b, alex);
await shotMail(b, 'b2-signin-email');

await b.goto(mail.href, { waitUntil: 'networkidle0' });
await shotPanel(b, 'b3-continue');

await Promise.all([b.waitForNavigation({ waitUntil: 'networkidle0' }), b.click('button[type=submit]')]);
await b.waitForSelector('.card');
await shot(b, 'b4-my-subscriptions');

await b.click('[data-type="all"]');
await scrollToSection(b, 'th-society');
await b.click('[data-toggle="blog-education-en"]');
await b.waitForSelector('.toast.show');
await shot(b, 'b5-instant-add');

// ---------------------------------------------------------------- Journey C: signup widget on a section page
console.log('Journey C: section page widget');
const c = await newPage();
await c.goto(`${BASE}/demo/tax.html`, { waitUntil: 'networkidle0' });
await c.waitForSelector('pierce/input[type=email]');
await shot(c, 'c1-section-page');

await c.type('pierce/input[type=email]', 'sam.okafor@example.org');
await c.keyboard.press('Enter');
await c.waitForFunction(() => document.querySelector('oecd-newsletter-signup').shadowRoot.querySelector('.slot strong'));
const widget = await c.$('oecd-newsletter-signup');
await shot(c, 'c2-widget-done', { clip: await widget.boundingBox().then((bb) => ({ x: bb.x - 24, y: bb.y - 24, width: bb.width + 48, height: bb.height + 48 })) });

mail = await latestMail(c, 'sam.okafor@example.org');
await shotMail(c, 'c3-confirm-email');

// ---------------------------------------------------------------- Journey D: unsubscribe from a newsletter footer
console.log('Journey D: unsubscribe');
await a.goto(`${BASE}/dev/adestra`, { waitUntil: 'networkidle0' });
const links = await a.evaluate(() => [...document.querySelectorAll('.footer-sample a')].map((l) => l.getAttribute('href')));
const unsubName = await a.evaluate(() => document.querySelectorAll('.footer-sample a')[1].textContent.replace('Unsubscribe from ', ''));
const newsletter = `<!doctype html><html><body style="margin:0;background:#F0F4F8;font-family:'Noto Sans',Arial,sans-serif;color:#586179">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&family=Noto+Sans+Display:wght@900&display=swap" rel="stylesheet">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden">
  <div style="background:#101D40;color:#fff;padding:22px 32px;font:900 22px 'Noto Sans Display',sans-serif">OECD · ${unsubName}</div>
  <div style="padding:28px 32px;line-height:1.55">
    <div style="font:900 24px 'Noto Sans Display',sans-serif;color:#101D40;margin-bottom:8px">Global growth holds up despite successive shocks</div>
    <div style="height:120px;background:#F0F4F8;border-radius:10px;margin:16px 0"></div>
    <p>Placeholder newsletter content, as sent by Adestra…</p>
  </div>
  <div style="border-top:1px solid #DEE3E9;padding:20px 32px;font-size:13px;text-align:center;background:#F6F7F9">
    You receive this because you subscribed to ${unsubName}.<br>
    <a href="${links[0]}" style="color:#156DF9">Manage your subscriptions</a> · <a href="${links[1]}" style="color:#156DF9">Unsubscribe</a>
  </div>
</div></body></html>`;
await shotHtml(a, 'd1-newsletter-footer', newsletter);

const d = await newPage(); // clicked from a mail client: no session in this browser
await d.goto(BASE + links[1], { waitUntil: 'networkidle0' });
await shotPanel(d, 'd2-unsubscribe');
await d.click('button[type=submit]');
await d.waitForSelector('.panel h1');
await shotPanel(d, 'd3-unsubscribed');

// ---------------------------------------------------------------- Behind the scenes
console.log('Behind the scenes');
await a.goto(`${BASE}/dev/adestra`, { waitUntil: 'networkidle0' });
await shot(a, 'e1-adestra-sync');

await browser.close();
console.log(`Saved screenshots to ${OUT}`);

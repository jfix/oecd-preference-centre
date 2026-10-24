// Prototype-only mailbox: a familiar webmail-style view of the emails the preference centre "sent",
// so testers understand they've stepped into their inbox. Deliberately generic, not a copy of any real product.

import { Hono } from 'hono';
import type { Env } from './env';
import { esc } from './html';
import { FROM_ADDRESS, FROM_NAME } from './mail';

interface DevMail {
  id: number;
  to_email: string;
  subject: string;
  html: string;
  created_at: string;
  read_at: string | null;
}

const app = new Hono<{ Bindings: Env }>();

const snippet = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*OECD\s*/, '')
    .trim()
    .slice(0, 140);

// created_at is UTC 'YYYY-MM-DD HH:MM:SS'. Show the time for today's mail, the date otherwise.
const when = (utc: string, full = false) => {
  const d = new Date(utc.replace(' ', 'T') + 'Z');
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
  return full ? `${date}, ${time}` : sameDay ? time : date;
};

const icon = {
  menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>',
  mail: '<svg width="30" height="30" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="3" fill="#156df9"/><path d="m4 7 8 6 8-6" fill="none" stroke="#fff" stroke-width="2"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  inbox: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/></svg>',
  star: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
  send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12 20 4l-4 16-4-7z"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5m6-6-6 6 6 6"/></svg>',
  refresh: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
};

const avatar = (name: string, color = '#101d40') =>
  `<span class="av" style="background:${color}" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase())}</span>`;

function shell(opts: { to: string; unread: number; body: string; title: string; refresh?: boolean }) {
  const toQ = opts.to ? `?to=${encodeURIComponent(opts.to)}` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)} · Prototype mailbox</title>
${opts.refresh ? '<meta http-equiv="refresh" content="10">' : ''}
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body>
<header class="top">
  <span class="ic">${icon.menu}</span>
  <a class="brand" href="/dev/mailbox${toQ}">${icon.mail}<span>Mailbox</span></a>
  <form class="search" action="/dev/mailbox">
    ${icon.search}
    <input name="to" type="search" value="${esc(opts.to)}" placeholder="Show mail for an address, e.g. you@example.org" aria-label="Filter by recipient">
  </form>
  <span class="proto" title="Emails are not really sent. Everyone testing the prototype shares this mailbox.">Prototype · not real email</span>
  ${opts.to ? avatar(opts.to, '#7b4fbf') : ''}
</header>
<div class="layout">
  <nav class="side">
    <a class="nav on" href="/dev/mailbox${toQ}">${icon.inbox}<span>Inbox</span>${opts.unread ? `<b>${opts.unread}</b>` : ''}</a>
    <span class="nav dim">${icon.star}<span>Starred</span></span>
    <span class="nav dim">${icon.send}<span>Sent</span></span>
    <p class="note">This mailbox is part of the prototype. Confirmation and sign-in emails land here instead of being sent.${opts.to ? '' : ' Everyone testing shares it, so filter by your address above.'}</p>
    <a class="back-to" href="/">← Back to the preference centre</a>
  </nav>
  <main class="panel">${opts.body}</main>
</div>
</body></html>`;
}

const filter = (to: string) => (to ? `WHERE to_email = ?1 COLLATE NOCASE` : '');

app.get('/', async (c) => {
  const to = (c.req.query('to') ?? '').trim();
  const stmt = c.env.DB.prepare(`SELECT * FROM dev_mail ${filter(to)} ORDER BY id DESC LIMIT 50`);
  const { results } = await (to ? stmt.bind(to) : stmt).all<DevMail>();
  const unread = results.filter((m) => !m.read_at).length;
  const toQ = to ? `?to=${encodeURIComponent(to)}` : '';

  const rows = results
    .map(
      (m) => `<a class="row ${m.read_at ? '' : 'unread'}" href="/dev/mailbox/${m.id}${toQ}">
        <span class="box" aria-hidden="true"></span>
        <span class="star" aria-hidden="true">${icon.star}</span>
        <span class="from">${esc(FROM_NAME)}</span>
        <span class="subj"><span class="s">${esc(m.subject)}</span><span class="snip"> – ${esc(snippet(m.html))}</span></span>
        ${to ? '' : `<span class="to" title="Recipient">${esc(m.to_email)}</span>`}
        <span class="time">${when(m.created_at)}</span>
      </a>`,
    )
    .join('');

  const body = `<div class="bar">
      <span class="box" aria-hidden="true"></span>
      <a class="ic" href="/dev/mailbox${toQ}" title="Refresh">${icon.refresh}</a>
      <span class="count">${results.length ? `1–${results.length} of ${results.length}` : ''}</span>
    </div>
    ${
      rows ||
      `<div class="empty"><p><b>No mail yet${to ? ` for ${esc(to)}` : ''}.</b></p><p>Sign up on the preference centre and your confirmation email will appear here. This page refreshes every 10 seconds.</p></div>`
    }`;
  return c.html(shell({ to, unread, body, title: 'Inbox', refresh: true }));
});

app.get('/:id{[0-9]+}', async (c) => {
  const to = (c.req.query('to') ?? '').trim();
  const m = await c.env.DB.prepare(`SELECT * FROM dev_mail WHERE id = ?1`).bind(Number(c.req.param('id'))).first<DevMail>();
  if (!m) return c.notFound();
  await c.env.DB.prepare(`UPDATE dev_mail SET read_at = datetime('now') WHERE id = ?1 AND read_at IS NULL`).bind(m.id).run();
  const unreadStmt = c.env.DB.prepare(`SELECT COUNT(*) AS n FROM dev_mail ${to ? 'WHERE to_email = ?1 COLLATE NOCASE AND' : 'WHERE'} read_at IS NULL`);
  const unread = (await (to ? unreadStmt.bind(to) : unreadStmt).first<{ n: number }>())!.n;
  const toQ = to ? `?to=${encodeURIComponent(to)}` : '';

  // No scripts run inside the email; allow-same-origin only lets this page size the frame to its content.
  const body = `<div class="bar">
      <a class="ic" href="/dev/mailbox${toQ}" title="Back to Inbox">${icon.back}</a>
    </div>
    <article class="msg">
      <h1>${esc(m.subject)} <span class="tag">Inbox</span></h1>
      <div class="sender">
        ${avatar(FROM_NAME)}
        <div class="who"><b>${esc(FROM_NAME)}</b> <span>&lt;${esc(FROM_ADDRESS)}&gt;</span><div class="tome">to ${esc(m.to_email)}</div></div>
        <span class="time">${when(m.created_at, true)}</span>
      </div>
      <iframe id="mail" title="Email content" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
        srcdoc="${esc(m.html.replace(/<a /g, '<a target="_top" '))}"></iframe>
    </article>
    <script>
      const f = document.getElementById('mail');
      f.addEventListener('load', () => { f.style.height = f.contentDocument.documentElement.scrollHeight + 'px'; });
    </script>`;
  return c.html(shell({ to, unread, body, title: m.subject }));
});

const css = `
* { box-sizing: border-box; }
body { margin: 0; background: #f6f8fc; color: #1f1f1f; font: 14px/1.4 Roboto, 'Segoe UI', Arial, sans-serif; }
a { color: inherit; text-decoration: none; }
.top { display: flex; align-items: center; gap: 12px; height: 64px; padding: 8px 16px; }
.ic { display: inline-flex; padding: 10px; border-radius: 50%; color: #444746; cursor: pointer; }
.ic:hover { background: rgba(68,71,70,.08); }
.brand { display: flex; align-items: center; gap: 8px; font-size: 22px; color: #444746; width: 190px; flex: none; }
.search { flex: 1; max-width: 720px; display: flex; align-items: center; gap: 12px; background: #e9eef6; border-radius: 28px; padding: 0 18px; height: 48px; color: #444746; }
.search:focus-within { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
.search input { flex: 1; border: 0; background: transparent; font: inherit; font-size: 16px; outline: none; min-width: 0; }
.proto { margin-left: auto; font-size: 12px; font-weight: 500; color: #6b5a10; background: #fff7d6; border: 1px solid #e8d48a; border-radius: 999px; padding: 6px 12px; white-space: nowrap; }
.av { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 36px; height: 36px; border-radius: 50%; color: #fff; font-weight: 500; font-size: 16px; }
.layout { display: flex; gap: 8px; padding: 0 16px 16px 0; min-height: calc(100vh - 64px); }
.side { width: 256px; flex: none; padding: 8px 0; }
.nav { display: flex; align-items: center; gap: 18px; height: 32px; padding: 0 12px 0 26px; border-radius: 0 16px 16px 0; color: #1f1f1f; margin-right: 8px; }
.nav.on { background: #d3e3fd; font-weight: 700; color: #001d35; }
.nav b { margin-left: auto; font-size: 12px; }
.nav.dim { color: #747775; }
.note { margin: 24px 16px 0 26px; font-size: 12px; color: #5f6368; line-height: 1.5; }
.back-to { display: block; margin: 12px 16px 0 26px; font-size: 13px; color: #0b57d0; }
.panel { flex: 1; min-width: 0; background: #fff; border-radius: 16px; overflow: hidden; }
.bar { display: flex; align-items: center; gap: 4px; height: 48px; padding: 0 12px; }
.bar .count { margin-left: auto; font-size: 12px; color: #5f6368; padding-right: 8px; }
.box { width: 18px; height: 18px; border: 2px solid #757575; border-radius: 2px; flex: none; margin: 0 8px; }
.row { display: flex; align-items: center; gap: 4px; height: 40px; padding: 0 16px 0 8px; border-bottom: 1px solid #f1f3f4; background: #f2f6fc; cursor: pointer; }
.row.unread { background: #fff; }
.row:hover { box-shadow: inset 1px 0 0 #dadce0, inset -1px 0 0 #dadce0, 0 1px 2px rgba(60,64,67,.3); position: relative; z-index: 1; }
.row .star { color: #9aa0a6; display: inline-flex; margin-right: 8px; }
.row .from { width: 168px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .subj { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .snip { color: #5f6368; }
.row .to { font-size: 12px; color: #444746; background: #eef1f6; border-radius: 4px; padding: 2px 8px; margin-left: 12px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .time { width: 72px; text-align: right; font-size: 12px; flex: none; }
.row.unread .from, .row.unread .s, .row.unread .time { font-weight: 700; color: #1f1f1f; }
.empty { padding: 48px 24px; text-align: center; color: #5f6368; }
.msg { padding: 8px 24px 32px 72px; }
.msg h1 { font-size: 22px; font-weight: 400; margin: 4px 0 20px; color: #1f1f1f; }
.msg .tag { font-size: 12px; background: #ddd; border-radius: 4px; padding: 2px 6px; vertical-align: middle; color: #444; }
.sender { display: flex; align-items: flex-start; gap: 12px; margin: 0 0 20px -56px; }
.sender .av { width: 40px; height: 40px; }
.who { flex: 1; }
.who span { color: #5f6368; font-size: 12px; }
.tome { color: #5f6368; font-size: 12px; margin-top: 2px; }
.sender .time { font-size: 12px; color: #5f6368; }
#mail { width: 100%; border: 0; min-height: 300px; display: block; }
@media (max-width: 1100px) {
  .side { width: 72px; }
  .nav { padding: 0 0 0 26px; gap: 0; }
  .nav span, .nav b, .note, .back-to { display: none; }
  .brand { width: auto; }
  .row .from { width: 110px; }
}
@media (max-width: 760px) {
  .side, .proto, .brand span { display: none; }
  .brand { width: auto; }
  .layout { padding: 0 8px 8px; }
  .row .from { width: 90px; }
  .row .to { display: none; }
  .msg { padding: 8px 16px 24px; }
  .sender { margin-left: 0; }
}
`;

export default app;

import { Hono, type Context } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { cors } from 'hono/cors';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { catalogue, DEFAULT_LANG, editionsById, isEdition, locales, resolveLang, t } from './config';
import devmail from './devmail';
import type { Env } from './env';
import { actionPage, esc, messagePage, page } from './html';
import { confirmEmail, mailer, signinEmail } from './mail';
import { activeEditions, logConsent, processOutbox, setSubscriptions, type RequestMeta } from './store';
import { hours, sign, verify } from './tokens';

type C = Context<{ Bindings: Env }>;
const app = new Hono<{ Bindings: Env }>();

const SESSION_COOKIE = 'pc_session';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const validEditions = (ids: unknown) => (Array.isArray(ids) ? [...new Set(ids.filter((i) => typeof i === 'string' && isEdition(i)))] : []);
const meta = (c: C, source?: string | null): RequestMeta => ({
  ip: c.req.header('cf-connecting-ip'),
  userAgent: c.req.header('user-agent'),
  source: source ?? null,
});
const editionNames = (ids: string[]) => ids.map((id) => editionsById.get(id)!.name);

async function sessionEmail(c: C) {
  const s = await verify(getCookie(c, SESSION_COOKIE), 'session', c.env.SIGNING_SECRET);
  return s?.e ?? null;
}

async function startSession(c: C, email: string) {
  setCookie(c, SESSION_COOKIE, await sign({ t: 'session', e: email, exp: hours(24 * 30) }, c.env.SIGNING_SECRET), {
    httpOnly: true,
    secure: c.env.PUBLIC_BASE_URL.startsWith('https'),
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Push changes to Adestra after the response is sent; the cron trigger retries anything left over. */
const syncSoon = (c: C) => c.executionCtx.waitUntil(processOutbox(c.env));

// ---------------------------------------------------------------- API

app.use('/api/subscribe', (c, next) =>
  cors({ origin: c.env.WIDGET_ORIGINS.split(',').map((o) => o.trim()), allowMethods: ['POST'], allowHeaders: ['Content-Type'] })(c, next),
);

// Everything the page and the widget need: the catalogue plus all interface text.
app.get('/api/catalogue', (c) => c.json({ ...catalogue, i18n: locales, uiLanguages: Object.keys(locales) }));

app.get('/api/me', async (c) => {
  const email = await sessionEmail(c);
  return c.json(email ? { email, editions: await activeEditions(c.env, email) } : { email: null, editions: [] });
});

// Anonymous (or widget) signup. Signed-in people subscribing their own address skip confirmation;
// everyone else gets a confirmation email. The response never reveals whether an address is known.
app.post('/api/subscribe', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const email = normEmail(body.email);
  const editions = validEditions(body.editions);
  const lang = resolveLang(body.lang);
  if (!EMAIL_RE.test(email) || editions.length === 0) return c.json({ error: 'invalid_request' }, 400);

  if ((await sessionEmail(c)) === email) {
    await setSubscriptions(c.env, email, editions, 'active', meta(c, body.source));
    syncSoon(c);
    return c.json({ status: 'subscribed' });
  }

  const token = await sign({ t: 'confirm', e: email, ed: editions, src: body.source, exp: hours(24 * 7) }, c.env.SIGNING_SECRET);
  const mail = confirmEmail(lang, `${c.env.PUBLIC_BASE_URL}/confirm?token=${token}&lang=${lang}`, editions);
  await Promise.all([
    mailer(c.env).send(email, mail.subject, mail.html),
    logConsent(c.env, email, 'requested', editions, meta(c, body.source)),
  ]);
  return c.json({ status: 'check_inbox' });
});

app.post('/api/me/subscriptions', async (c) => {
  const email = await sessionEmail(c);
  if (!email) return c.json({ error: 'not_signed_in' }, 401);
  const body = await c.req.json<any>().catch(() => ({}));
  const m = meta(c, 'preference-centre');
  await setSubscriptions(c.env, email, validEditions(body.add), 'active', m);
  await setSubscriptions(c.env, email, validEditions(body.remove), 'unsubscribed', m);
  syncSoon(c);
  return c.json({ email, editions: await activeEditions(c.env, email) });
});

app.post('/api/signin', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const email = normEmail(body.email);
  const lang = resolveLang(body.lang);
  if (!EMAIL_RE.test(email)) return c.json({ error: 'invalid_request' }, 400);
  const token = await sign({ t: 'signin', e: email, exp: hours(1) }, c.env.SIGNING_SECRET);
  const mail = signinEmail(lang, `${c.env.PUBLIC_BASE_URL}/signin?token=${token}&lang=${lang}`);
  await Promise.all([mailer(c.env).send(email, mail.subject, mail.html), logConsent(c.env, email, 'signin_requested', [], meta(c))]);
  return c.json({ status: 'check_inbox' });
});

app.post('/api/signout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- Email link landing pages
// GET shows a button; POST does the work, so link scanners can't confirm or unsubscribe on someone's behalf.

app.get('/confirm', async (c) => {
  const lang = resolveLang(c.req.query('lang'));
  const tok = await verify(c.req.query('token'), 'confirm', c.env.SIGNING_SECRET);
  if (!tok) return c.html(expired(lang), 400);
  return c.html(
    actionPage({
      lang,
      title: t(lang, 'pages.confirmTitle'),
      intro: t(lang, 'pages.confirmIntro', { email: tok.e }),
      items: editionNames(tok.ed),
      button: t(lang, 'pages.confirmButton'),
    }),
  );
});

app.post('/confirm', async (c) => {
  const lang = resolveLang(c.req.query('lang'));
  const tok = await verify(c.req.query('token'), 'confirm', c.env.SIGNING_SECRET);
  if (!tok) return c.html(expired(lang), 400);
  await logConsent(c.env, tok.e, 'confirmed', tok.ed, meta(c, tok.src));
  await setSubscriptions(c.env, tok.e, tok.ed, 'active', meta(c, tok.src));
  syncSoon(c);
  // Clicking the emailed link proves they own the address, so sign them in.
  await startSession(c, tok.e);
  return c.redirect(`/?confirmed=${tok.ed.length}${langParam(lang)}`, 303);
});

app.get('/signin', async (c) => {
  const lang = resolveLang(c.req.query('lang'));
  const token = c.req.query('token');
  const tok = (await verify(token, 'signin', c.env.SIGNING_SECRET)) ?? (await verify(token, 'manage', c.env.SIGNING_SECRET));
  if (!tok) return c.html(expired(lang), 400);
  return c.html(
    actionPage({
      lang,
      title: t(lang, 'pages.signinTitle'),
      intro: t(lang, 'pages.signinIntro', { email: tok.e }),
      button: t(lang, 'pages.signinButton'),
    }),
  );
});

app.post('/signin', async (c) => {
  const lang = resolveLang(c.req.query('lang'));
  const token = c.req.query('token');
  const tok = (await verify(token, 'signin', c.env.SIGNING_SECRET)) ?? (await verify(token, 'manage', c.env.SIGNING_SECRET));
  if (!tok) return c.html(expired(lang), 400);
  await logConsent(c.env, tok.e, 'signed_in', [], meta(c, tok.t));
  await startSession(c, tok.e);
  return c.redirect(`/?view=mine${langParam(lang)}`, 303);
});

app.get('/unsubscribe', async (c) => {
  const lang = resolveLang(c.req.query('lang'));
  const tok = await verify(c.req.query('token'), 'unsub', c.env.SIGNING_SECRET);
  if (!tok) return c.html(expired(lang), 400);
  return c.html(
    actionPage({
      lang,
      title: t(lang, 'pages.unsubTitle'),
      intro: t(lang, 'pages.unsubIntro', { email: tok.e }),
      items: editionNames(tok.ed),
      button: t(lang, 'pages.unsubButton'),
    }),
  );
});

// Also handles RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) from mail clients.
app.post('/unsubscribe', async (c) => {
  const lang = resolveLang(c.req.query('lang'));
  const tok = await verify(c.req.query('token'), 'unsub', c.env.SIGNING_SECRET);
  if (!tok) return c.html(expired(lang), 400);
  await setSubscriptions(c.env, tok.e, tok.ed, 'unsubscribed', meta(c, 'unsubscribe-link'));
  syncSoon(c);
  return c.html(
    messagePage(t(lang, 'pages.unsubDoneTitle'), t(lang, 'pages.unsubDoneBody', { names: editionNames(tok.ed).join(', '), email: tok.e }), lang),
  );
});

const expired = (lang: string) => messagePage(t(lang, 'pages.expiredTitle'), t(lang, 'pages.expiredBody'), lang);
const langParam = (lang: string) => (lang === DEFAULT_LANG ? '' : `&lang=${lang}`);

// ---------------------------------------------------------------- Prototype-only tools

// The mailbox shows everyone's confirmation links, so outside local dev it sits behind a password.
app.use('/dev/*', async (c, next) => {
  if (c.env.DEV_TOOLS !== 'true') return c.notFound();
  if (!c.env.DEV_PASSWORD) return c.env.PUBLIC_BASE_URL.startsWith('http://localhost') ? next() : c.notFound();
  return basicAuth({ username: 'oecd', password: c.env.DEV_PASSWORD })(c, next);
});

app.route('/dev/mailbox', devmail);

app.get('/dev/adestra', async (c) => {
  const [outbox, consent] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM outbox ORDER BY id DESC LIMIT 50`).all<any>(),
    c.env.DB.prepare(`SELECT * FROM consent_events ORDER BY id DESC LIMIT 50`).all<any>(),
  ]);
  const me = await sessionEmail(c);
  let footer = '';
  if (me) {
    const eds = await activeEditions(c.env, me);
    if (eds.length) {
      const unsub = await sign({ t: 'unsub', e: me, ed: [eds[0]] }, c.env.SIGNING_SECRET);
      const manage = await sign({ t: 'manage', e: me }, c.env.SIGNING_SECRET);
      footer = `<h2>Sample newsletter footer for ${esc(me)}</h2>
        <p class="lede">These links would go in the footer of every <em>${esc(editionsById.get(eds[0])!.name)}</em> email Adestra sends.</p>
        <div class="panel footer-sample"><a href="/signin?token=${manage}">Manage your subscriptions</a> · <a href="/unsubscribe?token=${unsub}">Unsubscribe from ${esc(editionsById.get(eds[0])!.name)}</a></div>`;
    }
  }
  const row = (cells: string[]) => `<tr>${cells.map((x) => `<td>${x}</td>`).join('')}</tr>`;
  return c.html(
    page(
      'Adestra sync',
      `<h1>Adestra sync and consent log</h1>
      <p class="lede">The preference centre is the source of truth. Every change is queued here and pushed to Adestra.${c.env.ADESTRA_API_KEY ? '' : ' <strong>Using the fake Adestra adapter</strong>: requests are logged, not sent.'}</p>
      ${footer}
      <h2>Outbox</h2>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Email</th><th>Edition</th><th>Action</th><th>Status</th><th>Request</th></tr></thead><tbody>
      ${outbox.results.map((o) => row([o.id, esc(o.email), esc(o.edition_id), o.action, `<span class="pill pill-${o.status}">${o.status}</span>`, `<pre>${esc(o.request_log ?? o.last_error ?? '')}</pre>`])).join('')}
      </tbody></table></div>
      <h2>Consent log</h2>
      <div class="table-wrap"><table><thead><tr><th>When (UTC)</th><th>Email</th><th>Action</th><th>Editions</th><th>Source</th></tr></thead><tbody>
      ${consent.results.map((e) => row([esc(e.created_at), esc(e.email), e.action, esc(JSON.parse(e.edition_ids).join(', ')), esc(e.source ?? '')])).join('')}
      </tbody></table></div>`,
    ),
  );
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processOutbox(env, 100));
  },
} satisfies ExportedHandler<Env>;

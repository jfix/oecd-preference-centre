// Preference centre front end. No build step: plain ES modules served as static assets.
// All text comes from i18n/<lang>.json and the catalogue from config/catalogue.json, both via /api/catalogue.

const icons = {
  mail: '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  bell: '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
  plus: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/></svg>',
  ok: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f7b4e" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m7 12 3.5 3.5L17 9"/></svg>',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (sel) => document.querySelector(sel);

const params = new URLSearchParams(location.search);
const state = {
  cat: null,
  me: { email: null, editions: new Set() },
  selected: new Set(), // anonymous selection, edition ids
  shown: {}, // topicId -> edition id currently displayed on the card
  type: params.get('view') === 'mine' ? 'mine' : 'all',
  lang: 'all',
  q: '',
  ui: params.get('lang') ?? 'en', // checked against the available languages once the catalogue loads
  banner: params.get('confirmed') ? 'confirmed' : null,
  trayDone: null,
};
history.replaceState(null, '', location.pathname);

/**
 * Looks up text by path (e.g. 'themes.economy'), falling back to English. {placeholders} are filled from `vars`,
 * HTML-escaped; the strings themselves are trusted and may contain markup. Objects with one/other are plurals keyed on vars.n.
 */
function tr(path, vars = {}) {
  const find = (lang) => path.split('.').reduce((node, key) => node?.[key], state.cat.i18n[lang]);
  let msg = find(state.ui) ?? find('en');
  if (msg && typeof msg === 'object') msg = new Intl.PluralRules(state.ui).select(Number(vars.n ?? 0)) === 'one' ? msg.one : msg.other;
  if (typeof msg !== 'string') return path;
  const all = { ...vars };
  if (msg.includes('{privacyUrl}') && !('privacyUrl' in all)) all.privacyUrl = tr('meta.privacyUrl');
  return msg.replace(/\{(\w+)\}/g, (m, k) => (k in all ? esc(all[k]) : m));
}
const t = (key, vars) => tr(`ui.${key}`, vars);
const signedIn = () => !!state.me.email;
// Prototype only: emails aren't really sent, they land in the dev mailbox.
const mailboxLink = (email) =>
  `<a class="mailbox-link" href="/dev/mailbox?to=${encodeURIComponent(email)}" target="_blank">${t('openMailbox')} ↗</a>`;
const isOn = (edId) => (signedIn() ? state.me.editions.has(edId) : state.selected.has(edId));
const edition = (id) => state.cat.topics.flatMap((tp) => tp.editions).find((e) => e.id === id);

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// Which edition a card shows: the language filter, then the UI language, then whatever the person has, then the first.
function shownEdition(topic) {
  const eds = topic.editions;
  if (state.lang !== 'all') return eds.find((e) => e.lang === state.lang) ?? eds[0];
  const picked = state.shown[topic.id] && eds.find((e) => e.id === state.shown[topic.id]);
  return picked ?? eds.find((e) => isOn(e.id)) ?? eds.find((e) => e.lang === state.ui) ?? eds[0];
}

function visibleTopics() {
  const q = state.q.trim().toLowerCase();
  return state.cat.topics.filter((tp) => {
    if (tp.theme === 'featured' && state.type !== 'mine' && !q && state.lang === 'all') return false; // shown as the feature
    if (state.type === 'newsletter' && tp.type !== 'newsletter') return false;
    if (state.type === 'blog' && tp.type !== 'blog') return false;
    if (state.type === 'mine' && !tp.editions.some((e) => isOn(e.id))) return false;
    if (state.lang !== 'all' && !tp.editions.some((e) => e.lang === state.lang)) return false;
    if (q && !tp.editions.some((e) => `${e.name} ${e.description}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

// ---------------------------------------------------------------- Rendering

function toggleButton(ed, label) {
  const on = isOn(ed.id);
  const text = signedIn() ? (on ? t('subscribed') : t('subscribe')) : on ? t('selected') : t('signUp');
  const name = esc(label ?? ed.name);
  return `<button type="button" class="btn ${on ? 'btn-on' : 'btn-outline'}" data-toggle="${ed.id}" data-focus="toggle-${ed.id}"
    aria-pressed="${on}" aria-label="${text}: ${name}">
    ${on ? icons.check : icons.plus}<span class="on-label">${text}</span>${on && signedIn() ? `<span class="on-hover">${t('unsubscribe')}</span>` : ''}
  </button>`;
}

function card(topic) {
  const ed = shownEdition(topic);
  const anyOn = topic.editions.some((e) => isOn(e.id));
  const freq = tr(`frequencies.${topic.frequency}`);
  const langs =
    topic.editions.length > 1
      ? `<div class="editions" role="group" aria-label="${t('language')}">${topic.editions
          .map(
            (e) => `<button type="button" data-show="${topic.id}:${e.id}" data-focus="show-${e.id}" aria-pressed="${e.id === ed.id}"
              class="${isOn(e.id) ? 'has-on' : ''}" title="${esc(state.cat.languages[e.lang])}" lang="${e.lang}">${e.lang}</button>`,
          )
          .join('')}</div>`
      : `<span class="editions"><span class="single">${state.cat.languages[ed.lang]}</span></span>`;
  return `<article class="card ${anyOn ? 'is-on' : ''}" lang="${ed.lang}" ${ed.lang === 'ar' ? 'dir="auto"' : ''}>
    <div class="card-meta">
      <span class="type ${topic.type}">${topic.type === 'blog' ? icons.bell : icons.mail}${t(topic.type)}</span>
      <span class="dot"></span><span>${freq}</span>
    </div>
    <h3>${esc(ed.name)}</h3>
    <p>${esc(ed.description)}</p>
    <div class="card-foot">${langs}${toggleButton(ed)}</div>
  </article>`;
}

function feature() {
  const topic = state.cat.topics.find((tp) => tp.theme === 'featured');
  const rows = topic.editions
    .map(
      (e) => `<div class="feature-edition ${isOn(e.id) ? 'is-on' : ''}" lang="${e.lang}">
        <div><strong>${esc(e.name)}</strong><span>${state.cat.languages[e.lang]} · ${tr(`frequencies.${e.frequency ?? topic.frequency}`)}</span></div>
        ${toggleButton(e)}
      </div>`,
    )
    .join('');
  return `<section class="section" aria-labelledby="feature-title">
    <div class="feature">
      <div class="feature-body">
        <span class="eyebrow">${t('featuredEyebrow')}</span>
        <h2 id="feature-title">${t('featuredTitle')}</h2>
        <p>${t('featuredBody')}</p>
        <div class="feature-editions">${rows}</div>
      </div>
      <div class="feature-art" aria-hidden="true"></div>
    </div>
  </section>`;
}

function renderChips() {
  const count = (type) => state.cat.topics.filter((tp) => type === 'all' || tp.type === type).length;
  const chips = [
    ['all', t('all'), count('all')],
    ['newsletter', t('newsletters'), count('newsletter')],
    ['blog', t('blogs'), count('blog')],
  ];
  if (signedIn()) chips.push(['mine', t('mine'), state.me.editions.size]);
  $('#type-chips').innerHTML = chips
    .map(([id, label, n]) => `<button type="button" class="chip" data-type="${id}" aria-pressed="${state.type === id}">${label} <span class="count">${n}</span></button>`)
    .join('');

  const langs = [...new Set(state.cat.topics.flatMap((tp) => tp.editions.map((e) => e.lang)))];
  $('#lang-filter').innerHTML =
    `<option value="all">${t('allLanguages')}</option>` +
    langs.map((l) => `<option value="${l}" ${state.lang === l ? 'selected' : ''}>${state.cat.languages[l]}</option>`).join('');
  $('#search').placeholder = t('searchPlaceholder');
}

function renderCatalogue() {
  const list = visibleTopics();
  const showFeature = state.type !== 'blog' && state.type !== 'mine' && !state.q.trim() && state.lang === 'all';
  let html = showFeature ? feature() : '';

  if (list.length === 0 && !showFeature) {
    html += `<div class="empty"><h2>${state.type === 'mine' ? t('mine') : t('emptyTitle')}</h2><p>${state.type === 'mine' ? t('emptyMine') : t('emptyBody')}</p></div>`;
  }
  for (const themeId of state.cat.themes) {
    const inTheme = list.filter((tp) => tp.theme === themeId);
    if (!inTheme.length) continue;
    html += `<section class="section" aria-labelledby="th-${themeId}">
      <div class="section-head"><h2 id="th-${themeId}">${tr(`themes.${themeId}`)}</h2><span class="count">${inTheme.length}</span></div>
      <div class="grid">${inTheme.map(card).join('')}</div>
    </section>`;
  }
  if (!signedIn()) {
    html += `<div class="manage-cta"><div><h2>${t('manageCtaTitle')}</h2><p>${t('manageCtaBody')}</p></div>
      <button type="button" class="btn btn-primary" data-open-signin>${t('manage')}</button></div>`;
  }
  $('#catalogue').innerHTML = html;
}

function renderHeader() {
  document.documentElement.lang = state.ui;
  document.title = `${t('title')} | ${tr('meta.orgName')}`;
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  $('#ui-langs').innerHTML = state.cat.uiLanguages
    .map((l) => `<button type="button" data-ui-lang="${l}" lang="${l}" aria-pressed="${l === state.ui}" title="${esc(state.cat.i18n[l].meta.languageName)}">${l.toUpperCase()}</button>`)
    .join('');
  document.body.classList.toggle('signed-in', signedIn());
  $('#account').innerHTML = signedIn()
    ? `<span class="email" title="${esc(state.me.email)}">${esc(state.me.email)}</span><button type="button" class="link-btn" data-signout>${t('signOut')}</button>`
    : `<button type="button" class="link-btn" data-open-signin>${t('manage')}</button>`;

  let banner = '';
  if (state.banner === 'confirmed') banner = `<div class="banner success">${icons.ok}<p>${t('confirmedBanner', { n: params.get('confirmed') })}</p><button class="close" data-close-banner aria-label="${t('close')}">×</button></div>`;
  else if (signedIn()) banner = `<div class="banner">${icons.info}<p>${t('signedInBanner', { email: state.me.email })}</p></div>`;
  $('#banner').innerHTML = banner;
}

function renderTray() {
  const tray = $('#tray');
  const ids = [...state.selected];
  const open = !signedIn() && (ids.length > 0 || state.trayDone);
  tray.classList.toggle('open', open);
  document.body.classList.toggle('tray-open', open);
  if (!open) return;
  if (state.trayDone) {
    $('#tray-content').innerHTML = `<div class="tray-done">${icons.ok}<p>${t('checkInbox', { email: state.trayDone })}<br>${mailboxLink(state.trayDone)}</p>
      <button type="button" class="btn btn-outline" data-tray-ok style="margin-left:auto">${t('ok')}</button></div>`;
    return;
  }
  const emailVal = $('#tray-email')?.value ?? '';
  $('#tray-content').innerHTML = `<div>
      <div class="tray-title">${t('traySelected', { n: ids.length })}</div>
      <div class="tray-chips">${ids
        .map((id) => `<span class="tray-chip">${esc(edition(id).name)}<button type="button" data-toggle="${id}" aria-label="${t('remove')} ${esc(edition(id).name)}">×</button></span>`)
        .join('')}</div>
    </div>
    <div>
      <form id="tray-form">
        <label class="visually-hidden" for="tray-email">${t('email')}</label>
        <input id="tray-email" type="email" required autocomplete="email" placeholder="${t('emailPlaceholder')}" value="${esc(emailVal)}">
        <button class="btn btn-primary" type="submit">${t('subscribe')}</button>
      </form>
      <p class="fine">${t('privacy')}</p>
    </div>`;
}

function render() {
  const focusKey = document.activeElement?.dataset?.focus;
  renderHeader();
  renderChips();
  renderCatalogue();
  renderTray();
  if (focusKey) document.querySelector(`[data-focus="${focusKey}"]`)?.focus();
}

// ---------------------------------------------------------------- Actions

let toastTimer;
function toast(message, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${message}</span>${undo ? `<button type="button">${t('undo')}</button>` : ''}`;
  if (undo) el.querySelector('button').onclick = () => { el.classList.remove('show'); undo(); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

async function setSubscribed(edId, on, { quiet = false } = {}) {
  // Optimistic update; roll back if the server says no.
  on ? state.me.editions.add(edId) : state.me.editions.delete(edId);
  render();
  try {
    const me = await api('/api/me/subscriptions', on ? { add: [edId] } : { remove: [edId] });
    state.me.editions = new Set(me.editions);
    render();
    if (!quiet) toast(t(on ? 'toastOn' : 'toastOff', { name: edition(edId).name }), () => setSubscribed(edId, !on, { quiet: true }));
  } catch {
    on ? state.me.editions.delete(edId) : state.me.editions.add(edId);
    render();
    toast(t('error'));
  }
}

function toggle(edId) {
  if (signedIn()) return setSubscribed(edId, !state.me.editions.has(edId));
  state.trayDone = null;
  state.selected.has(edId) ? state.selected.delete(edId) : state.selected.add(edId);
  render();
}

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('button, a');
  if (!el) return;
  const d = el.dataset;
  if (d.toggle) return toggle(d.toggle);
  if (d.show) {
    const [topicId, edId] = d.show.split(':');
    state.shown[topicId] = edId;
    return render();
  }
  if (d.type) { state.type = d.type; return render(); }
  if (d.uiLang) { state.ui = d.uiLang; return render(); }
  if ('openSignin' in d) return $('#signin-dialog').showModal();
  if ('close' in d) return $('#signin-dialog').close();
  if ('closeBanner' in d) { state.banner = null; return render(); }
  if ('trayOk' in d) { state.trayDone = null; return render(); }
  if ('signout' in d) {
    await api('/api/signout', {});
    state.me = { email: null, editions: new Set() };
    state.type = 'all';
    return render();
  }
});

$('#lang-filter').addEventListener('change', (e) => { state.lang = e.target.value; render(); });
$('#search').addEventListener('input', (e) => { state.q = e.target.value; renderCatalogue(); });

document.addEventListener('submit', async (ev) => {
  if (ev.target.id === 'tray-form') {
    ev.preventDefault();
    const btn = ev.target.querySelector('button');
    const email = $('#tray-email').value.trim();
    btn.disabled = true;
    try {
      await api('/api/subscribe', { email, editions: [...state.selected], lang: state.ui, source: 'preference-centre' });
      state.selected.clear();
      state.trayDone = email;
      render();
    } catch {
      btn.disabled = false;
      toast(t('error'));
    }
  }
  if (ev.target.id === 'signin-form') {
    ev.preventDefault();
    const email = ev.target.email.value.trim();
    try {
      await api('/api/signin', { email, lang: state.ui });
      $('#signin-dialog').close();
      toast(`${t('signinSent', { email })} ${mailboxLink(email)}`);
    } catch {
      toast(t('error'));
    }
  }
});

// ---------------------------------------------------------------- Boot

const [cat, me] = await Promise.all([api('/api/catalogue'), api('/api/me')]);
state.cat = cat;
if (!cat.uiLanguages.includes(state.ui)) state.ui = 'en';
state.me = { email: me.email, editions: new Set(me.editions) };
if (state.type === 'mine' && !signedIn()) state.type = 'all';
render();

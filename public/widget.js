// Embeddable signup widget for section pages (e.g. in an AEM embed component):
//   <script type="module" src="https://<prefs-host>/widget.js"></script>
//   <oecd-newsletter-signup topic="tax" lang="en"></oecd-newsletter-signup>
// It uses the host page's fonts and talks to the preference centre API it was loaded from.

const BASE = new URL('.', import.meta.url).origin;
let cataloguePromise;
const catalogue = () => (cataloguePromise ??= fetch(`${BASE}/api/catalogue`).then((r) => r.json()));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Text from i18n/<lang>.json (served with the catalogue), English fallback, {placeholders} escaped. */
const translator = (cat, lang) => (path, vars = {}) => {
  const find = (l) => path.split('.').reduce((node, key) => node?.[key], cat.i18n[l]);
  const msg = find(lang) ?? find('en') ?? path;
  return msg.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? esc(vars[k]) : m));
};

const css = `
:host { display: block; font-family: inherit; --navy: #101d40; --blue: #156df9; --text: #586179; }
.box { border-radius: 14px; background: var(--navy); color: rgba(255,255,255,.82); padding: 28px; display: grid; gap: 12px; }
.meta { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: rgba(255,255,255,.7); }
h2 { margin: 0; color: #fff; font: 900 24px/1.2 'Noto Sans Display', 'Noto Sans', system-ui, sans-serif; letter-spacing: -.01em; }
p { margin: 0; font-size: 15px; line-height: 1.5; }
form { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
input { flex: 1; min-width: 180px; font-family: inherit; font-size: 15px; padding: 12px 14px; border-radius: 4px; border: 0; }
button { font-family: inherit; font-weight: 700; font-size: 14px; background: var(--blue); color: #fff; border: 0; border-radius: 4px; padding: 12px 18px; cursor: pointer; }
button:disabled { opacity: .6; }
.fine { font-size: 12px; color: rgba(255,255,255,.6); }
a { color: #82b6ff; font-size: 14px; font-weight: 700; text-decoration: none; }
a:hover { text-decoration: underline; }
:focus-visible { outline: 3px solid #82b6ff; outline-offset: 2px; }
`;

class NewsletterSignup extends HTMLElement {
  async connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const cat = await catalogue();
    const lang = cat.uiLanguages.includes(this.getAttribute('lang')) ? this.getAttribute('lang') : 'en';
    const t = translator(cat, lang);
    const topic = cat.topics.find((tp) => tp.id === this.getAttribute('topic'));
    if (!topic) return;
    const ed = topic.editions.find((e) => e.lang === lang) ?? topic.editions[0];
    const freq = t(`frequencies.${ed.frequency ?? topic.frequency}`);

    root.innerHTML = `<style>${css}</style>
      <div class="box" part="box">
        <div class="meta">${t(`ui.${topic.type}`)} · ${freq}</div>
        <h2>${t(topic.type === 'blog' ? 'widget.getAlerts' : 'widget.getNewsletter', { name: ed.name })}</h2>
        <p>${esc(ed.description)}</p>
        <div class="slot">
          <form>
            <input type="email" required autocomplete="email" placeholder="${t('ui.emailPlaceholder')}" aria-label="${t('ui.email')}">
            <button type="submit">${t('ui.subscribe')}</button>
          </form>
          <p class="fine">${t('widget.fine')}</p>
        </div>
        <a href="${BASE}/${lang === 'en' ? '' : `?lang=${lang}`}">${t('widget.all')} →</a>
      </div>`;

    root.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const email = root.querySelector('input').value.trim();
      const btn = root.querySelector('button');
      btn.disabled = true;
      try {
        const res = await fetch(`${BASE}/api/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, editions: [ed.id], lang, source: `widget:${location.hostname}${location.pathname}` }),
        });
        if (!res.ok) throw new Error();
        root.querySelector('.slot').innerHTML = `<p>${t('widget.done', { email })}</p>`;
      } catch {
        btn.disabled = false;
        root.querySelector('.fine').innerHTML = t('ui.error');
      }
    });
  }
}

if (!customElements.get('oecd-newsletter-signup')) customElements.define('oecd-newsletter-signup', NewsletterSignup);

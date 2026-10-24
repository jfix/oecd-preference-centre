// Embeddable signup widget for section pages (e.g. in an AEM embed component):
//   <script type="module" src="https://<prefs-host>/widget.js"></script>
//   <oecd-newsletter-signup topic="tax" lang="en"></oecd-newsletter-signup>
// It uses the host page's fonts and talks to the preference centre API it was loaded from.

const BASE = new URL('.', import.meta.url).origin;
let cataloguePromise;
const catalogue = () => (cataloguePromise ??= fetch(`${BASE}/api/catalogue`).then((r) => r.json()));

const copy = {
  en: {
    newsletter: 'Newsletter', blog: 'Blog alert', get: (n) => `Get the ${n} newsletter`, alerts: (n) => `Get ${n} alerts`,
    email: 'Your email address', subscribe: 'Subscribe',
    fine: 'We will email you to confirm. Unsubscribe at any time.',
    done: (e) => `Almost done! Check your inbox at <strong>${e}</strong> and click the link to confirm.`,
    all: 'Explore all OECD newsletters', error: 'Something went wrong. Please try again.',
  },
  fr: {
    newsletter: "Lettre d'information", blog: 'Alerte blog', get: (n) => `Recevez la lettre ${n}`, alerts: (n) => `Recevez les alertes ${n}`,
    email: 'Votre adresse e-mail', subscribe: "S'abonner",
    fine: 'Nous vous enverrons un e-mail de confirmation. Désabonnement possible à tout moment.',
    done: (e) => `Presque terminé ! Consultez votre boîte mail (<strong>${e}</strong>) et cliquez sur le lien pour confirmer.`,
    all: "Toutes les lettres d'information de l'OCDE", error: 'Une erreur est survenue. Veuillez réessayer.',
  },
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
    const lang = this.getAttribute('lang') === 'fr' ? 'fr' : 'en';
    const t = copy[lang];
    const cat = await catalogue();
    const topic = cat.topics.find((tp) => tp.id === this.getAttribute('topic'));
    if (!topic) return;
    const ed = topic.editions.find((e) => e.lang === lang) ?? topic.editions[0];
    const freq = cat.frequencies[topic.frequency][lang];
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

    root.innerHTML = `<style>${css}</style>
      <div class="box" part="box">
        <div class="meta">${t[topic.type]} · ${freq}</div>
        <h2>${esc(topic.type === 'blog' ? t.alerts(ed.name) : t.get(ed.name))}</h2>
        <p>${esc(ed.description)}</p>
        <div class="slot">
          <form>
            <input type="email" required autocomplete="email" placeholder="${t.email}" aria-label="${t.email}">
            <button type="submit">${t.subscribe}</button>
          </form>
          <p class="fine">${t.fine}</p>
        </div>
        <a href="${BASE}/${lang === 'fr' ? '?lang=fr' : ''}">${t.all} →</a>
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
        root.querySelector('.slot').innerHTML = `<p>${t.done(esc(email))}</p>`;
      } catch {
        btn.disabled = false;
        root.querySelector('.fine').textContent = t.error;
      }
    });
  }
}

if (!customElements.get('oecd-newsletter-signup')) customElements.define('oecd-newsletter-signup', NewsletterSignup);

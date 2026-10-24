export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Minimal page shell for the server-rendered confirmation pages, sharing the catalogue's stylesheet. */
export const page = (title: string, body: string, lang = 'en') => `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | OECD</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Display:wght@700;800;900&family=Noto+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css"></head>
<body>
<header class="site-header"><div class="wrap"><a class="logo" href="/"><img src="/oecd-logo.svg" alt="OECD" width="134" height="33"></a></div></header>
<main class="wrap narrow">${body}</main>
</body></html>`;

/** A page with a single button that POSTs back. Email security scanners follow GET links but don't submit forms. */
export const actionPage = (opts: { title: string; intro: string; items?: string[]; button: string; lang?: string }) =>
  page(
    opts.title,
    `<div class="panel">
      <h1>${esc(opts.title)}</h1>
      <p>${esc(opts.intro)}</p>
      ${opts.items?.length ? `<ul class="plain-list">${opts.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
      <form method="post"><button class="btn btn-primary" type="submit">${esc(opts.button)}</button></form>
    </div>`,
    opts.lang,
  );

export const messagePage = (title: string, message: string, lang = 'en') =>
  page(
    title,
    `<div class="panel"><h1>${esc(title)}</h1><p>${esc(message)}</p>
     <p><a class="btn btn-primary" href="/">${lang === 'fr' ? 'Voir toutes les lettres' : 'Browse all newsletters'}</a></p></div>`,
    lang,
  );

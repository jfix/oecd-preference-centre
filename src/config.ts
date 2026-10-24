// Loads and validates the editable configuration:
//   config/catalogue.json  - the newsletters and blog alerts
//   i18n/<lang>.json       - all interface text, one file per language
// Validation runs when the Worker starts, so a broken file fails `npm run dev`, `npm run check:config`
// and `npm run deploy` instead of reaching users.
// To add an interface language: create i18n/<lang>.json (copy en.json) and add it to `locales` below.

import catalogueJson from '../config/catalogue.json' with { type: 'json' };
import en from '../i18n/en.json' with { type: 'json' };
import fr from '../i18n/fr.json' with { type: 'json' };

export const locales: Record<string, unknown> = { en, fr };
export const DEFAULT_LANG = 'en';

type Plural = { one: string; other: string };

export interface Edition {
  id: string;
  lang: string;
  name: string;
  description: string;
  adestraListId: number;
  frequency?: string;
}

export interface Topic {
  id: string;
  type: 'newsletter' | 'blog';
  theme: string;
  frequency: string;
  editions: Edition[];
}

interface Catalogue {
  languages: Record<string, string>;
  themes: string[];
  frequencies: string[];
  topics: Topic[];
}

// ---------------------------------------------------------------- Catalogue

const raw = catalogueJson as unknown as Catalogue;

export const catalogue: Catalogue = {
  ...raw,
  // Edition ids ("tax-en") are what subscriptions are stored against, so they're derived, never edited.
  topics: raw.topics.map((t) => ({ ...t, editions: t.editions.map((e) => ({ ...e, id: `${t.id}-${e.lang}` })) })),
};
export const topics = catalogue.topics;
export const editionsById = new Map(topics.flatMap((t) => t.editions.map((e) => [e.id, e] as const)));
export const isEdition = (id: string) => editionsById.has(id);

// ---------------------------------------------------------------- Translations

export const resolveLang = (l: unknown): string => (typeof l === 'string' && l in locales ? l : DEFAULT_LANG);

const lookup = (messages: unknown, path: string): unknown =>
  path.split('.').reduce<any>((node, key) => (node == null ? undefined : node[key]), messages);

/** Plain-text translation with {placeholders}. Falls back to English for missing keys. Callers escape for HTML. */
export function t(lang: string, path: string, vars: Record<string, string | number> = {}): string {
  let msg = lookup(locales[lang], path) ?? lookup(locales[DEFAULT_LANG], path);
  if (msg && typeof msg === 'object') {
    const p = msg as Plural;
    msg = new Intl.PluralRules(lang).select(Number(vars.n ?? 0)) === 'one' ? p.one : p.other;
  }
  if (typeof msg !== 'string') return path;
  return msg.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// ---------------------------------------------------------------- Validation

function validate(): string[] {
  const errors: string[] = [];
  const langs = new Set(Object.keys(catalogue.languages));
  const themes = new Set(catalogue.themes);
  const freqs = new Set(catalogue.frequencies);
  const topicIds = new Set<string>();
  const listIds = new Map<number, string>();

  for (const [i, tp] of catalogue.topics.entries()) {
    const at = `topics[${i}] (${tp.id ?? 'no id'})`;
    if (!tp.id || !/^[a-z0-9-]+$/.test(tp.id)) errors.push(`${at}: id must be lowercase letters, digits and dashes`);
    if (topicIds.has(tp.id)) errors.push(`${at}: duplicate id`);
    topicIds.add(tp.id);
    if (tp.type !== 'newsletter' && tp.type !== 'blog') errors.push(`${at}: type must be "newsletter" or "blog"`);
    if (!themes.has(tp.theme)) errors.push(`${at}: unknown theme "${tp.theme}" (add it to "themes")`);
    if (!freqs.has(tp.frequency)) errors.push(`${at}: unknown frequency "${tp.frequency}" (add it to "frequencies")`);
    if (!Array.isArray(tp.editions) || tp.editions.length === 0) {
      errors.push(`${at}: needs at least one edition`);
      continue;
    }
    const edLangs = new Set<string>();
    for (const ed of tp.editions) {
      const eat = `${at}, edition "${ed.lang}"`;
      if (!langs.has(ed.lang)) errors.push(`${eat}: unknown language (add it to "languages")`);
      if (edLangs.has(ed.lang)) errors.push(`${eat}: two editions in the same language`);
      edLangs.add(ed.lang);
      if (!ed.name?.trim()) errors.push(`${eat}: missing name`);
      if (!ed.description?.trim()) errors.push(`${eat}: missing description`);
      if (ed.frequency && !freqs.has(ed.frequency)) errors.push(`${eat}: unknown frequency "${ed.frequency}"`);
      if (!Number.isInteger(ed.adestraListId)) errors.push(`${eat}: adestraListId must be a whole number`);
      else if (listIds.has(ed.adestraListId)) errors.push(`${eat}: adestraListId ${ed.adestraListId} already used by ${listIds.get(ed.adestraListId)}`);
      else listIds.set(ed.adestraListId, ed.id);
    }
  }

  // Every interface language needs a name for every theme and frequency; other missing keys fall back to English.
  for (const [lang, messages] of Object.entries(locales)) {
    for (const th of themes) if (!lookup(messages, `themes.${th}`)) errors.push(`i18n/${lang}.json: missing themes.${th}`);
    for (const f of freqs) if (!lookup(messages, `frequencies.${f}`)) errors.push(`i18n/${lang}.json: missing frequencies.${f}`);
  }
  return errors;
}

const errors = validate();
if (errors.length) throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);

/** Keys present in English but missing in another language (shown as English on the site). */
export function missingTranslations(): Record<string, string[]> {
  const keys = (o: any, prefix = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === 'object' && !('one' in (v as object)) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    );
  const all = keys(locales[DEFAULT_LANG]);
  return Object.fromEntries(
    Object.entries(locales)
      .filter(([l]) => l !== DEFAULT_LANG)
      .map(([l, m]) => [l, all.filter((k) => lookup(m, k) == null)]),
  );
}

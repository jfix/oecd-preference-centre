// Validates config/catalogue.json and i18n/*.json, and lists untranslated text. Run: npm run check:config
import { catalogue, locales, missingTranslations } from '../src/config.ts';

const editions = catalogue.topics.flatMap((t) => t.editions);
console.log(`✓ ${catalogue.topics.length} topics, ${editions.length} editions, interface languages: ${Object.keys(locales).join(', ')}`);
for (const [lang, keys] of Object.entries(missingTranslations())) {
  if (keys.length) console.log(`! i18n/${lang}.json is missing ${keys.length} text(s), shown in English instead:\n    ${keys.join('\n    ')}`);
}

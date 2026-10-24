// The catalogue of everything people can subscribe to.
// A topic is a newsletter or a blog; an edition is that topic in one language,
// and is the unit people subscribe to (each edition maps to one Adestra list).
// For the prototype this lives in code; later it could come from a CMS or AEM content fragments.

export type Lang = 'en' | 'fr' | 'es' | 'ar' | 'ja';
export type TopicType = 'newsletter' | 'blog';
export type ThemeId = 'featured' | 'economy' | 'society' | 'governance' | 'environment' | 'innovation' | 'global';
export type FrequencyId = 'weekly' | 'twice-monthly' | 'monthly' | 'bimonthly' | 'quarterly' | 'biannual' | 'periodic' | 'per-post';

export interface Edition {
  id: string;
  lang: Lang;
  name: string;
  description: string;
  adestraListId: number;
}

export interface Topic {
  id: string;
  type: TopicType;
  theme: ThemeId;
  frequency: FrequencyId;
  editions: Edition[];
}

export const themes: Record<ThemeId, { en: string; fr: string }> = {
  featured: { en: 'Featured', fr: 'À la une' },
  economy: { en: 'Economy, finance and trade', fr: 'Économie, finance et échanges' },
  society: { en: 'Society, education and health', fr: 'Société, éducation et santé' },
  governance: { en: 'Governance and integrity', fr: 'Gouvernance et intégrité' },
  environment: { en: 'Environment and agriculture', fr: 'Environnement et agriculture' },
  innovation: { en: 'Digital, innovation and enterprise', fr: 'Numérique, innovation et entreprises' },
  global: { en: 'Regions and global relations', fr: 'Régions et relations mondiales' },
};

export const frequencies: Record<FrequencyId, { en: string; fr: string }> = {
  weekly: { en: 'Weekly', fr: 'Hebdomadaire' },
  'twice-monthly': { en: 'Twice a month', fr: 'Deux fois par mois' },
  monthly: { en: 'Monthly', fr: 'Mensuelle' },
  bimonthly: { en: 'Every two months', fr: 'Tous les deux mois' },
  quarterly: { en: 'Quarterly', fr: 'Trimestrielle' },
  biannual: { en: 'Twice a year', fr: 'Semestrielle' },
  periodic: { en: 'Periodic', fr: 'Périodique' },
  'per-post': { en: 'With each new post', fr: 'À chaque article' },
};

export const languageNames: Record<Lang, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  ar: 'العربية',
  ja: '日本語',
};

let nextListId = 1000;
const ed = (id: string, lang: Lang, name: string, description: string): Edition => ({
  id: `${id}-${lang}`,
  lang,
  name,
  description,
  adestraListId: nextListId++,
});
const nl = (id: string, theme: ThemeId, frequency: FrequencyId, editions: Array<[Lang, string, string]>): Topic => ({
  id,
  type: 'newsletter',
  theme,
  frequency,
  editions: editions.map(([lang, name, desc]) => ed(id, lang, name, desc)),
});
const blog = (id: string, theme: ThemeId, editions: Array<[Lang, string, string]>): Topic => ({
  id,
  type: 'blog',
  theme,
  frequency: 'per-post',
  editions: editions.map(([lang, name, desc]) => ed(id, lang, name, desc)),
});

export const topics: Topic[] = [
  nl('corporate', 'featured', 'monthly', [
    ['en', "What's New", "The OECD's monthly digest: key data, insights and policy highlights from all our fields of work."],
    ['fr', 'À la une', "Chaque mois, l'essentiel de l'OCDE : données, analyses et perspectives – nos travaux clés en un coup d'œil."],
    ['es', 'Noticias OCDE', 'Los últimos datos, análisis y perspectivas de la OCDE en español, cada trimestre.'],
  ]),

  nl('economy', 'economy', 'monthly', [['en', 'Economy', 'Structural macroeconomic policies, economic outlooks, country surveys and more.']]),
  nl('business-finance', 'economy', 'monthly', [['en', 'Business and finance', 'Insights on business, finance, competition and investment.']]),
  nl('tax', 'economy', 'weekly', [['en', 'Tax', 'International tax news, data and analysis from the OECD.']]),
  nl('trade', 'economy', 'monthly', [['en', 'Trade', 'Policy and data insights on global trade and supply chains.']]),
  nl('statistics', 'economy', 'monthly', [['en', 'Statistics', 'Data innovations, macroeconomic updates and events from the OECD.']]),

  nl('education', 'society', 'monthly', [['en', 'Education and skills', 'Webinar announcements and updates on education policy, global trends, research insights and data.']]),
  nl('teachers', 'society', 'monthly', [['en', 'Teachers', 'Practical insights, global perspectives and ideas you can use in the classroom.']]),
  nl('health', 'society', 'periodic', [['en', 'Health', 'News, data and insights on health trends, policy and outcomes.']]),
  nl('migration', 'society', 'quarterly', [['en', 'Migration', 'News, data and insights on international migration and the integration of migrants.']]),
  nl('society', 'society', 'monthly', [['en', 'Society', 'News, data and insights on employment, migration, health and social affairs.']]),
  nl('well-being', 'society', 'monthly', [['en', 'Well-being', 'Updates on well-being, inclusion, sustainability and equal opportunity.']]),

  nl('public-governance', 'governance', 'monthly', [['en', 'Public governance', 'News, data and insights on public governance.']]),
  nl('anti-corruption', 'governance', 'monthly', [['en', 'Anti-corruption and integrity', 'News, data and insights on anti-corruption and integrity.']]),
  nl('civil-society', 'governance', 'monthly', [['en', 'Civil society', "The OECD's policy conversations of interest to civil society, and our open consultations."]]),

  nl('environment', 'environment', 'twice-monthly', [['en', 'Environment', 'Environmental policy insights, events and news.']]),
  nl('agriculture', 'environment', 'monthly', [['en', 'Agriculture', 'Policy insights on agriculture and food systems.']]),
  nl('fisheries', 'environment', 'biannual', [['en', 'Fisheries', 'Policy insights on sustainable fisheries and marine systems.']]),
  nl('chemical-safety', 'environment', 'bimonthly', [['en', 'Chemical safety', 'News and insights on chemical safety.']]),

  nl('digital', 'innovation', 'quarterly', [['en', 'Digital policy', 'Insights on digital transformation and AI.']]),
  nl('sti', 'innovation', 'weekly', [['en', 'Innovation, science, technology and industry', 'Insights and data on innovation, science, technology and industry.']]),
  nl('cfe', 'innovation', 'monthly', [['en', 'Entrepreneurship, SMEs, regions and cities', 'Updates on people, places and firms.']]),

  nl('development', 'global', 'monthly', [
    ['en', 'Development', 'Publications, data, articles and events on emerging economies and international co-operation.'],
    ['fr', 'Développement', 'Publications, données, articles et événements sur les économies émergentes et la coopération internationale.'],
  ]),
  nl('lac', 'global', 'quarterly', [['en', 'Latin America and the Caribbean', 'OECD engagement, initiatives and publications in Latin America and the Caribbean.']]),
  nl('mena', 'global', 'quarterly', [
    ['en', 'Middle East and North Africa', 'OECD engagement, initiatives and publications in the Middle East and North Africa.'],
    ['fr', 'Moyen-Orient et Afrique du Nord', "Engagement, initiatives et publications de l'OCDE au Moyen-Orient et en Afrique du Nord."],
    ['ar', 'الشرق الأوسط وشمال أفريقيا', 'أنشطة منظمة التعاون الاقتصادي والتنمية ومبادراتها ومنشوراتها في منطقة الشرق الأوسط وشمال أفريقيا.'],
  ]),
  nl('southeast-asia', 'global', 'quarterly', [['en', 'Southeast Asia', 'OECD engagement, initiatives and publications in Southeast Asia.']]),
  nl('tokyo-centre', 'global', 'quarterly', [
    ['en', 'Tokyo Centre', 'News on Tokyo Centre activities and initiatives in Southeast Asia.'],
    ['ja', '東京センター', '東京センターの活動と東南アジアにおける取り組みに関するニュース。'],
  ]),

  // Placeholder blogs to show how blog alerts sit alongside newsletters.
  blog('blog-economy', 'economy', [['en', 'ECOSCOPE', 'Get an alert whenever a new post is published on the OECD economics blog.']]),
  blog('blog-education', 'society', [
    ['en', 'Education and Skills Today', 'Get an alert whenever a new post is published on the OECD education blog.'],
    ['fr', "L'éducation aujourd'hui", "Recevez une alerte à chaque nouvel article du blog éducation de l'OCDE."],
  ]),
  blog('blog-environment', 'environment', [['en', 'Environment Focus', 'Get an alert whenever a new post is published on the OECD environment blog.']]),
  blog('blog-digital', 'innovation', [['en', 'AI Wonk', 'Get an alert whenever a new post is published on the OECD.AI blog.']]),
  blog('blog-development', 'global', [
    ['en', 'Development Matters', 'Get an alert whenever a new post is published on the OECD development blog.'],
    ['fr', 'Développement en débat', "Recevez une alerte à chaque nouvel article du blog développement de l'OCDE."],
  ]),
];

export const editionsById = new Map(topics.flatMap((t) => t.editions.map((e) => [e.id, e] as const)));

export const isEdition = (id: string) => editionsById.has(id);

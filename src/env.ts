export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  PUBLIC_BASE_URL: string;
  DEV_TOOLS: string;
  WIDGET_ORIGINS: string;
  SIGNING_SECRET: string;
  ADESTRA_API_KEY?: string;
  ADESTRA_BASE_URL?: string;
  ADESTRA_CORE_TABLE_ID?: string;
}

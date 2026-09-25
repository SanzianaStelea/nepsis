import ro from './ro';
import fr from './fr';
import en from './en';
import de from './de';

export const locales = ['ro', 'fr', 'en', 'de'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ro';

/**
 * Subdirectorul în care e găzduit site-ul: gol pe domeniul propriu
 * (ch.nepsis.org), „/nepsis” pe o găzduire secundară de tip GitHub Pages.
 */
const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

/** Prefixează o cale internă absolută cu subdirectorul de găzduire. */
export function withBase(path: string): string {
  if (!base || !path.startsWith('/') || path.startsWith('//')) return path;
  return `${base}${path}`;
}

/** Elimină prefixul subdirectorului dintr-o cale (inversul lui `withBase`). */
function stripBase(pathname: string): string {
  if (!base) return pathname;
  if (pathname === base) return '/';
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}

export type UIDict = typeof ro;
export type UIKey = keyof UIDict;

const dicts: Record<Locale, Partial<UIDict>> = { ro, fr, en, de };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** Locale din parametrul de rută `[...lang]` (undefined => română). */
export function localeFromParam(param: string | undefined): Locale {
  return isLocale(param) ? param : defaultLocale;
}

/** Funcție de traducere: cheile lipsă cad pe română. */
export function useTranslations(locale: Locale) {
  return function t(key: UIKey): string {
    return dicts[locale][key] ?? ro[key];
  };
}

/** Prefixează o cale cu locale-ul (româna rămâne la rădăcină) și cu subdirectorul de găzduire. */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  const withLocale = locale === defaultLocale ? clean : `/${locale}${clean === '/' ? '/' : clean}`;
  return withBase(withLocale);
}

/**
 * Elimină prefixul de limbă (și pe cel al subdirectorului) dintr-o cale,
 * pentru selectorul de limbă. Rezultatul se dă mai departe lui `localePath`.
 */
export function stripLocale(pathname: string): string {
  const path = stripBase(pathname);
  for (const l of locales) {
    if (l === defaultLocale) continue;
    if (path === `/${l}` || path === `/${l}/`) return '/';
    if (path.startsWith(`/${l}/`)) return path.slice(l.length + 1);
  }
  return path || '/';
}

/** Căile statice pentru rutele `[...lang]`: /, /fr, /en, /de. */
export function langStaticPaths() {
  return [
    { params: { lang: undefined } },
    { params: { lang: 'fr' } },
    { params: { lang: 'en' } },
    { params: { lang: 'de' } },
  ];
}

const dateLocales: Record<Locale, string> = {
  ro: 'ro-RO',
  fr: 'fr-CH',
  en: 'en-GB',
  de: 'de-CH',
};

/** Formatează o dată complet (ex. „28 februarie 2026”). */
export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(dateLocales[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Numele localităților care se scriu altfel de la o limbă la alta
 * (ex. „Geneva” → „Genève” / „Genf”). Celelalte rămân neschimbate.
 */
const places: Record<string, Partial<Record<Locale, string>>> = {
  Geneva: { fr: 'Genève', en: 'Geneva', de: 'Genf' },
  Zurich: { ro: 'Zürich', fr: 'Zurich', en: 'Zurich', de: 'Zürich' },
};

export function localizePlace(name: string, locale: Locale): string {
  return places[name]?.[locale] ?? name;
}

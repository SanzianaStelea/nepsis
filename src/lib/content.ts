import { getCollection, render, type CollectionEntry } from 'astro:content';
import { defaultLocale, type Locale } from '../i18n';

type Translatable = { data: { lang: Locale; translationKey: string } };

/** Grupează intrările după `translationKey` (o traducere per limbă). */
export function groupByTranslationKey<T extends Translatable>(entries: T[]): Map<string, T[]> {
  const byKey = new Map<string, T[]>();
  for (const entry of entries) {
    const group = byKey.get(entry.data.translationKey) ?? [];
    group.push(entry);
    byKey.set(entry.data.translationKey, group);
  }
  return byKey;
}

/** Varianta canonică (românească) a unui grup de traduceri. */
export function canonicalOf<T extends Translatable>(group: T[]): T {
  return group.find((e) => e.data.lang === defaultLocale) ?? group[0]!;
}

/** Varianta în limba cerută, cu fallback pe română. */
export function localizedOf<T extends Translatable>(group: T[], locale: Locale): T {
  return group.find((e) => e.data.lang === locale) ?? canonicalOf(group);
}

/**
 * Alege, pentru fiecare `translationKey`, varianta în limba cerută;
 * dacă nu există traducere, cade pe română (fallback).
 */
function pickByLocale<T extends Translatable>(entries: T[], locale: Locale): T[] {
  return [...groupByTranslationKey(entries).values()].map((group) => localizedOf(group, locale));
}

/** Toate evenimentele în limba cerută (cu fallback pe română). */
export async function getEvents(locale: Locale): Promise<CollectionEntry<'evenimente'>[]> {
  const all = await getCollection('evenimente');
  return pickByLocale(all, locale);
}

/**
 * Împarte evenimentele automat: cele de azi încolo la „Urmează” (crescător),
 * restul la „Trecute” (descrescător). Nimeni nu mută nimic manual.
 */
export function splitEvents(events: CollectionEntry<'evenimente'>[], now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const upcoming = events
    .filter((e) => e.data.date.getTime() >= today.getTime())
    .sort((a, b) => a.data.date.getTime() - b.data.date.getTime());
  const past = events
    .filter((e) => e.data.date.getTime() < today.getTime())
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  return { upcoming, past };
}

export type MemoryWithSlug = {
  memory: CollectionEntry<'amintiri'>;
  /** Slug-ul paginii proprii (/amintiri/<slug>/) — identic în toate limbile. */
  slug: string;
  /** `true` când amintirea nu e tradusă și se afișează în română. */
  fallback: boolean;
};

/** Amintirile în limba cerută, grupate pe ani (anii cei mai noi primii), cu slug-ul paginii proprii. */
export async function getMemoriesByYear(locale: Locale) {
  const all = await getCollection('amintiri');
  const withSlugs: MemoryWithSlug[] = [...groupByTranslationKey(all).values()].map((group) => ({
    memory: localizedOf(group, locale),
    slug: canonicalOf(group).id,
    fallback: localizedOf(group, locale).data.lang !== locale,
  }));
  const byYear = new Map<number, MemoryWithSlug[]>();
  for (const item of withSlugs) {
    const group = byYear.get(item.memory.data.year) ?? [];
    group.push(item);
    byYear.set(item.memory.data.year, group);
  }
  const sortKey = (e: CollectionEntry<'amintiri'>) =>
    e.data.date ? e.data.date.getTime() : e.data.order;
  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, entries]) => ({
      year,
      entries: entries.sort((a, b) => sortKey(b.memory) - sortKey(a.memory)),
    }));
}

let avertizat = false;

/**
 * Lista de lucru pentru conținut: la build se afișează (o singură dată) amintirile
 * românești cărora le lipsește ceva — câmpul `missing` sau fotografiile.
 */
export async function warnMissingContent() {
  if (avertizat) return;
  avertizat = true;
  const all = await getCollection('amintiri');
  for (const memory of all) {
    if (memory.data.lang !== defaultLocale) continue;
    const lipsa = new Set<string>(memory.data.missing);
    if (memory.data.images.length === 0) lipsa.add('photos');
    if (lipsa.size > 0) console.warn(`[amintiri] lipsește: ${memory.id} (${[...lipsa].join(', ')})`);
  }
}

/** Conținutul unei pagini statice în limba cerută, cu fallback pe română. */
export async function getPage(id: string, locale: Locale) {
  const page = await getOptionalPage(id, locale);
  if (!page) throw new Error(`Pagina „${id}” nu există în src/content/pagini/`);
  return page;
}

/** Ca `getPage`, dar întoarce `null` dacă pagina nu există (ex. calendarul anual). */
export async function getOptionalPage(id: string, locale: Locale) {
  const all = await getCollection('pagini');
  const entry =
    all.find((e) => e.id === `${locale}/${id}`) ?? all.find((e) => e.id === `${defaultLocale}/${id}`);
  if (!entry) return null;
  const { Content } = await render(entry);
  return { entry, Content };
}

/** Membrii, în ordinea din frontmatter. */
export async function getMembers() {
  const all = await getCollection('membri');
  return all.sort((a, b) => a.data.order - b.data.order);
}

/**
 * Primele rânduri din textul unei amintiri, curățate de marcajele Markdown, ca să
 * încapă în rezumatul de două rânduri de pe pagina de amintiri.
 */
export function rezumatText(body: string | undefined, limita = 220): string {
  const text = (body ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // imagini
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // legături: păstrăm doar textul
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>`]/g, ' ')
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limita) return text;
  // tăiem la limita unui cuvânt și marcăm tăietura cu „…”
  const cut = text.slice(0, limita);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limita * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–—-]+$/, '') + '…';
}

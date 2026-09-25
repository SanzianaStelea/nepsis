#!/usr/bin/env node
/*
 * Harness de verificare pentru site: construiește site-ul, pornește `astro preview`,
 * parcurge toate paginile × limbile × lățimile de ecran, face capturi și scrie un
 * raport JSON + un rezumat Markdown. Nu modifică nimic în proiect.
 *
 *   node .claude/review/check-site.mjs [--out DIR] [--no-build] [--pages /,/contact/] [--locales ro,fr]
 *
 * Necesită playwright-core (npm install --no-save playwright-core) și Google Chrome instalat.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes(`--${name}`);

const OUT = resolve(ROOT, opt('out', '.claude/review/out/latest'));
const PORT = Number(opt('port', '4399'));
const BASE = `http://127.0.0.1:${PORT}`;

const LOCALES = opt('locales', 'ro,fr,en,de').split(',');
const VIEWPORTS = [
  { w: 360, h: 740, name: 'phone-s' },
  { w: 390, h: 844, name: 'phone' },
  { w: 768, h: 1024, name: 'tablet' },
  { w: 1024, h: 768, name: 'laptop-s' },
  { w: 1280, h: 800, name: 'laptop' }, // pragul xl: meniul orizontal apare aici (ro/fr/en)
  { w: 1440, h: 900, name: 'desktop' },
];

// Slug-ul amintirii celei mai recente (numele fișierului românesc, fără .md).
const memorySlugs = readdirSync(join(ROOT, 'src/content/amintiri'))
  .filter((f) => f.endsWith('.md') && !f.startsWith('_') && !/\.(fr|en|de)\.md$/.test(f))
  .map((f) => f.replace(/\.md$/, ''))
  .sort();
const latestMemory = memorySlugs[memorySlugs.length - 1];

const ALL_PAGES = [
  '/',
  '/evenimente/',
  '/amintiri/',
  `/amintiri/${latestMemory}/`,
  '/echipa/',
  '/contact/',
  '/devino-membru/',
  '/newsletter/',
  '/ocrotitorul/',
  '/psaltica/',
  '/404',
];
const PAGES = opt('pages', ALL_PAGES.join(',')).split(',');

// Cuvinte românești frecvente în interfață — dacă apar în antet/subsol/titluri pe
// paginile fr/en/de, înseamnă că lipsește o traducere.
const RO_MARKERS = [
  'Acasă', 'Evenimente', 'Amintiri', 'Ocrotitorul', 'Echipa', 'Psaltică', 'Devino membru',
  'Abonează', 'Scrie-ne', 'Urmează', 'trecute', 'Despre', 'Înapoi', 'Citește', 'Vezi',
  'și', 'pentru', 'noastre', 'nostru',
];
// Nume proprii cu diacritice românești, permise în orice limbă.
const PROPER_NOUNS = [
  'Nepsis Elveția', 'Elveția', 'Mitropolia', 'Mitropoliei', 'Casian', 'Ștefan', 'Sânziana',
  'Hușilor', 'Huși', 'Mănăstirea', 'Putna', 'Dobrogea', 'Română',
];

function log(...a) {
  console.error('[check-site]', ...a);
}

/* ---------- verificări statice ---------- */

function i18nKeys(locale) {
  const src = readFileSync(join(ROOT, `src/i18n/${locale}.ts`), 'utf8');
  return new Set([...src.matchAll(/^\s*'([\w.-]+)'\s*:/gm)].map((m) => m[1]));
}

function staticChecks() {
  const ro = i18nKeys('ro');
  const i18n = {};
  for (const l of ['fr', 'en', 'de']) {
    const keys = i18nKeys(l);
    i18n[l] = {
      missing: [...ro].filter((k) => !keys.has(k)),
      extra: [...keys].filter((k) => !ro.has(k)),
    };
  }
  const roPages = readdirSync(join(ROOT, 'src/content/pagini/ro')).filter((f) => f !== 'calendar.md');
  const pagini = {};
  for (const l of ['fr', 'en', 'de']) {
    const dir = join(ROOT, `src/content/pagini/${l}`);
    const have = existsSync(dir) ? readdirSync(dir) : [];
    pagini[l] = { missing: roPages.filter((f) => !have.includes(f)) };
  }
  return { i18n, pagini };
}

/* ---------- build + preview ---------- */

function build() {
  log('npm run build …');
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, encoding: 'utf8' });
  const tail = (r.stdout + r.stderr).split('\n').slice(-40).join('\n');
  return { ok: r.status === 0, tail };
}

async function startPreview() {
  const proc = spawn('npx', ['astro', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let output = '';
  proc.stdout.on('data', (d) => (output += d));
  proc.stderr.on('data', (d) => (output += d));
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(BASE + '/');
      if (res.ok) return proc;
    } catch {}
  }
  try { process.kill(-proc.pid); } catch {}
  throw new Error('astro preview did not start:\n' + output);
}

/* ---------- verificări în browser ---------- */

// Rulează în pagină. Întoarce măsurători pentru lățimea curentă.
function inPageChecks({ phone, roMarkers, properNouns, checkRo }) {
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3) : [];
    if (cls.length && cls[0]) s += '.' + cls.join('.');
    return s;
  };
  const vw = window.innerWidth;
  const docW = document.documentElement.scrollWidth;
  const overflowPx = Math.max(0, docW - vw);

  const offenders = [];
  if (overflowPx > 0) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1) continue;
      // doar cele mai adânci: niciun copil care să depășească și el
      const childOver = [...el.children].some((c) => c.getBoundingClientRect().right > vw + 1);
      if (!childOver) offenders.push({ el: sel(el), right: Math.round(r.right) });
      if (offenders.length >= 10) break;
    }
  }

  const brokenImages = [...document.images]
    .filter((img) => img.complete && img.naturalWidth === 0 && img.loading !== 'lazy')
    .map((img) => img.currentSrc || img.src);

  const smallTargets = [];
  if (phone) {
    const scope = document.querySelectorAll(
      'header a, header button, footer a, footer button, button, input, select, textarea, a[class*="rounded"], a[class*="btn"]'
    );
    for (const el of scope) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.closest('.hidden, [hidden], .sr-only') || r.width <= 1 || r.height <= 1) continue;
      // Pragul WCAG 2.2 AA (2.5.8) e 24px; 44px e doar recomandarea AAA / Apple.
      if (r.height < 24 || r.width < 24) {
        smallTargets.push({ el: sel(el), text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
  }

  // Text care ar trebui tradus: antet, subsol, titluri, butoane.
  const roLeftovers = [];
  if (checkRo) {
    const nodes = document.querySelectorAll('header, footer, h1, h2, h3, button, main a[class*="rounded"], title');
    const seen = new Set();
    for (const n of nodes) {
      if (n.closest('[lang="ro"]') && n.closest('[lang="ro"]') !== document.documentElement) continue; // ex. „RO” din selector
      let text = (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim();
      for (const p of properNouns) text = text.split(p).join('');
      const hits = roMarkers.filter((m) => new RegExp(`(^|[^\\p{L}])${m}([^\\p{L}]|$)`, 'u').test(text));
      const diac = /[ăĂșȘțȚşŞţŢ]/.test(text);
      if ((hits.length || diac) && !seen.has(text)) {
        seen.add(text);
        // „chrome” = antetul/subsolul site-ului (texte din i18n, trebuie traduse);
        // „content” = titluri de evenimente/amintiri, care cad pe română dacă nu există traducerea.
        const zone = n.closest('header.sticky, body > footer, footer') || n.tagName === 'BUTTON' ? 'chrome' : 'content';
        roLeftovers.push({ el: sel(n), zone, hits, diacritics: diac, text: text.slice(0, 120) });
      }
    }
  }

  return {
    htmlLang: document.documentElement.getAttribute('lang'),
    title: document.title,
    overflowPx,
    offenders,
    brokenImages,
    smallTargets: smallTargets.slice(0, 15),
    smallTargetCount: smallTargets.length,
    roLeftovers: roLeftovers.slice(0, 10),
  };
}

async function main() {
  const { chromium } = await import('playwright-core').catch(() => {
    console.error('playwright-core lipsește: rulează `npm install --no-save playwright-core`');
    process.exit(2);
  });

  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const report = { generatedFor: BASE, out: OUT, build: null, static: staticChecks(), pages: [], menus: [] };

  if (!flag('no-build')) {
    report.build = build();
    if (!report.build.ok) {
      writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
      writeFileSync(join(OUT, 'summary.md'), `# BUILD FAILED\n\n\`\`\`\n${report.build.tail}\n\`\`\`\n`);
      log('build failed — see', join(OUT, 'summary.md'));
      process.exit(1);
    }
  }

  const preview = await startPreview();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  try {
    for (const locale of LOCALES) {
      for (const page of PAGES) {
        if (page === '/404' && locale !== 'ro') continue; // 404 există doar în română
        const path = locale === 'ro' ? page : `/${locale}${page}`;
        const pageKey = page === '/' ? 'home' : page.replace(/^\/|\/$/g, '').replace(/\//g, '__');

        for (const vp of VIEWPORTS) {
          const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
          const tab = await ctx.newPage();
          const consoleErrors = [];
          const failedRequests = [];
          tab.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)));
          tab.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 200)));
          tab.on('requestfailed', (r) => failedRequests.push(r.url()));
          tab.on('response', (r) => {
            if (r.status() >= 400 && !(page === '/404' && r.url().endsWith('/404'))) failedRequests.push(`${r.status()} ${r.url()}`);
          });

          let status = null;
          try {
            const res = await tab.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
            status = res?.status() ?? null;
          } catch (e) {
            consoleErrors.push('navigation: ' + String(e).slice(0, 200));
          }
          // Capturile full-page trebuie să arate toate pozele: imaginile lazy devin eager,
          // apoi se derulează pagina și se așteaptă să se termine descărcările.
          await tab.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach((i) => (i.loading = 'eager')));
          await tab.evaluate(async () => {
            for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
              window.scrollTo(0, y);
              await new Promise((r) => setTimeout(r, 60));
            }
            window.scrollTo(0, 0);
          });
          await tab.waitForLoadState('networkidle').catch(() => {});
          await tab.waitForTimeout(250);

          const checks = await tab.evaluate(inPageChecks, {
            phone: vp.w <= 390,
            roMarkers: RO_MARKERS,
            properNouns: PROPER_NOUNS,
            checkRo: locale !== 'ro',
          });

          const dir = join(OUT, locale, pageKey);
          mkdirSync(dir, { recursive: true });
          const shot = join(dir, `${vp.w}.jpg`);
          await tab.screenshot({ path: shot, fullPage: true, type: 'jpeg', quality: 70 });

          report.pages.push({
            url: path,
            locale,
            page,
            viewport: vp.w,
            status,
            langOk: checks.htmlLang === locale,
            ...checks,
            consoleErrors,
            failedRequests: [...new Set(failedRequests)],
            screenshot: shot,
          });

          // meniul mobil: deschis la 390px, captură de ecran (nu full-page)
          if (vp.w === 390 && page === '/') {
            const btn = tab.locator('#meniu-buton');
            const entry = { locale, buttonVisible: await btn.isVisible() };
            if (entry.buttonVisible) {
              await btn.click();
              await tab.waitForTimeout(200);
              entry.menuVisible = await tab.locator('#meniu-mobil').isVisible();
              entry.expanded = await btn.getAttribute('aria-expanded');
              entry.menuOverflowPx = await tab.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
              entry.screenshot = join(dir, 'menu-390.jpg');
              await tab.screenshot({ path: entry.screenshot, type: 'jpeg', quality: 70 });
            }
            report.menus.push(entry);
          }
          await ctx.close();
        }
        log(`${locale} ${page} ✓`);
      }
    }
  } finally {
    await browser.close();
    try { process.kill(-preview.pid); } catch {}
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT, 'summary.md'), summarize(report));
  log('done →', join(OUT, 'summary.md'));
}

function summarize(r) {
  const L = [`# Site check — ${r.pages.length} page renders`, ''];
  const s = r.static;
  L.push('## Static language checks');
  for (const l of ['fr', 'en', 'de']) {
    L.push(`- **${l}**: i18n keys missing ${s.i18n[l].missing.length}${s.i18n[l].missing.length ? ` (${s.i18n[l].missing.join(', ')})` : ''}; extra ${s.i18n[l].extra.length}${s.i18n[l].extra.length ? ` (${s.i18n[l].extra.join(', ')})` : ''}; pagini missing ${s.pagini[l].missing.join(', ') || 'none'}`);
  }
  L.push('');
  const sect = (title, rows) => {
    L.push(`## ${title} (${rows.length})`);
    rows.slice(0, 40).forEach((x) => L.push('- ' + x));
    if (rows.length > 40) L.push(`- … ${rows.length - 40} more in report.json`);
    L.push('');
  };
  const P = r.pages;
  sect('Horizontal overflow', P.filter((p) => p.overflowPx > 0).map((p) => `${p.url} @${p.viewport}: +${p.overflowPx}px — ${p.offenders.map((o) => o.el).join(', ')}`));
  sect('HTTP / navigation status', P.filter((p) => p.status !== 200 && !(p.page === '/404' && p.status === 404)).map((p) => `${p.url} @${p.viewport}: ${p.status}`));
  sect('Wrong <html lang>', P.filter((p) => !p.langOk).map((p) => `${p.url} @${p.viewport}: lang="${p.htmlLang}"`));
  sect('Console errors', P.filter((p) => p.consoleErrors.length).map((p) => `${p.url} @${p.viewport}: ${p.consoleErrors.join(' | ')}`));
  sect('Failed requests', P.filter((p) => p.failedRequests.length).map((p) => `${p.url} @${p.viewport}: ${p.failedRequests.join(', ')}`));
  sect('Broken images', P.filter((p) => p.brokenImages.length).map((p) => `${p.url} @${p.viewport}: ${p.brokenImages.join(', ')}`));
  const ro = (zone) => dedupe(P.flatMap((p) => p.roLeftovers.filter((x) => x.zone === zone).map((x) => `${p.locale} ${p.page}: <${x.el}> “${x.text}”${x.hits.length ? ` [${x.hits.join(', ')}]` : ''}`)));
  sect('Untranslated UI text in header/footer/buttons (fr/en/de) — should be fixed', ro('chrome'));
  sect('Romanian content titles on fr/en/de (entry has no translation; falls back to ro by design)', ro('content'));
  sect('Small tap targets <24px (phones, WCAG 2.2 AA)', dedupe(P.filter((p) => p.smallTargetCount).flatMap((p) => p.smallTargets.map((t) => `${p.locale} ${p.page} @${p.viewport}: ${t.el} “${t.text}” ${t.w}×${t.h}`))));
  sect('Mobile menu @390', r.menus.map((m) => `${m.locale}: button ${m.buttonVisible ? 'visible' : 'MISSING'}, menu ${m.menuVisible ? 'opens' : 'DOES NOT OPEN'}, aria-expanded=${m.expanded}, overflow ${m.menuOverflowPx ?? '-'}px — ${m.screenshot ?? ''}`));
  L.push(`Screenshots: ${r.out}/<locale>/<page>/<width>.jpg`);
  return L.join('\n');
}

const dedupe = (a) => [...new Set(a)];

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

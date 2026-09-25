// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

/*
 * Site-ul se publică normal la https://ch.nepsis.org (rădăcina domeniului).
 * Pentru o găzduire secundară într-un subdirector (ex. GitHub Pages de proiect,
 * https://user.github.io/nepsis/) se dau la build variabilele de mediu
 * SITE_URL și BASE_PATH. Fără ele, comportamentul rămâne neschimbat.
 */
const SITE_URL = process.env.SITE_URL || 'https://ch.nepsis.org';
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/$/, '');

/**
 * Prefixează cu BASE_PATH adresele absolute scrise în Markdown (`/img/…`,
 * `](/evenimente/)`). Fără plugin, conținutul din fișierele .md ar trimite la
 * rădăcina domeniului, nu la subdirectorul în care e găzduit site-ul.
 */
function rehypePrefixAbsolutePaths() {
  return (tree) => {
    if (!BASE_PATH) return;
    const walk = (node) => {
      if (node.type === 'element' && node.properties) {
        for (const attr of ['src', 'href']) {
          const value = node.properties[attr];
          // Doar căile interne: „/img/x.jpg” da, „//cdn…” și „https://…” nu.
          if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
            node.properties[attr] = BASE_PATH + value;
          }
        }
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH || undefined,
  output: 'static',
  /*
   * Pagina „Membri” s-a redenumit „Echipa”. Adresa veche rămâne validă și
   * trimite la cea nouă, ca legăturile date deja mai departe să nu se rupă.
   */
  redirects: {
    '/membri': '/echipa',
    '/fr/membri': '/fr/echipa',
    '/en/membri': '/en/echipa',
    '/de/membri': '/de/echipa',
  },
  trailingSlash: 'ignore',
  build: {
    // CSS-ul e mic; inliniat în HTML economisește un request blocant la randare.
    inlineStylesheets: 'always',
  },
  markdown: {
    rehypePlugins: [rehypePrefixAbsolutePaths],
  },
  i18n: {
    defaultLocale: 'ro',
    locales: ['ro', 'fr', 'en', 'de'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    sitemap({
      // Miniaturile generate la build (/thumbs/…) nu sunt pagini.
      filter: (page) => !page.includes('/thumbs/'),
      i18n: {
        defaultLocale: 'ro',
        locales: { ro: 'ro', fr: 'fr', en: 'en', de: 'de' },
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});

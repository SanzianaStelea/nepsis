import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import sharp from 'sharp';
import { THUMB_WIDTHS, thumbPath } from '../../lib/images';

/*
 * Miniaturile WebP ale fotografiilor din amintiri, evenimente și echipă, generate la
 * build. Fișierele din public/img rămân neatinse.
 */
export const prerender = true;

export const getStaticPaths = (async () => {
  const surse = new Set<string>();
  for (const amintire of await getCollection('amintiri')) {
    for (const img of amintire.data.images) surse.add(img.src);
  }
  for (const eveniment of await getCollection('evenimente')) {
    if (eveniment.data.image) surse.add(eveniment.data.image);
  }
  for (const membru of await getCollection('membri')) {
    if (membru.data.photo) surse.add(membru.data.photo);
  }

  const vazute = new Map<string, string>();
  const paths = [];
  for (const src of surse) {
    for (const w of THUMB_WIDTHS) {
      const path = thumbPath(src, w).replace(/^\/thumbs\//, '');
      const alta = vazute.get(path);
      if (alta && alta !== src) {
        throw new Error(`Miniaturi în conflict: „${alta}” și „${src}” ajung amândouă la /thumbs/${path}`);
      }
      vazute.set(path, src);
      paths.push({ params: { path }, props: { src, w } });
    }
  }
  return paths;
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { src, w } = props as { src: string; w: number };
  const buffer = await sharp(`public${src}`, { animated: false })
    .rotate()
    .resize({ width: w, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();
  return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'image/webp' } });
};

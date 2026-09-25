import sharp from 'sharp';
import { withBase } from '../i18n';

/**
 * Miniaturi pentru fotografiile din public/img. Originalele rămân pe loc (le
 * folosesc și paginile vechi, înghețate); la build se generează variante WebP
 * mai mici sub /thumbs/<lățime>/…, prin src/pages/thumbs/[...path].ts.
 */
export const THUMB_WIDTHS = [480, 960, 1600] as const;

/** Calea miniaturii: /img/a.jpeg la 480px → /thumbs/480/img/a.webp */
export function thumbPath(src: string, w: number): string {
  return `/thumbs/${w}${src.replace(/\.[^./]+$/, '')}.webp`;
}

/** Ca `thumbPath`, dar cu subdirectorul de găzduire în față. */
export function thumbUrl(src: string, w: number): string {
  return withBase(thumbPath(src, w));
}

/** Valoarea pentru atributul `srcset`: „url 480w, url 960w, url 1600w”. */
export function thumbSrcset(src: string, widths: readonly number[] = THUMB_WIDTHS): string {
  return widths.map((w) => `${thumbUrl(src, w)} ${w}w`).join(', ');
}

const sizeCache = new Map<string, Promise<{ width: number; height: number }>>();

/**
 * Dimensiunile reale ale unei fotografii din public/ (pentru `width`/`height`,
 * ca pagina să nu sară la încărcare). Ține cont de orientarea EXIF: pozele
 * făcute cu telefonul ținut vertical au lățimea și înălțimea inversate.
 */
export function imageSize(src: string): Promise<{ width: number; height: number }> {
  let cached = sizeCache.get(src);
  if (!cached) {
    cached = sharp(`public${src}`)
      .metadata()
      .then((m) => {
        const width = m.width ?? 0;
        const height = m.height ?? 0;
        const rotit = (m.orientation ?? 1) >= 5 && (m.orientation ?? 1) <= 8;
        return rotit ? { width: height, height: width } : { width, height };
      });
    sizeCache.set(src, cached);
  }
  return cached;
}

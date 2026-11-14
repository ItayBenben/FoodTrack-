/**
 * Meal photos (08 §4.4). Library pictures are usually full-resolution (3–12 MB). We shrink them on
 * the device before they go into the IndexedDB media_queue: less local storage, a faster upload on
 * a phone connection, and nothing the meal needs is lost at 1600 px. If the browser can't decode a
 * format (e.g. HEIC outside Safari) the original file is kept untouched — never dropped.
 */
export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.85;
/** Files already smaller than this are kept as they are; re-encoding them would only cost quality. */
export const KEEP_BELOW_BYTES = 600 * 1024;

/** Target size that fits inside a `max`×`max` box, keeping the aspect ratio and never upscaling. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** How many of `picked` fit next to `current` photos, and how many were left out. */
export function admit<T>(current: number, max: number, picked: T[]): { take: T[]; dropped: number } {
  const room = Math.max(0, max - current);
  return { take: picked.slice(0, room), dropped: Math.max(0, picked.length - room) };
}

export async function prepareMealPhoto(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return file; }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    if (file.size <= KEEP_BELOW_BYTES && width === bitmap.width && height === bitmap.height) return file;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    return out && out.size < file.size ? out : file;
  } finally { bitmap.close(); }
}

export interface PhotoParseItem { raw_text: string; food_id: string | null; canonical_name: string | null; quantity: number | null; unit: string | null; grams_est: number | null; confidence: number | null; resolved_by: string | null; portion_precision?: string }
export interface PhotoParseResult { media_id: string; items: PhotoParseItem[]; vision: 'on' | 'off' | 'unavailable' }

/**
 * Upload one meal photo and ask the server what's in it. Returns null when offline or on any failure —
 * the caller keeps the photo locally and it uploads with the meal later (nothing is lost).
 */
export async function parseMealPhoto(blob: Blob, headers: Record<string, string>): Promise<PhotoParseResult | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const fd = new FormData(); fd.append('file', blob, 'meal');
  try {
    const r = await fetch('/api/v1/meals/parse-photo', { method: 'POST', body: fd, headers, credentials: 'same-origin' });
    return r.ok ? (await r.json()) as PhotoParseResult : null;
  } catch { return null; }
}

const key = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
/** Add photo-found items the meal doesn't already have (same food, or same name), keeping typed ones first. */
export function mergeItems<T extends { food_id: string | null; canonical_name: string | null; raw_text: string }>(base: T[], extra: T[]): T[] {
  const out = [...base];
  for (const e of extra) {
    const dup = out.some((b) => (e.food_id && b.food_id === e.food_id) || (key(e.canonical_name) && key(b.canonical_name) === key(e.canonical_name)) || key(b.raw_text) === key(e.raw_text));
    if (!dup) out.push(e);
  }
  return out;
}

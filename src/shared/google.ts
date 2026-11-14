// Google Translate (unofficial, keyless) request/response helpers. Pure functions.

export interface GoogleEndpoint {
  base: string;
  client: string;
}

/** Spec endpoint first; clients5 is a fallback when the first is rate limited (see DECISIONS). */
export const GOOGLE_ENDPOINTS: readonly GoogleEndpoint[] = [
  { base: 'https://translate.googleapis.com/translate_a/single', client: 'gtx' },
  { base: 'https://clients5.google.com/translate_a/single', client: 'dict-chrome-ex' },
];

export function buildGoogleUrl(
  text: string,
  target = 'tr',
  endpoint: GoogleEndpoint = GOOGLE_ENDPOINTS[0] as GoogleEndpoint,
): string {
  return (
    `${endpoint.base}?client=${encodeURIComponent(endpoint.client)}` +
    `&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`
  );
}

/**
 * Parses the nested-array response: concatenates every `data[0][i][0]` string.
 * Returns null when the shape is not recognized.
 */
export function parseGoogleResponse(data: unknown): string | null {
  if (!Array.isArray(data)) return null;
  const segments: unknown = data[0];
  if (!Array.isArray(segments)) return null;
  let out = '';
  for (const seg of segments) {
    if (Array.isArray(seg) && typeof seg[0] === 'string') out += seg[0];
  }
  return out;
}

/** Parses a raw body; returns null for non-JSON (e.g. the HTML "Sorry" page) or unknown shape. */
export function parseGoogleBody(body: string): string | null {
  try {
    return parseGoogleResponse(JSON.parse(body) as unknown);
  } catch {
    return null;
  }
}

/**
 * Splits a translated batch back into lines. Returns null when the number of lines does not
 * match the number of inputs (caller should then retry item by item).
 */
export function alignTranslations(translated: string, expectedCount: number): string[] | null {
  const lines = translated
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '')
    .split('\n')
    .map((l) => l.trim());
  if (expectedCount === 1) return [lines.join(' ').trim()];
  if (lines.length !== expectedCount) return null;
  return lines;
}

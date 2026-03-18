import brotliPromise from 'brotli-wasm';

// ── helpers ────────────────────────────────────────────────────

/** Resolved brotli-wasm module (lazy-initialized) */
let brotliInstance: Awaited<typeof brotliPromise> | null = null;

async function getBrotli() {
  if (!brotliInstance) {
    brotliInstance = await brotliPromise;
  }
  return brotliInstance;
}

/** Uint8Array → URL-safe base64 (no padding) */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** URL-safe base64 → Uint8Array */
function fromBase64Url(str: string): Uint8Array {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── public API ─────────────────────────────────────────────────

/**
 * Compress markdown into a URL-safe string.
 * Uses Brotli compression + base64url.
 */
export async function compressMarkdown(markdown: string): Promise<string> {
  const brotli = await getBrotli();
  const compressed = brotli.compress(new TextEncoder().encode(markdown));
  return toBase64Url(compressed);
}

/**
 * Decompress a base64url string back into markdown.
 */
export async function decompressMarkdown(compressed: string): Promise<string | null> {
  try {
    const brotli = await getBrotli();
    const bytes = fromBase64Url(compressed);
    const decompressed = brotli.decompress(bytes);
    return new TextDecoder().decode(decompressed);
  } catch {
    return null;
  }
}

/**
 * Build a full shareable URL for the given markdown content.
 * Format: /markdown/view#brotli:<base64url>
 */
export async function buildShareableUrl(markdown: string, baseUrl: string): Promise<string> {
  const compressed = await compressMarkdown(markdown);
  return `${baseUrl}/markdown/view#brotli:${compressed}`;
}

/**
 * Extract the compressed payload from the URL hash.
 * Expected format: #brotli:<data>
 */
export function extractCompressedFromHash(hash: string): string {
  if (hash.startsWith('#brotli:')) {
    return hash.slice('#brotli:'.length);
  }
  return '';
}

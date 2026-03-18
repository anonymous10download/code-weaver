import { deflateRaw, inflateRaw } from 'pako';

// ── helpers ────────────────────────────────────────────────────

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
 * Uses pako deflateRaw + base64url.
 */
export function compressMarkdown(markdown: string): string {
  const compressed = deflateRaw(new TextEncoder().encode(markdown));
  return toBase64Url(compressed);
}

/**
 * Decompress a base64url string back into markdown.
 */
export function decompressMarkdown(compressed: string): string | null {
  try {
    const bytes = fromBase64Url(compressed);
    const decompressed = inflateRaw(bytes);
    return new TextDecoder().decode(decompressed);
  } catch {
    return null;
  }
}

/**
 * Build a full shareable URL for the given markdown content.
 * Format inspired by mermaid.live: /markdown/view#pako:<base64url>
 */
export function buildShareableUrl(markdown: string, baseUrl: string): string {
  const compressed = compressMarkdown(markdown);
  return `${baseUrl}/markdown/view#pako:${compressed}`;
}

/**
 * Extract the compressed payload from the URL hash.
 * Expected format: #pako:<data>
 */
export function extractCompressedFromHash(hash: string): string {
  if (hash.startsWith('#pako:')) {
    return hash.slice('#pako:'.length);
  }
  return '';
}

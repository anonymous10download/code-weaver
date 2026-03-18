import LZString from 'lz-string';

/**
 * Compress markdown text into a URL-safe string using LZ-String.
 * Uses compressToEncodedURIComponent which produces the most compact
 * URI-safe output (base64 with URI-safe characters).
 */
export function compressMarkdown(markdown: string): string {
  return LZString.compressToEncodedURIComponent(markdown);
}

/**
 * Decompress a URL-safe string back into the original markdown text.
 */
export function decompressMarkdown(compressed: string): string | null {
  return LZString.decompressFromEncodedURIComponent(compressed);
}

/**
 * Build a full shareable URL for the given markdown content.
 */
export function buildShareableUrl(markdown: string, baseUrl: string): string {
  const compressed = compressMarkdown(markdown);
  return `${baseUrl}/markdown/view?d=${compressed}`;
}


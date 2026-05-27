export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s]+/g, '-');
}

export interface HeadingEntry {
  level: number;
  text: string;
  id: string;
}

/** Extract headings from raw markdown, skipping fenced code blocks. */
export function extractHeadings(md: string): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  let inCode = false;

  for (const line of md.split('\n')) {
    if (/^(`{3,}|~{3,})/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;

    const level = m[1].length;
    const raw = m[2]
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*\*([^*]*)\*\*\*/g, '$1')
      .replace(/\*\*([^*]*)\*\*/g, '$1')
      .replace(/\*([^*]*)\*/g, '$1')
      .replace(/___([^_]*)___/g, '$1')
      .replace(/__([^_]*)__/g, '$1')
      .replace(/_([^_]*)_/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .trim();

    headings.push({ level, text: raw, id: slugify(raw) });
  }

  return headings;
}

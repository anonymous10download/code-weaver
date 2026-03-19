/**
 * Splits mixed Markdown / HTML content into ordered segments.
 *
 * Everything inside an `<html>…</html>` block is treated as raw HTML;
 * everything else is plain Markdown.  The body content is extracted from
 * HTML blocks so we don't inject document-level tags into the page.
 */

export interface ContentSegment {
  type: 'markdown' | 'html';
  content: string;
}

const HTML_BLOCK_RE = /<html[\s\S]*?<\/html>/gi;

/** Pull the inner-body content out of an `<html>` wrapper. */
function extractBody(html: string): string {
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return (bodyMatch ? bodyMatch[1] : html).trim();
}

export function splitMixedContent(input: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  for (const match of input.matchAll(HTML_BLOCK_RE)) {
    const matchStart = match.index!;

    // Everything before this <html> block is Markdown
    if (matchStart > lastIndex) {
      const md = input.slice(lastIndex, matchStart).trim();
      if (md) segments.push({ type: 'markdown', content: md });
    }

    // The <html>…</html> block itself → extract body
    const bodyContent = extractBody(match[0]);
    if (bodyContent) segments.push({ type: 'html', content: bodyContent });

    lastIndex = matchStart + match[0].length;
  }

  // Trailing Markdown after the last HTML block (or all content if no blocks)
  if (lastIndex < input.length) {
    const md = input.slice(lastIndex).trim();
    if (md) segments.push({ type: 'markdown', content: md });
  }

  return segments;
}

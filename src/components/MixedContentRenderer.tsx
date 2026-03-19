import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo } from 'react';
import { splitMixedContent } from '@/lib/htmlSanitize';

interface MixedContentRendererProps {
  readonly content: string;
}

/**
 * Renders mixed Markdown + HTML content.
 *
 * The input is split into segments: plain Markdown is rendered via
 * ReactMarkdown (with GFM), while `<html>…</html>` blocks are rendered
 * as native HTML via dangerouslySetInnerHTML so every tag is preserved.
 */
export function MixedContentRenderer({ content }: MixedContentRendererProps) {
  const segments = useMemo(() => splitMixedContent(content), [content]);

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'markdown' ? (
          <ReactMarkdown key={`md-${i}-${seg.content.length}`} remarkPlugins={[remarkGfm]}>
            {seg.content}
          </ReactMarkdown>
        ) : (
          <div
            key={`html-${i}-${seg.content.length}`}
            dangerouslySetInnerHTML={{ __html: seg.content }}
          />
        ),
      )}
    </>
  );
}



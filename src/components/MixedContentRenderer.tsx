import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo, type ComponentPropsWithoutRef } from 'react';
import { splitMixedContent } from '@/lib/htmlSanitize';
import { MermaidDiagram } from '@/components/MermaidDiagram';

interface MixedContentRendererProps {
  readonly content: string;
}

/** Custom renderer: turns ```mermaid blocks into live diagrams. */
function CodeBlock({ children, className, ...rest }: ComponentPropsWithoutRef<'code'>) {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match?.[1];

  if (lang === 'mermaid') {
    const chart = String(children).replace(/\n$/, '');
    return <MermaidDiagram chart={chart} />;
  }

  return (
    <code className={className} {...rest}>
      {children}
    </code>
  );
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
          <ReactMarkdown
            key={`md-${i}-${seg.content.length}`}
            remarkPlugins={[remarkGfm]}
            components={{ code: CodeBlock }}
          >
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



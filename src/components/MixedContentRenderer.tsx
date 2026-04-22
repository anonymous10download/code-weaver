import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import React, { useMemo, useState, type ComponentPropsWithoutRef } from 'react';
import { splitMixedContent } from '@/lib/htmlSanitize';
import { MermaidDiagram } from '@/components/MermaidDiagram';
import { Copy, Check } from 'lucide-react';

interface MixedContentRendererProps {
  readonly content: string;
}

/** Copy button for code blocks */
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title="Copy code"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Custom renderer: turns ```mermaid blocks into live diagrams and adds copy button to code blocks. */
function CodeBlock({ children, className, ...rest }: ComponentPropsWithoutRef<'code'>) {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match?.[1];

  if (lang === 'mermaid') {
    const chart = String(children).replace(/\n$/, '');
    return <MermaidDiagram chart={chart} />;
  }

  // If this is a fenced code block (has a language class), wrap with copy button
  if (lang) {
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  }

  return (
    <code className={className} {...rest}>
      {children}
    </code>
  );
}

/** Wraps <pre> blocks with a copy button */
function PreBlock({ children, ...rest }: ComponentPropsWithoutRef<'pre'>) {
  // Extract text content from children for copy
  const getTextContent = (node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(getTextContent).join('');
    if (node && typeof node === 'object' && 'props' in (node as object)) {
      return getTextContent((node as React.ReactElement).props.children);
    }
    return '';
  };

  const code = getTextContent(children).replace(/\n$/, '');

  return (
    <div className="relative group">
      <CopyButton code={code} />
      <pre {...rest}>{children}</pre>
    </div>
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
            components={{ code: CodeBlock, pre: PreBlock }}
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



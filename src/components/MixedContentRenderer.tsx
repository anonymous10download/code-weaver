import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import React, { useCallback, useMemo, useState, type ComponentPropsWithoutRef } from 'react';
import { splitMixedContent } from '@/lib/htmlSanitize';
import { MermaidDiagram } from '@/components/MermaidDiagram';
import { Copy, Check, Link as LinkIcon } from 'lucide-react';

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
      data-clipboard-skip="true"
      className="absolute top-2 right-2 p-1.5 rounded bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors print:hidden"
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

/** Slugify heading text for use as an id */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s]+/g, '-');
}

/** Custom heading renderer that adds an id and a scroll-based anchor link */
function makeHeading(level: 1 | 2 | 3 | 4 | 5 | 6) {
  return function Heading({ children, ...rest }: ComponentPropsWithoutRef<'h1'>) {
    const text = React.Children.toArray(children)
      .map((c) => (typeof c === 'string' ? c : ''))
      .join('');
    const id = slugify(text);
    const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

    const handleAnchorClick = (e: React.MouseEvent) => {
      e.preventDefault();
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
      <Tag id={id} className="group flex items-center gap-2" {...rest}>
        {children}
        <a
          href={`#${id}`}
          onClick={handleAnchorClick}
          data-clipboard-skip="true"
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-muted-foreground print:hidden"
          aria-label="Link to section"
        >
          <LinkIcon className="h-4 w-4" />
        </a>
      </Tag>
    );
  };
}

const headingComponents = {
  h1: makeHeading(1),
  h2: makeHeading(2),
  h3: makeHeading(3),
  h4: makeHeading(4),
  h5: makeHeading(5),
  h6: makeHeading(6),
};

/** Custom anchor renderer: intercepts in-page hash links so they scroll instead of mutating the URL */
function AnchorLink({ href, children, ...rest }: ComponentPropsWithoutRef<'a'>) {
  if (href?.startsWith('#')) {
    const id = href.slice(1);
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    };
    return (
      <a href={href} onClick={handleClick} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
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

  /**
   * Sanitize copy payload so it pastes cleanly into Word, Confluence, Jira,
   * email, etc. The default browser behaviour serializes the entire selected
   * DOM — including action overlays, heading anchor SVG icons, etc. — which
   * can cause target apps to drop inline images or wrap the whole paste in
   * a code macro.
   *
   * We intercept `copy`, clone the selected range, strip elements flagged
   * as non-copyable, and write the cleaned HTML + plain-text payload to the
   * clipboard. Diagram <img> tags now use real HTTP(S) URLs (see
   * `MermaidDiagram`) so Confluence / Jira fetch and attach them through
   * their normal image-paste path — no `ClipboardItem` PNG-blob hack needed.
   */
  const handleCopy = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    const wrapper = document.createElement('div');
    wrapper.appendChild(fragment);

    // Drop elements flagged as non-copyable (heading anchor icons, code copy
    // buttons, …).
    wrapper.querySelectorAll('[data-clipboard-skip]').forEach((el) => el.remove());

    const html = wrapper.innerHTML;
    const text = wrapper.textContent ?? '';
    if (!html && !text) return;

    e.preventDefault();
    e.clipboardData.setData('text/html', html);
    e.clipboardData.setData('text/plain', text);
  }, []);

  return (
    <div onCopy={handleCopy}>
      {segments.map((seg, i) =>
        seg.type === 'markdown' ? (
          <ReactMarkdown
            key={`md-${i}-${seg.content.length}`}
            remarkPlugins={[remarkGfm]}
            components={{ code: CodeBlock, pre: PreBlock, a: AnchorLink, ...headingComponents }}
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
    </div>
  );
}



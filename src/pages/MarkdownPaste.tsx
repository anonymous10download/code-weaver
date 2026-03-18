import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardPaste, Link2, Copy, Check, Eye, ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { buildShareableUrl, compressMarkdown } from '@/lib/markdownCompression';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PLACEHOLDER = `# Hello World

Paste your **Markdown** content here and generate a shareable link.

Supports all standard Markdown:
- **Bold**, *italic*, ~~strikethrough~~
- Lists, tables, code blocks
- Links, images, headings

The content is compressed into the URL — no server needed!`;

export default function MarkdownPaste() {
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();

  const shareableUrl = useMemo(() => {
    if (!input.trim()) return '';
    return buildShareableUrl(input, globalThis.location.origin);
  }, [input]);

  const compressionStats = useMemo(() => {
    if (!input.trim()) return null;
    const original = new Blob([input]).size;
    const compressed = new Blob([compressMarkdown(input)]).size;
    const ratio = ((1 - compressed / original) * 100).toFixed(1);
    return { original, compressed, ratio };
  }, [input]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
      toast({ title: 'Pasted!', description: 'Content pasted from clipboard' });
    } catch {
      toast({
        title: 'Paste failed',
        description: 'Could not access clipboard. Please paste manually.',
        variant: 'destructive',
      });
    }
  };

  const handleCopyLink = async () => {
    if (!shareableUrl) return;
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Shareable link copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy to clipboard.',
        variant: 'destructive',
      });
    }
  };

  const urlLength = shareableUrl.length;
  const isUrlTooLong = urlLength > 8000;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
                <img src="/logo_512_512.png" alt="Logo" className="h-8 w-8 object-contain" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Markdown Share</h1>
                <p className="text-xs text-muted-foreground">
                  Paste Markdown → Get a shareable link
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link to="/">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-180px)]">
          {/* Left Panel - Input */}
          <div className="flex flex-col gap-4 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between flex-shrink-0">
              <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                <ClipboardPaste className="h-4 w-4 text-muted-foreground" />
                Markdown Input
              </h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)} className="gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  {showPreview ? 'Edit' : 'Preview'}
                </Button>
                <Button variant="outline" size="sm" onClick={handlePaste} className="gap-1.5">
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Paste
                </Button>
              </div>
            </div>

            {showPreview ? (
              <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border bg-card p-6 markdown-body">
                {input.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{input}</ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground italic">Nothing to preview yet…</p>
                )}
              </div>
            ) : (
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={PLACEHOLDER}
                className="flex-1 min-h-0 resize-none font-mono text-sm bg-code-bg border-code-border focus:ring-primary/30"
              />
            )}
          </div>

          {/* Right Panel - Share Link */}
          <div className="flex flex-col gap-4 min-h-0 overflow-hidden">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2 flex-shrink-0">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              Shareable Link
            </h2>

            <div className="flex-1 min-h-0 rounded-lg border border-border bg-card overflow-hidden flex flex-col">
              {/* Link output */}
              <div className="p-4 border-b border-border flex flex-col gap-3">
                {shareableUrl ? (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={shareableUrl}
                        className="flex-1 text-xs font-mono bg-muted/50 border border-border rounded-md px-3 py-2 truncate text-foreground"
                      />
                      <Button size="sm" onClick={handleCopyLink} className="gap-1.5 shrink-0">
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                    </div>

                    {isUrlTooLong && (
                      <p className="text-xs text-destructive">
                        ⚠ URL is {urlLength.toLocaleString()} characters — some browsers may not support URLs this long. Consider shortening your content.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Enter some Markdown on the left to generate a link…
                  </p>
                )}
              </div>

              {/* Stats */}
              {compressionStats && (
                <div className="p-4 border-b border-border">
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">Compression Stats</h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="text-lg font-semibold text-foreground">{compressionStats.original.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Original bytes</p>
                    </div>
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="text-lg font-semibold text-foreground">{compressionStats.compressed.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Compressed bytes</p>
                    </div>
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="text-lg font-semibold text-primary">{compressionStats.ratio}%</p>
                      <p className="text-xs text-muted-foreground">Savings</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    URL length: {urlLength.toLocaleString()} characters
                  </p>
                </div>
              )}

              {/* Preview of rendered output */}
              <div className="flex-1 min-h-0 overflow-auto p-6">
                <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Rendered Preview
                </h3>
                <div className="markdown-body">
                  {input.trim() ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{input}</ReactMarkdown>
                  ) : (
                    <p className="text-muted-foreground italic">Rendered markdown will appear here…</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}



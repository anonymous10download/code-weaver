import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, FileText, Copy, Check, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { decompressMarkdown, extractCompressedFromHash } from '@/lib/markdownCompression';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownView() {
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const compressed = extractCompressedFromHash(location.hash);

  const markdown = useMemo(() => {
    if (!compressed) return null;
    return decompressMarkdown(compressed);
  }, [compressed]);

  const handleCopyMarkdown = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      toast({ title: 'Copied!', description: 'Markdown source copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy to clipboard.',
        variant: 'destructive',
      });
    }
  };

  const isEmpty = !compressed;
  const isCorrupt = !isEmpty && markdown === null;

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
                <h1 className="text-lg font-semibold text-foreground">Shared Markdown</h1>
                <p className="text-xs text-muted-foreground">
                  Viewing shared Markdown content
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {markdown && (
                <Button variant="outline" size="sm" onClick={handleCopyMarkdown} className="gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy Source'}
                </Button>
              )}
              <Link to="/markdown">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <PenLine className="h-3.5 w-3.5" />
                  Create New
                </Button>
              </Link>
              <Link to="/">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
            <FileText className="h-16 w-16 text-muted-foreground/40" />
            <h2 className="text-xl font-semibold text-foreground">No Content</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              This link doesn't contain any markdown data. Go create a new shareable markdown link!
            </p>
            <Link to="/markdown">
              <Button className="gap-2">
                <PenLine className="h-4 w-4" />
                Create Markdown
              </Button>
            </Link>
          </div>
        )}

        {isCorrupt && (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
            <FileText className="h-16 w-16 text-destructive/40" />
            <h2 className="text-xl font-semibold text-foreground">Invalid Link</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              The data in this link appears to be corrupted and could not be decompressed.
            </p>
            <Link to="/markdown">
              <Button className="gap-2">
                <PenLine className="h-4 w-4" />
                Create New
              </Button>
            </Link>
          </div>
        )}

        {markdown && (
          <div className="max-w-3xl mx-auto">
            <div className="rounded-lg border border-border bg-card p-8 markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}


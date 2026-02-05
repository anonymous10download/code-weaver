import { Copy, Check, FileCode2, Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ParsedFile } from '@/lib/codeParser';

interface CodePreviewProps {
  file: ParsedFile | null;
}

export function CodePreview({ file }: CodePreviewProps) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    if (!file) return;
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!file) return;
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() || 'file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  if (!file) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <FileCode2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a file to preview</p>
        </div>
      </div>
    );
  }
  
  const lines = file.content.split('\n');
  
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-file-icon" />
          <span className="font-mono text-sm text-foreground">{file.path}</span>
          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">
            {file.language}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleDownload}
            className="h-7 gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleCopy}
            className="h-7 gap-1.5"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </Button>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 overflow-auto">
        <pre className="p-4 text-sm font-mono leading-relaxed">
          <code>
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="inline-block w-12 flex-shrink-0 text-right pr-4 text-muted-foreground select-none opacity-50">
                  {i + 1}
                </span>
                <span className="flex-1 whitespace-pre-wrap break-all">{line || ' '}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

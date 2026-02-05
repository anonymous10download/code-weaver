import { useState, useMemo } from 'react';
import { Download, FileCode, FolderTree, Sparkles, ClipboardPaste } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileTree } from '@/components/FileTree';
import { CodePreview } from '@/components/CodePreview';
import { parseGeminiOutput, ParsedFile } from '@/lib/codeParser';
import { useZipDownload } from '@/hooks/useZipDownload';
import { useToast } from '@/hooks/use-toast';

const PLACEHOLDER_TEXT = `Paste your Gemini Pro code output here...

Supported formats:

1. First line comment:
\`\`\`typescript
// parser.ts
export function test() {}
\`\`\`

2. Explicit path in block header:
\`\`\`typescript:src/utils/helper.ts
const x = 1;
\`\`\`

3. Preceding text with bold filename:
Create a file named **components/Button.tsx**:
\`\`\`tsx
export const Button = () => <button />;
\`\`\`

4. Markdown header with backticks:
#### \`components/ConfigPreview.tsx\`
\`\`\`tsx
export function ConfigPreview() {}
\`\`\``;

export default function Index() {
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<ParsedFile | null>(null);
  const { downloadAsZip } = useZipDownload();
  const { toast } = useToast();

  const parsed = useMemo(() => {
    if (!input.trim()) return { files: [], folderStructure: null };
    return parseGeminiOutput(input);
  }, [input]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
      toast({
        title: "Pasted!",
        description: "Content pasted from clipboard",
      });
    } catch {
      toast({
        title: "Paste failed",
        description: "Could not access clipboard. Please paste manually.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    if (parsed.files.length === 0) {
      toast({
        title: "No files to download",
        description: "Please paste valid Gemini code output first.",
        variant: "destructive",
      });
      return;
    }
    downloadAsZip(parsed.files, 'gemini-export');
    toast({
      title: "Download started!",
      description: `${parsed.files.length} files will be zipped and downloaded.`,
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Code Exporter</h1>
                <p className="text-xs text-muted-foreground">
                  Parse Gemini Pro output → Download as ZIP
                </p>
              </div>
            </div>
            
            <Button 
              onClick={handleDownload}
              disabled={parsed.files.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download ZIP
              {parsed.files.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary-foreground/20">
                  {parsed.files.length}
                </span>
              )}
            </Button>
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
                Gemini Output
              </h2>
              <Button variant="outline" size="sm" onClick={handlePaste} className="gap-1.5">
                <ClipboardPaste className="h-3.5 w-3.5" />
                Paste
              </Button>
            </div>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={PLACEHOLDER_TEXT}
              className="flex-1 min-h-0 resize-none font-mono text-sm bg-code-bg border-code-border focus:ring-primary/30"
            />
          </div>

          {/* Right Panel - Preview */}
          <div className="flex flex-col gap-4 min-h-0 overflow-hidden">
            <div className="flex items-center gap-4 flex-shrink-0">
              <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-muted-foreground" />
                Parsed Files
              </h2>
              {parsed.files.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {parsed.files.length} file{parsed.files.length !== 1 ? 's' : ''} found
                </span>
              )}
            </div>
            
            <div className="flex-1 min-h-0 rounded-lg border border-border bg-card overflow-hidden flex flex-col">
              {/* File Tree */}
              <div className="h-[200px] flex-shrink-0 border-b border-border overflow-auto">
                <FileTree 
                  files={parsed.files} 
                  selectedFile={selectedFile}
                  onSelectFile={setSelectedFile}
                />
              </div>
              
              {/* Code Preview */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <CodePreview file={selectedFile} />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Stats Footer */}
      {parsed.files.length > 0 && (
        <footer className="border-t border-border bg-card/30 py-3">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <FileCode className="h-3.5 w-3.5" />
                <span>{parsed.files.length} files</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FolderTree className="h-3.5 w-3.5" />
                <span>
                  {new Set(parsed.files.map(f => f.path.split('/').slice(0, -1).join('/'))).size} folders
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>
                  {parsed.files.reduce((acc, f) => acc + f.content.split('\n').length, 0)} lines
                </span>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

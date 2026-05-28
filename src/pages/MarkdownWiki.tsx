import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  FolderOpen,
  RefreshCw,
  X,
  PanelLeftClose,
  PanelLeft,
  Edit2,
  Save,
  Copy,
  Check,
  List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MixedContentRenderer } from '@/components/MixedContentRenderer';
import { cn } from '@/lib/utils';
import {
  clearLastFolder,
  ensureReadPermission,
  ensureWritePermission,
  isFileSystemAccessSupported,
  loadLastFolder,
  saveLastFolder,
} from '@/lib/wikiStorage';
import {
  findDefaultEntry,
  findFileByFileUrl,
  findFileByPath,
  readFileContent,
  writeFileContent,
  readMarkdownTree,
  resolveWikiLink,
  type WikiFileNode,
  type WikiTreeNode,
} from '@/lib/wikiFolderReader';

import { TreeView } from '@/components/wiki/TreeView';
import { OutlineView } from '@/components/wiki/OutlineView';
import { EmptyView } from '@/components/wiki/EmptyView';
import { PermissionView } from '@/components/wiki/PermissionView';
import { UnsupportedView } from '@/components/wiki/UnsupportedView';
import { extractHeadings, type HeadingEntry } from '@/lib/markdown';

const MD_LINK_RE = /\.(md|markdown|mdx)(#.*)?$/i;

type LinkKind = 'relative' | 'file-url' | 'external';

function classifyHref(href: string): LinkKind {
  if (!href || href.startsWith('#')) return 'external';
  if (/^file:\/\//i.test(href)) return 'file-url';
  if (/^[a-z]+:/i.test(href)) return 'external';
  if (href.startsWith('//')) return 'external';
  if (MD_LINK_RE.test(href)) return 'relative';
  return 'external';
}

function collectDirPaths(tree: WikiTreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of tree) {
    if (node.kind === 'dir') {
      paths.push(node.path);
      paths.push(...collectDirPaths(node.children));
    }
  }
  return paths;
}

export default function MarkdownWiki() {
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [tree, setTree] = useState<WikiTreeNode[]>([]);
  const [currentFile, setCurrentFile] = useState<WikiFileNode | null>(null);
  const [content, setContent] = useState<string>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  
  // New States
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();
  const headerVisible = useScrollDirection();
  const contentRef = useRef<HTMLDivElement>(null);

  const supported = useMemo(() => isFileSystemAccessSupported(), []);
  const headings = useMemo<HeadingEntry[]>(() => (content ? extractHeadings(content) : []), [content]);

  const loadTree = useCallback(
    async (dir: FileSystemDirectoryHandle, options?: { keepCurrentPath?: string }) => {
      setLoading(true);
      try {
        const nextTree = await readMarkdownTree(dir);
        setTree(nextTree);
        setExpanded(new Set(collectDirPaths(nextTree)));

        const keep = options?.keepCurrentPath;
        const initial = keep ? findFileByPath(nextTree, keep) : findDefaultEntry(nextTree);
        if (initial) {
          setCurrentFile(initial);
          const txt = await readFileContent(initial.handle);
          setContent(txt);
          setEditContent(txt);
        } else {
          setCurrentFile(null);
          setContent('');
          setEditContent('');
        }
      } catch (err) {
        toast({
          title: 'Failed to read folder',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      const saved = await loadLastFolder();
      if (cancelled || !saved) return;
      setHandle(saved);
      const granted = await ensureReadPermission(saved, false);
      if (granted) {
        await loadTree(saved);
      } else {
        setNeedsPermission(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported, loadTree]);

  const pickFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) return;
    try {
      const picked = await window.showDirectoryPicker({ id: 'markdown-wiki', mode: 'read' });
      setHandle(picked);
      setNeedsPermission(false);
      await saveLastFolder(picked);
      await loadTree(picked);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast({
        title: 'Could not open folder',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [loadTree, toast]);

  const grantPermission = useCallback(async () => {
    if (!handle) return;
    const granted = await ensureReadPermission(handle, true);
    if (granted) {
      setNeedsPermission(false);
      await loadTree(handle);
    } else {
      toast({
        title: 'Permission denied',
        description: 'Read access is required to display the folder.',
        variant: 'destructive',
      });
    }
  }, [handle, loadTree, toast]);

  const reload = useCallback(async () => {
    if (!handle) return;
    const granted = await ensureReadPermission(handle, true);
    if (!granted) {
      setNeedsPermission(true);
      return;
    }
    await loadTree(handle, { keepCurrentPath: currentFile?.path });
  }, [handle, loadTree, currentFile]);

  const closeFolder = useCallback(async () => {
    setHandle(null);
    setTree([]);
    setCurrentFile(null);
    setContent('');
    setEditContent('');
    setIsEditing(false);
    setNeedsPermission(false);
    await clearLastFolder();
  }, []);

  const openFile = useCallback(
    async (file: WikiFileNode) => {
      try {
        const text = await readFileContent(file.handle);
        setCurrentFile(file);
        setContent(text);
        setEditContent(text);
        setIsEditing(false);
        contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        toast({
          title: 'Failed to open file',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  const toggleFolder = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!currentFile || isEditing) return;
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      const kind = classifyHref(href);
      if (kind === 'external') return;

      let target: WikiFileNode | null = null;
      let hash = '';

      if (kind === 'relative') {
        const [pathPart, rawHash] = href.split('#');
        hash = rawHash ?? '';
        const resolved = resolveWikiLink(currentFile.path, decodeURIComponent(pathPart));
        if (!resolved) {
          e.preventDefault();
          toast({
            title: 'Link out of bounds',
            description: 'Target file is outside the selected folder.',
            variant: 'destructive',
          });
          return;
        }
        target = findFileByPath(tree, resolved);
        if (!target) {
          e.preventDefault();
          toast({
            title: 'File not found',
            description: `No markdown file at "${resolved}".`,
            variant: 'destructive',
          });
          return;
        }
      } else {
        const [urlPart, rawHash] = href.split('#');
        hash = rawHash ?? '';
        target = findFileByFileUrl(tree, urlPart);
        if (!target) return;
      }

      e.preventDefault();
      e.stopPropagation();

      void openFile(target).then(() => {
        if (hash) {
          requestAnimationFrame(() => {
            document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
          });
        }
      });
    },
    [currentFile, tree, openFile, toast, isEditing],
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setIsCopied(true);
      toast({ title: 'Copied to clipboard' });
      setTimeout(() => setIsCopied(false), 2000);
    }).catch((err) => {
      toast({
        title: 'Failed to copy',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    });
  }, [content, toast]);

  const handleSave = useCallback(async () => {
    if (!currentFile || !handle) return;
    setSaving(true);
    try {
      const granted = await ensureWritePermission(currentFile.handle, true);
      if (!granted) {
        toast({
          title: 'Permission denied',
          description: 'Write access is required to save the file.',
          variant: 'destructive',
        });
        return;
      }

      await writeFileContent(currentFile.handle, editContent);
      setContent(editContent);
      setIsEditing(false);
      toast({ title: 'File saved successfully' });
    } catch (err) {
      toast({
        title: 'Failed to save file',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [currentFile, editContent, handle, toast]);

  const breadcrumbs = currentFile ? currentFile.path.split('/') : [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header
        className={`border-b border-border bg-card/30 backdrop-blur-sm sticky top-0 z-10 transition-transform duration-300 ${
          headerVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
                <img src="/logo_512_512.png" alt="Logo" className="h-8 w-8 object-contain" />
              </div>
              <div className="min-w-0 flex items-center gap-2">
                <h1 className="text-lg font-semibold text-foreground truncate">Markdown Wiki</h1>
                {handle && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
                  >
                    {isSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground truncate hidden sm:block">
                  {handle ? handle.name : 'Browse a local folder of Markdown files'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <ThemeToggle />
              {handle && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={reload}
                    disabled={loading}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                    <span className="hidden sm:inline">Reload</span>
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={pickFolder}>
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Change Folder</span>
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={closeFolder}>
                    <X className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Close</span>
                  </Button>
                </>
              )}
              <Link to="/">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Home</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6">
        {!supported && <UnsupportedView />}

        {supported && !handle && <EmptyView onPick={pickFolder} />}

        {supported && handle && needsPermission && (
          <PermissionView name={handle.name} onGrant={grantPermission} />
        )}

        {supported && handle && !needsPermission && (
          <div className={cn(
            "grid gap-6 h-[calc(100vh-180px)] transition-all duration-300",
            isSidebarOpen && headings.length > 0 ? "grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_240px]" :
            isSidebarOpen ? "grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]" :
            headings.length > 0 ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px]" :
            "grid-cols-1 lg:grid-cols-[minmax(0,1fr)]"
          )}>
            {/* Sidebar */}
            {isSidebarOpen && (
              <aside className="rounded-lg border border-border bg-card overflow-hidden flex flex-col min-h-0 animate-in fade-in slide-in-from-left-4">
                {/* File tree section */}
                <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground shrink-0">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span className="truncate">{handle.name}</span>
                </div>
                <div className="overflow-auto py-2 flex-1 min-h-0">
                  {tree.length === 0 && !loading && (
                    <p className="px-4 py-6 text-sm text-muted-foreground italic text-center">
                      No Markdown files found in this folder.
                    </p>
                  )}
                  {tree.length > 0 && (
                    <TreeView
                      tree={tree}
                      currentPath={currentFile?.path ?? null}
                      onSelect={openFile}
                      expanded={expanded}
                      onToggle={toggleFolder}
                    />
                  )}
                </div>
              </aside>
            )}

            {/* Content pane */}
            <section className="rounded-lg border border-border bg-card overflow-hidden flex flex-col min-h-0">
              {currentFile ? (
                <>
                  <div className="px-4 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground overflow-x-auto min-h-[44px]">
                    <div className="flex items-center gap-1">
                      {breadcrumbs.map((part, idx) => (
                        <span key={idx} className="flex items-center gap-1 whitespace-nowrap">
                          {idx > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
                          <span className={idx === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''}>
                            {part}
                          </span>
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground" onClick={() => setIsEditing(false)}>
                            <X className="h-3.5 w-3.5" /> Cancel
                          </Button>
                          <Button variant="default" size="sm" className="h-7 px-2 gap-1" onClick={handleSave} disabled={saving}>
                            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground" onClick={handleCopy}>
                            {isCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />} Copy
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground" onClick={() => setIsEditing(true)}>
                            <Edit2 className="h-3.5 w-3.5" /> Edit
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    ref={contentRef}
                    onClick={handleContentClick}
                    className="flex-1 min-h-0 overflow-auto flex flex-col"
                  >
                    {isEditing ? (
                      <textarea
                        className="flex-1 w-full h-full p-8 bg-transparent border-0 resize-none outline-none font-mono text-sm leading-relaxed"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        placeholder="Start typing markdown here..."
                        spellCheck={false}
                      />
                    ) : (
                      <div className="p-8 markdown-body">
                        <MixedContentRenderer content={content} />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground italic">
                  Select a file from the sidebar to start reading.
                </div>
              )}
            </section>

            {/* Right Sidebar (TOC) */}
            {headings.length > 0 && (
              <aside className="rounded-lg border border-border bg-card overflow-hidden flex flex-col min-h-0 hidden lg:flex animate-in fade-in slide-in-from-right-4">
                <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground shrink-0">
                  <List className="h-3.5 w-3.5" />
                  <span>On this page</span>
                </div>
                <div className="flex-1 min-h-0 overflow-auto py-2">
                  <OutlineView headings={headings} contentRef={contentRef} />
                </div>
              </aside>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

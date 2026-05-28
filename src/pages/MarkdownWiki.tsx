import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  FolderOpen,
  GitBranch,
  RefreshCw,
  X,
  PanelLeftClose,
  PanelLeft,
  Edit2,
  Save,
  Copy,
  Check,
  List,
  LocateFixed,
  UnfoldVertical,
  FoldVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MixedContentRenderer } from '@/components/MixedContentRenderer';
import { cn } from '@/lib/utils';
import {
  clearLastSource,
  ensureReadPermission,
  ensureWritePermission,
  isFileSystemAccessSupported,
  loadBitbucketCredentials,
  loadLastSource,
  saveBitbucketCredentials,
  saveLastSource,
} from '@/lib/wikiStorage';
import {
  findDefaultEntry,
  findFileByFileUrl,
  findFileByPath,
  findDirByPath,
  resolveWikiLink,
  type WikiFileNode,
  type WikiDirNode,
  type WikiSource,
  type WikiTreeNode,
} from '@/lib/wikiSource';
import { LocalFolderSource } from '@/lib/localFolderSource';
import { BitbucketSource } from '@/lib/bitbucketSource';
import type { BitbucketCredentials } from '@/lib/bitbucket';

import { TreeView } from '@/components/wiki/TreeView';
import { OutlineView } from '@/components/wiki/OutlineView';
import { EmptyView } from '@/components/wiki/EmptyView';
import { PermissionView } from '@/components/wiki/PermissionView';
import { BitbucketConnectDialog } from '@/components/wiki/BitbucketConnectDialog';
import { extractHeadings, type HeadingEntry } from '@/lib/markdown';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const MD_LINK_RE = /\.(md|markdown|mdx)(#.*)?$/i;

type LinkKind = 'relative' | 'file-url' | 'external';

const IGNORED_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.tgz', '.bz2', '.7z',
  '.mp3', '.mp4', '.webm', '.ogg', '.wav',
  '.yaml', '.yml', '.json', '.txt', '.sh', '.py', '.js', '.ts', '.html', '.css', '.csv'
]);

function classifyHref(href: string): LinkKind {
  if (!href || href.startsWith('#')) return 'external';
  if (/^file:\/\//i.test(href)) return 'file-url';
  if (/^[a-z]+:/i.test(href)) return 'external';
  if (href.startsWith('//')) return 'external';
  
  const [pathPart] = href.split('#');
  const lastSlashIdx = pathPart.lastIndexOf('/');
  const lastSegment = lastSlashIdx >= 0 ? pathPart.slice(lastSlashIdx + 1) : pathPart;
  
  const lastDotIdx = lastSegment.lastIndexOf('.');
  if (lastDotIdx > 0) {
    const ext = lastSegment.slice(lastDotIdx).toLowerCase();
    if (IGNORED_EXTS.has(ext)) {
      return 'external';
    }
  }
  
  return 'relative';
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
  const [source, setSource] = useState<WikiSource | null>(null);
  const [tree, setTree] = useState<WikiTreeNode[]>([]);
  const [currentFile, setCurrentFile] = useState<WikiFileNode | null>(null);
  const [content, setContent] = useState<string>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [pendingLocalHandle, setPendingLocalHandle] = useState<FileSystemDirectoryHandle | null>(
    null,
  );

  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const [folderPopup, setFolderPopup] = useState<WikiDirNode | null>(null);

  const [bbDialogOpen, setBbDialogOpen] = useState(false);
  const [bbCredentials, setBbCredentials] = useState<BitbucketCredentials | null>(null);

  const { toast } = useToast();
  const headerVisible = useScrollDirection();
  const contentRef = useRef<HTMLDivElement>(null);

  const folderSupported = useMemo(() => isFileSystemAccessSupported(), []);
  const headings = useMemo<HeadingEntry[]>(
    () => (content ? extractHeadings(content) : []),
    [content],
  );

  const loadFromSource = useCallback(
    async (src: WikiSource, options?: { keepCurrentPath?: string }) => {
      setLoading(true);
      try {
        const nextTree = await src.loadTree();
        setTree(nextTree);
        setExpanded(new Set(collectDirPaths(nextTree)));

        const keep = options?.keepCurrentPath;
        const initial = keep ? findFileByPath(nextTree, keep) : findDefaultEntry(nextTree);
        if (initial) {
          setCurrentFile(initial);
          const txt = await src.readFile(initial);
          setContent(txt);
          setEditContent(txt);
        } else {
          setCurrentFile(null);
          setContent('');
          setEditContent('');
        }
      } catch (err) {
        toast({
          title: 'Failed to load wiki',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  // Restore previously opened source on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [savedSource, savedCreds] = await Promise.all([
        loadLastSource(),
        loadBitbucketCredentials(),
      ]);
      if (cancelled) return;
      if (savedCreds) setBbCredentials(savedCreds);
      if (!savedSource) return;

      if (savedSource.kind === 'local') {
        if (!folderSupported) return;
        const granted = await ensureReadPermission(savedSource.handle, false);
        if (cancelled) return;
        if (granted) {
          const src = new LocalFolderSource(savedSource.handle);
          setSource(src);
          await loadFromSource(src);
        } else {
          setPendingLocalHandle(savedSource.handle);
        }
        return;
      }

      if (savedSource.kind === 'bitbucket') {
        if (!savedCreds) return; // can't restore without credentials
        const src = new BitbucketSource(savedCreds, {
          workspace: savedSource.workspace,
          repo: savedSource.repo,
          branch: savedSource.branch,
        });
        setSource(src);
        await loadFromSource(src);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folderSupported, loadFromSource]);

  const pickFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) return;
    try {
      const picked = await window.showDirectoryPicker({ id: 'markdown-wiki', mode: 'read' });
      const src = new LocalFolderSource(picked);
      setPendingLocalHandle(null);
      setSource(src);
      await saveLastSource({ kind: 'local', handle: picked });
      await loadFromSource(src);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast({
        title: 'Could not open folder',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [loadFromSource, toast]);

  const openBitbucketDialog = useCallback(() => {
    setBbDialogOpen(true);
  }, []);

  const connectBitbucket = useCallback(
    async (creds: BitbucketCredentials, workspace: string, repo: string, branch: string) => {
      await saveBitbucketCredentials(creds);
      setBbCredentials(creds);
      const src = new BitbucketSource(creds, { workspace, repo, branch });
      setSource(src);
      await saveLastSource({ kind: 'bitbucket', workspace, repo, branch });
      setBbDialogOpen(false);
      await loadFromSource(src);
    },
    [loadFromSource],
  );

  const grantPermission = useCallback(async () => {
    if (!pendingLocalHandle) return;
    const granted = await ensureReadPermission(pendingLocalHandle, true);
    if (granted) {
      const src = new LocalFolderSource(pendingLocalHandle);
      setSource(src);
      setPendingLocalHandle(null);
      await loadFromSource(src);
    } else {
      toast({
        title: 'Permission denied',
        description: 'Read access is required to display the folder.',
        variant: 'destructive',
      });
    }
  }, [pendingLocalHandle, loadFromSource, toast]);

  const reload = useCallback(async () => {
    if (!source) return;
    if (source instanceof LocalFolderSource) {
      const granted = await ensureReadPermission(source.rootHandle, true);
      if (!granted) {
        setPendingLocalHandle(source.rootHandle);
        setSource(null);
        return;
      }
    }
    await loadFromSource(source, { keepCurrentPath: currentFile?.path });
  }, [source, loadFromSource, currentFile]);

  const closeSource = useCallback(async () => {
    setSource(null);
    setPendingLocalHandle(null);
    setTree([]);
    setCurrentFile(null);
    setContent('');
    setEditContent('');
    setIsEditing(false);
    await clearLastSource();
  }, []);

  const openFile = useCallback(
    async (file: WikiFileNode) => {
      if (!source) return;
      setLoadingPath(file.path);
      try {
        const text = await source.readFile(file);
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
      } finally {
        setLoadingPath(null);
      }
    },
    [source, toast],
  );

  const toggleFolder = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const allPaths = useMemo(() => collectDirPaths(tree), [tree]);

  const expandAll = useCallback(() => {
    setExpanded(new Set(allPaths));
  }, [allPaths]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const locateCurrentFile = useCallback(() => {
    if (!currentFile) return;
    const parts = currentFile.path.split('/');
    setExpanded((prev) => {
      const next = new Set(prev);
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        next.add(current);
      }
      return next;
    });
  }, [currentFile]);

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
            description: 'Target file is outside the wiki root.',
            variant: 'destructive',
          });
          return;
        }
        
        target = findFileByPath(tree, resolved);
        
        if (!target) {
          const extensions = ['.md', '.markdown', '.mdx'];
          for (const ext of extensions) {
            target = findFileByPath(tree, resolved + ext);
            if (target) break;
          }
        }
        
        if (!target) {
          const dirTarget = findDirByPath(tree, resolved);
          if (dirTarget) {
            e.preventDefault();
            e.stopPropagation();
            setFolderPopup(dirTarget);
            return;
          }
        }
        
        if (!target) {
          target = findFileByPath(tree, resolved + '/README.md') || findFileByPath(tree, resolved + '/index.md');
        }

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
    navigator.clipboard
      .writeText(content)
      .then(() => {
        setIsCopied(true);
        toast({ title: 'Copied to clipboard' });
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err) => {
        toast({
          title: 'Failed to copy',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      });
  }, [content, toast]);

  const handleSave = useCallback(async () => {
    if (!currentFile || !source || !source.canWrite || !source.writeFile) return;
    setSaving(true);
    try {
      if (source instanceof LocalFolderSource) {
        const fileHandle = currentFile.ref as FileSystemFileHandle;
        const granted = await ensureWritePermission(fileHandle, true);
        if (!granted) {
          toast({
            title: 'Permission denied',
            description: 'Write access is required to save the file.',
            variant: 'destructive',
          });
          return;
        }
      }

      await source.writeFile(currentFile, editContent);
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
  }, [currentFile, editContent, source, toast]);

  const breadcrumbs = currentFile ? currentFile.path.split('/') : [];
  const sourceIcon =
    source?.kind === 'bitbucket' ? (
      <GitBranch className="h-3.5 w-3.5" />
    ) : (
      <BookOpen className="h-3.5 w-3.5" />
    );

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
                {source && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                  >
                    {isSidebarOpen ? (
                      <PanelLeftClose className="h-4 w-4" />
                    ) : (
                      <PanelLeft className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground truncate hidden sm:block">
                  {source ? source.label : 'Browse local markdown or a Bitbucket repository'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <ThemeToggle />
              {source && (
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
                  {source.kind === 'local' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={pickFolder}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Change Folder</span>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={openBitbucketDialog}
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Change Repo</span>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={closeSource}>
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
        {!source && pendingLocalHandle && (
          <PermissionView name={pendingLocalHandle.name} onGrant={grantPermission} />
        )}

        {!source && !pendingLocalHandle && (
          <EmptyView
            onPickFolder={pickFolder}
            onConnectBitbucket={openBitbucketDialog}
            folderSupported={folderSupported}
          />
        )}

        {source && (
          <div
            className={cn(
              'grid gap-6 h-[calc(100vh-180px)] transition-all duration-300',
              isSidebarOpen && headings.length > 0
                ? 'grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_240px]'
                : isSidebarOpen
                ? 'grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]'
                : headings.length > 0
                ? 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px]'
                : 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)]',
            )}
          >
            {isSidebarOpen && (
              <aside className="rounded-lg border border-border bg-card overflow-hidden flex flex-col min-h-0 animate-in fade-in slide-in-from-left-4">
                <div className="px-3 py-2 border-b border-border flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {sourceIcon}
                    <span className="truncate">{source.label}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={locateCurrentFile}
                      title="Locate current open file"
                      disabled={!currentFile}
                    >
                      <LocateFixed className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={expandAll}
                      title="Expand all folders"
                    >
                      <UnfoldVertical className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={collapseAll}
                      title="Collapse all folders"
                    >
                      <FoldVertical className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="overflow-auto py-2 flex-1 min-h-0">
                  {tree.length === 0 && !loading && (
                    <p className="px-4 py-6 text-sm text-muted-foreground italic text-center">
                      No Markdown files found.
                    </p>
                  )}
                  {tree.length > 0 && (
                    <TreeView
                      tree={tree}
                      currentPath={currentFile?.path ?? null}
                      loadingPath={loadingPath}
                      onSelect={openFile}
                      expanded={expanded}
                      onToggle={toggleFolder}
                    />
                  )}
                </div>
              </aside>
            )}

            <section className="rounded-lg border border-border bg-card overflow-hidden flex flex-col min-h-0">
              {currentFile ? (
                <>
                  <div className="px-4 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground overflow-x-auto min-h-[44px]">
                    <div className="flex items-center gap-1">
                      {breadcrumbs.map((part, idx) => (
                        <span key={idx} className="flex items-center gap-1 whitespace-nowrap">
                          {idx > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
                          <span
                            className={
                              idx === breadcrumbs.length - 1
                                ? 'text-foreground font-medium'
                                : ''
                            }
                          >
                            {part}
                          </span>
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => setIsEditing(false)}
                          >
                            <X className="h-3.5 w-3.5" /> Cancel
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 px-2 gap-1"
                            onClick={handleSave}
                            disabled={saving}
                          >
                            {saving ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}{' '}
                            Save
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground"
                            onClick={handleCopy}
                          >
                            {isCopied ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}{' '}
                            Copy
                          </Button>
                          {source.canWrite && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground"
                              onClick={() => setIsEditing(true)}
                            >
                              <Edit2 className="h-3.5 w-3.5" /> Edit
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    ref={contentRef}
                    onClick={handleContentClick}
                    className="flex-1 min-h-0 overflow-auto flex flex-col"
                  >
                    {loadingPath !== null ? (
                      <div className="flex-1 flex items-center justify-center">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : isEditing ? (
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

      <BitbucketConnectDialog
        open={bbDialogOpen}
        onOpenChange={setBbDialogOpen}
        initialCredentials={bbCredentials}
        onConnect={connectBitbucket}
      />

      <Dialog open={folderPopup !== null} onOpenChange={(open) => !open && setFolderPopup(null)}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              {folderPopup?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto mt-4 pr-2">
            {folderPopup && (
              <TreeView
                tree={folderPopup.children}
                currentPath={currentFile?.path ?? null}
                loadingPath={loadingPath}
                onSelect={(file) => {
                  setFolderPopup(null);
                  openFile(file);
                }}
                expanded={expanded}
                onToggle={toggleFolder}
              />
            )}
            {folderPopup?.children.length === 0 && (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                This folder is empty.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

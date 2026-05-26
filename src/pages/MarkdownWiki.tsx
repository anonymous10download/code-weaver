import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
  X,
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
  isFileSystemAccessSupported,
  loadLastFolder,
  saveLastFolder,
} from '@/lib/wikiStorage';
import {
  findDefaultEntry,
  findFileByFileUrl,
  findFileByPath,
  readFileContent,
  readMarkdownTree,
  resolveWikiLink,
  type WikiFileNode,
  type WikiTreeNode,
} from '@/lib/wikiFolderReader';

const MD_LINK_RE = /\.(md|markdown|mdx)(#.*)?$/i;

type LinkKind = 'relative' | 'file-url' | 'external';

function classifyHref(href: string): LinkKind {
  if (!href || href.startsWith('#')) return 'external';
  if (/^file:\/\//i.test(href)) return 'file-url';
  if (/^[a-z]+:/i.test(href)) return 'external'; // http, https, mailto, …
  if (href.startsWith('//')) return 'external';
  if (MD_LINK_RE.test(href)) return 'relative';
  return 'external';
}

interface TreeProps {
  readonly tree: WikiTreeNode[];
  readonly currentPath: string | null;
  readonly onSelect: (file: WikiFileNode) => void;
  readonly expanded: Set<string>;
  readonly onToggle: (path: string) => void;
}

function TreeView({ tree, currentPath, onSelect, expanded, onToggle }: TreeProps) {
  return (
    <ul className="text-sm">
      {tree.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          currentPath={currentPath}
          onSelect={onSelect}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

interface TreeNodeProps extends Omit<TreeProps, 'tree'> {
  readonly node: WikiTreeNode;
  readonly depth: number;
}

function TreeNode({ node, depth, currentPath, onSelect, expanded, onToggle }: TreeNodeProps) {
  const indent = { paddingLeft: `${depth * 12 + 8}px` };

  if (node.kind === 'file') {
    const active = node.path === currentPath;
    return (
      <li>
        <button
          type="button"
          onClick={() => onSelect(node)}
          style={indent}
          className={cn(
            'w-full flex items-center gap-1.5 py-1 pr-2 rounded-md transition-colors text-left',
            'hover:bg-muted/60',
            active && 'bg-primary/10 text-primary font-medium',
          )}
        >
          <span className="w-3.5 shrink-0" />
          <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="truncate">{node.name}</span>
        </button>
      </li>
    );
  }

  const isOpen = expanded.has(node.path);
  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(node.path)}
        style={indent}
        className="w-full flex items-center gap-1.5 py-1 pr-2 rounded-md hover:bg-muted/60 text-left"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        {isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-folder-icon" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-folder-icon" />
        )}
        <span className="truncate font-medium">{node.name}</span>
      </button>
      {isOpen && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              currentPath={currentPath}
              onSelect={onSelect}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
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
  const { toast } = useToast();
  const headerVisible = useScrollDirection();
  const contentRef = useRef<HTMLDivElement>(null);

  const supported = useMemo(() => isFileSystemAccessSupported(), []);

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
          setContent(await readFileContent(initial.handle));
        } else {
          setCurrentFile(null);
          setContent('');
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

  // Try to restore last-opened folder on mount.
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
      // User cancelled the picker — silent.
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
    setNeedsPermission(false);
    await clearLastFolder();
  }, []);

  const openFile = useCallback(
    async (file: WikiFileNode) => {
      try {
        const text = await readFileContent(file.handle);
        setCurrentFile(file);
        setContent(text);
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

  // Intercept clicks on links that point to markdown files inside the loaded
  // folder — both relative paths and absolute file:// URLs — and route them
  // through the wiki navigation instead of the browser.
  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!currentFile) return;
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
        // file:// URL — split off the hash, then match by path suffix.
        const [urlPart, rawHash] = href.split('#');
        hash = rawHash ?? '';
        target = findFileByFileUrl(tree, urlPart);
        if (!target) {
          // Not part of this wiki — let the browser handle it (will be blocked
          // for file:// from https origin, but we shouldn't silently swallow).
          return;
        }
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
    [currentFile, tree, openFile, toast],
  );

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
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-foreground truncate">Markdown Wiki</h1>
                <p className="text-xs text-muted-foreground truncate">
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
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 h-[calc(100vh-180px)]">
            {/* Sidebar */}
            <aside className="rounded-lg border border-border bg-card overflow-hidden flex flex-col min-h-0">
              <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                <span className="truncate">{handle.name}</span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto py-2">
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

            {/* Content pane */}
            <section className="rounded-lg border border-border bg-card overflow-hidden flex flex-col min-h-0">
              {currentFile ? (
                <>
                  <div className="px-4 py-2 border-b border-border flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto">
                    {breadcrumbs.map((part, idx) => (
                      <span key={idx} className="flex items-center gap-1 whitespace-nowrap">
                        {idx > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
                        <span className={idx === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''}>
                          {part}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div
                    ref={contentRef}
                    onClick={handleContentClick}
                    className="flex-1 min-h-0 overflow-auto p-8 markdown-body"
                  >
                    <MixedContentRenderer content={content} />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground italic">
                  Select a file from the sidebar to start reading.
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyView({ onPick }: { onPick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
      <BookOpen className="h-16 w-16 text-muted-foreground/40" />
      <h2 className="text-xl font-semibold text-foreground">Pick a folder to browse</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        Choose any local folder that contains <code>.md</code> files. The viewer will walk it,
        build a sidebar tree, and let you navigate between files like a wiki. Everything stays on
        your machine — no uploads, no server.
      </p>
      <Button onClick={onPick} className="gap-2">
        <FolderOpen className="h-4 w-4" />
        Choose Folder
      </Button>
    </div>
  );
}

function PermissionView({ name, onGrant }: { name: string; onGrant: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
      <Folder className="h-16 w-16 text-muted-foreground/40" />
      <h2 className="text-xl font-semibold text-foreground">Re-grant access</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        Browsers require you to re-authorise folder access on each session. The last folder you
        opened was <span className="font-mono text-foreground">{name}</span>.
      </p>
      <Button onClick={onGrant} className="gap-2">
        <FolderOpen className="h-4 w-4" />
        Grant Access
      </Button>
    </div>
  );
}

function UnsupportedView() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
      <BookOpen className="h-16 w-16 text-destructive/40" />
      <h2 className="text-xl font-semibold text-foreground">Browser not supported</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        The Markdown Wiki uses the File System Access API to read a folder directly from disk.
        That API is only available in Chromium-based browsers (Chrome, Edge, Brave, Opera).
        Please open this page in one of those browsers.
      </p>
      <Link to="/">
        <Button variant="outline" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Button>
      </Link>
    </div>
  );
}

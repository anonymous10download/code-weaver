import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Cloud, GitBranch, List } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { cn } from '@/lib/utils';
import {
  clearLastSource,
  ensureReadPermission,
  ensureWritePermission,
  isFileSystemAccessSupported,
  loadBitbucketCredentials,
  loadLastSource,
  loadNextcloudCredentials,
  saveBitbucketCredentials,
  saveLastSource,
  saveNextcloudCredentials,
} from '@/lib/wikiStorage';
import {
  findDefaultEntry,
  findFileByFileUrl,
  findFileByPath,
  findDirByPath,
  resolveWikiLink,
  type WikiDirNode,
  type WikiFileNode,
  type WikiSource,
  type WikiTreeNode,
} from '@/lib/wikiSource';
import { classifyHref, collectDirPaths } from '@/lib/wikiLinks';
import { LocalFolderSource } from '@/lib/localFolderSource';
import { BitbucketSource } from '@/lib/bitbucketSource';
import { NextcloudSource } from '@/lib/nextcloudSource';
import type { BitbucketCredentials } from '@/lib/bitbucket';
import { NEXTCLOUD_ENABLED, type NextcloudCredentials } from '@/lib/nextcloud';

import { OutlineView } from '@/components/wiki/OutlineView';
import { EmptyView } from '@/components/wiki/EmptyView';
import { PermissionView } from '@/components/wiki/PermissionView';
import { BitbucketConnectDialog } from '@/components/wiki/BitbucketConnectDialog';
import { NextcloudConnectDialog } from '@/components/wiki/NextcloudConnectDialog';
import { WikiHeader } from '@/components/wiki/WikiHeader';
import { WikiSidebar } from '@/components/wiki/WikiSidebar';
import { WikiContent } from '@/components/wiki/WikiContent';
import { FolderPopupDialog } from '@/components/wiki/FolderPopupDialog';
import { extractHeadings, type HeadingEntry } from '@/lib/markdown';

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

  const [ncDialogOpen, setNcDialogOpen] = useState(false);
  const [ncCredentials, setNcCredentials] = useState<NextcloudCredentials | null>(null);

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

        const keep = options?.keepCurrentPath;
        const initial = keep ? findFileByPath(nextTree, keep) : findDefaultEntry(nextTree);

        if (initial) {
          setCurrentFile(initial);
          const txt = await src.readFile(initial);
          setContent(txt);
          setEditContent(txt);

          const parts = initial.path.split('/');
          const nextExpanded = new Set<string>();
          let current = '';
          for (let i = 0; i < parts.length - 1; i++) {
            current = current ? `${current}/${parts[i]}` : parts[i];
            nextExpanded.add(current);
          }
          setExpanded(nextExpanded);
        } else {
          setCurrentFile(null);
          setContent('');
          setEditContent('');
          setExpanded(new Set());
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [savedSource, savedBbCreds, savedNcCreds] = await Promise.all([
        loadLastSource(),
        loadBitbucketCredentials(),
        NEXTCLOUD_ENABLED ? loadNextcloudCredentials() : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (savedBbCreds) setBbCredentials(savedBbCreds);
      if (savedNcCreds) setNcCredentials(savedNcCreds);
      if (!savedSource) return;
      if (savedSource.kind === 'nextcloud' && !NEXTCLOUD_ENABLED) return;

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
        if (!savedBbCreds) return;
        const src = new BitbucketSource(savedBbCreds, {
          workspace: savedSource.workspace,
          repo: savedSource.repo,
          branch: savedSource.branch,
        });
        setSource(src);
        await loadFromSource(src);
        return;
      }

      if (savedSource.kind === 'nextcloud') {
        if (!savedNcCreds) return;
        const src = new NextcloudSource(savedNcCreds, { folder: savedSource.folder });
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

  const openBitbucketDialog = useCallback(() => setBbDialogOpen(true), []);
  const openNextcloudDialog = useCallback(() => {
    if (!NEXTCLOUD_ENABLED) return;
    setNcDialogOpen(true);
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

  const connectNextcloud = useCallback(
    async (creds: NextcloudCredentials, folder: string) => {
      await saveNextcloudCredentials(creds);
      setNcCredentials(creds);
      const src = new NextcloudSource(creds, { folder });
      setSource(src);
      await saveLastSource({ kind: 'nextcloud', folder });
      setNcDialogOpen(false);
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

        const parts = file.path.split('/');
        setExpanded((prev) => {
          const next = new Set(prev);
          let current = '';
          for (let i = 0; i < parts.length - 1; i++) {
            current = current ? `${current}/${parts[i]}` : parts[i];
            next.add(current);
          }
          return next;
        });

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

  const expandAll = useCallback(() => setExpanded(new Set(allPaths)), [allPaths]);
  const collapseAll = useCallback(() => setExpanded(new Set()), []);

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
          target =
            findFileByPath(tree, resolved + '/README.md') ||
            findFileByPath(tree, resolved + '/index.md');
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

  const sourceIcon =
    source?.kind === 'bitbucket' ? (
      <GitBranch className="h-3.5 w-3.5" />
    ) : source?.kind === 'nextcloud' ? (
      <Cloud className="h-3.5 w-3.5" />
    ) : (
      <BookOpen className="h-3.5 w-3.5" />
    );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <WikiHeader
        source={source}
        isSidebarOpen={isSidebarOpen}
        headerVisible={headerVisible}
        loading={loading}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onReload={reload}
        onPickFolder={pickFolder}
        onConnectBitbucket={openBitbucketDialog}
        onConnectNextcloud={openNextcloudDialog}
        onClose={closeSource}
      />

      <main className="flex-1 container mx-auto px-4 py-6">
        {!source && pendingLocalHandle && (
          <PermissionView name={pendingLocalHandle.name} onGrant={grantPermission} />
        )}

        {!source && !pendingLocalHandle && (
          <EmptyView
            onPickFolder={pickFolder}
            onConnectBitbucket={openBitbucketDialog}
            onConnectNextcloud={openNextcloudDialog}
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
              <WikiSidebar
                tree={tree}
                currentPath={currentFile?.path ?? null}
                loadingPath={loadingPath}
                loading={loading}
                sourceLabel={source.label}
                sourceIcon={sourceIcon}
                expanded={expanded}
                hasCurrentFile={!!currentFile}
                onSelectFile={openFile}
                onToggleFolder={toggleFolder}
                onLocate={locateCurrentFile}
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
              />
            )}

            <WikiContent
              currentFile={currentFile}
              content={content}
              editContent={editContent}
              isEditing={isEditing}
              loadingPath={loadingPath}
              isCopied={isCopied}
              saving={saving}
              canWrite={source.canWrite}
              contentRef={contentRef}
              onContentClick={handleContentClick}
              onEditContentChange={setEditContent}
              onCopy={handleCopy}
              onEdit={() => setIsEditing(true)}
              onCancelEdit={() => setIsEditing(false)}
              onSave={handleSave}
            />

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

      {NEXTCLOUD_ENABLED && (
        <NextcloudConnectDialog
          open={ncDialogOpen}
          onOpenChange={setNcDialogOpen}
          initialCredentials={ncCredentials}
          onConnect={connectNextcloud}
        />
      )}

      <FolderPopupDialog
        folder={folderPopup}
        currentPath={currentFile?.path ?? null}
        loadingPath={loadingPath}
        expanded={expanded}
        onOpenChange={(open) => !open && setFolderPopup(null)}
        onSelectFile={(file) => {
          setFolderPopup(null);
          void openFile(file);
        }}
        onToggleFolder={toggleFolder}
      />
    </div>
  );
}

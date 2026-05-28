import type { ReactNode } from 'react';
import { FoldVertical, LocateFixed, UnfoldVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TreeView } from '@/components/wiki/TreeView';
import type { WikiFileNode, WikiTreeNode } from '@/lib/wikiSource';

interface Props {
  readonly tree: WikiTreeNode[];
  readonly currentPath: string | null;
  readonly loadingPath: string | null;
  readonly loading: boolean;
  readonly sourceLabel: string;
  readonly sourceIcon: ReactNode;
  readonly expanded: Set<string>;
  readonly hasCurrentFile: boolean;
  readonly onSelectFile: (file: WikiFileNode) => void;
  readonly onToggleFolder: (path: string) => void;
  readonly onLocate: () => void;
  readonly onExpandAll: () => void;
  readonly onCollapseAll: () => void;
}

export function WikiSidebar({
  tree,
  currentPath,
  loadingPath,
  loading,
  sourceLabel,
  sourceIcon,
  expanded,
  hasCurrentFile,
  onSelectFile,
  onToggleFolder,
  onLocate,
  onExpandAll,
  onCollapseAll,
}: Props) {
  return (
    <aside className="rounded-lg border border-border bg-card overflow-hidden flex flex-col min-h-0 animate-in fade-in slide-in-from-left-4">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {sourceIcon}
          <span className="truncate">{sourceLabel}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={onLocate}
            title="Locate current open file"
            disabled={!hasCurrentFile}
          >
            <LocateFixed className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={onExpandAll}
            title="Expand all folders"
          >
            <UnfoldVertical className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={onCollapseAll}
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
            currentPath={currentPath}
            loadingPath={loadingPath}
            onSelect={onSelectFile}
            expanded={expanded}
            onToggle={onToggleFolder}
          />
        )}
      </div>
    </aside>
  );
}

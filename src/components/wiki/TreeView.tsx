import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WikiFileNode, WikiTreeNode } from '@/lib/wikiSource';

interface TreeProps {
  readonly tree: WikiTreeNode[];
  readonly currentPath: string | null;
  readonly loadingPath: string | null;
  readonly onSelect: (file: WikiFileNode) => void;
  readonly expanded: Set<string>;
  readonly onToggle: (path: string) => void;
}

export function TreeView({ tree, currentPath, loadingPath, onSelect, expanded, onToggle }: TreeProps) {
  return (
    <ul className="text-sm">
      {tree.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          currentPath={currentPath}
          loadingPath={loadingPath}
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


function TreeNode({ node, depth, currentPath, loadingPath, onSelect, expanded, onToggle }: TreeNodeProps) {
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
            'w-full flex items-start gap-1.5 py-1 pr-2 rounded-md transition-colors text-left',
            'hover:bg-muted/60',
            active && 'bg-primary/10 text-primary font-medium',
          )}
        >
          <span className="w-3.5 shrink-0 mt-0.5" />
          {node.path === loadingPath ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 opacity-70 mt-0.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0 opacity-70 mt-0.5" />
          )}
          <span className="break-words min-w-0">{node.name}</span>
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
        className="w-full flex items-start gap-1.5 py-1 pr-2 rounded-md hover:bg-muted/60 text-left"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
        )}
        {isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-folder-icon mt-0.5" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-folder-icon mt-0.5" />
        )}
        <span className="break-words min-w-0 font-medium">{node.name}</span>
      </button>
      {isOpen && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              currentPath={currentPath}
              loadingPath={loadingPath}
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

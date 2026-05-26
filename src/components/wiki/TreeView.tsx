import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WikiFileNode, WikiTreeNode } from '@/lib/wikiFolderReader';

interface TreeProps {
  readonly tree: WikiTreeNode[];
  readonly currentPath: string | null;
  readonly onSelect: (file: WikiFileNode) => void;
  readonly expanded: Set<string>;
  readonly onToggle: (path: string) => void;
}

export function TreeView({ tree, currentPath, onSelect, expanded, onToggle }: TreeProps) {
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

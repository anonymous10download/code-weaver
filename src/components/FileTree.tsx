import { FileCode2, Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { ParsedFile } from '@/lib/codeParser';
import { cn } from '@/lib/utils';

interface FileTreeProps {
  files: ParsedFile[];
  selectedFile: ParsedFile | null;
  onSelectFile: (file: ParsedFile) => void;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  file?: ParsedFile;
}

function buildTree(files: ParsedFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  
  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');
      
      let node = current.find(n => n.name === part);
      
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          isFolder: !isLast,
          children: [],
          file: isLast ? file : undefined,
        };
        current.push(node);
      }
      
      current = node.children;
    }
  }
  
  // Sort: folders first, then files, alphabetically
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    }).map(node => ({
      ...node,
      children: sortNodes(node.children),
    }));
  };
  
  return sortNodes(root);
}

function TreeNodeItem({ 
  node, 
  depth = 0, 
  selectedFile, 
  onSelectFile,
  expandedFolders,
  toggleFolder,
}: { 
  node: TreeNode; 
  depth?: number;
  selectedFile: ParsedFile | null;
  onSelectFile: (file: ParsedFile) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = node.file && selectedFile?.path === node.file.path;
  
  return (
    <div>
      <button
        onClick={() => {
          if (node.isFolder) {
            toggleFolder(node.path);
          } else if (node.file) {
            onSelectFile(node.file);
          }
        }}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-md transition-colors",
          "hover:bg-muted/50",
          isSelected && "bg-primary/10 text-primary"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.isFolder ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <Folder className="h-4 w-4 text-folder-icon shrink-0" />
          </>
        ) : (
          <>
            <span className="w-3.5" />
            <FileCode2 className="h-4 w-4 text-file-icon shrink-0" />
          </>
        )}
        <span className="truncate font-mono text-xs">{node.name}</span>
      </button>
      
      {node.isFolder && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ files, selectedFile, onSelectFile }: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    // Expand all folders by default
    const folders = new Set<string>();
    for (const file of files) {
      const parts = file.path.split('/');
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join('/'));
      }
    }
    return folders;
  });
  
  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };
  
  const tree = buildTree(files);
  
  if (files.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No files parsed yet
      </div>
    );
  }
  
  return (
    <div className="py-2">
      {tree.map((node) => (
        <TreeNodeItem
          key={node.path}
          node={node}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
        />
      ))}
    </div>
  );
}

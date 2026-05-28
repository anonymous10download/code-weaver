import { FolderOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TreeView } from '@/components/wiki/TreeView';
import type { WikiDirNode, WikiFileNode } from '@/lib/wikiSource';

interface Props {
  readonly folder: WikiDirNode | null;
  readonly currentPath: string | null;
  readonly loadingPath: string | null;
  readonly expanded: Set<string>;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelectFile: (file: WikiFileNode) => void;
  readonly onToggleFolder: (path: string) => void;
}

export function FolderPopupDialog({
  folder,
  currentPath,
  loadingPath,
  expanded,
  onOpenChange,
  onSelectFile,
  onToggleFolder,
}: Props) {
  return (
    <Dialog open={folder !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            {folder?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto mt-4 pr-2">
          {folder && (
            <TreeView
              tree={folder.children}
              currentPath={currentPath}
              loadingPath={loadingPath}
              onSelect={onSelectFile}
              expanded={expanded}
              onToggle={onToggleFolder}
            />
          )}
          {folder?.children.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-4">
              This folder is empty.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

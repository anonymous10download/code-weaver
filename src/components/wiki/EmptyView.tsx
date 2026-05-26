import { BookOpen, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EmptyView({ onPick }: { onPick: () => void }) {
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

import { Folder, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PermissionView({ name, onGrant }: { name: string; onGrant: () => void }) {
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

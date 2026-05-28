import { BookOpen, FolderOpen, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  readonly onPickFolder: () => void;
  readonly onConnectBitbucket: () => void;
  readonly folderSupported: boolean;
}

export function EmptyView({ onPickFolder, onConnectBitbucket, folderSupported }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-6">
      <BookOpen className="h-16 w-16 text-muted-foreground/40" />
      <div>
        <h2 className="text-xl font-semibold text-foreground">Pick a source to browse</h2>
        <p className="text-sm text-muted-foreground max-w-md mt-2">
          Browse a local folder of <code>.md</code> files, or connect a Bitbucket Cloud
          repository to read its markdown remotely.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={onPickFolder}
          variant="outline"
          size="lg"
          className="gap-2"
          disabled={!folderSupported}
          title={folderSupported ? undefined : 'File System Access API not supported in this browser'}
        >
          <FolderOpen className="h-4 w-4" />
          Open Local Folder
        </Button>
        <Button onClick={onConnectBitbucket} size="lg" className="gap-2">
          <GitBranch className="h-4 w-4" />
          Connect Bitbucket Repo
        </Button>
      </div>
    </div>
  );
}

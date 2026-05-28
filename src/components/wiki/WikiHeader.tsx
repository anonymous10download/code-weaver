import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Cloud,
  FolderOpen,
  GitBranch,
  PanelLeft,
  PanelLeftClose,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';
import type { WikiSource } from '@/lib/wikiSource';

interface Props {
  readonly source: WikiSource | null;
  readonly isSidebarOpen: boolean;
  readonly headerVisible: boolean;
  readonly loading: boolean;
  readonly onToggleSidebar: () => void;
  readonly onReload: () => void;
  readonly onPickFolder: () => void;
  readonly onConnectBitbucket: () => void;
  readonly onConnectNextcloud: () => void;
  readonly onClose: () => void;
}

export function WikiHeader({
  source,
  isSidebarOpen,
  headerVisible,
  loading,
  onToggleSidebar,
  onReload,
  onPickFolder,
  onConnectBitbucket,
  onConnectNextcloud,
  onClose,
}: Props) {
  return (
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
            <div className="min-w-0 flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground truncate">Markdown Wiki</h1>
              {source && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={onToggleSidebar}
                  title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                >
                  {isSidebarOpen ? (
                    <PanelLeftClose className="h-4 w-4" />
                  ) : (
                    <PanelLeft className="h-4 w-4" />
                  )}
                </Button>
              )}
              <p className="text-xs text-muted-foreground truncate hidden sm:block">
                {source ? source.label : 'Browse local markdown or a remote repository'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            {source && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={onReload}
                  disabled={loading}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                  <span className="hidden sm:inline">Reload</span>
                </Button>
                {source.kind === 'local' && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={onPickFolder}>
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Change Folder</span>
                  </Button>
                )}
                {source.kind === 'bitbucket' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={onConnectBitbucket}
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Change Repo</span>
                  </Button>
                )}
                {source.kind === 'nextcloud' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={onConnectNextcloud}
                  >
                    <Cloud className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Change Folder</span>
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-1.5" onClick={onClose}>
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
  );
}

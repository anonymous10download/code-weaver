import { useCallback, useEffect, useState } from 'react';
import {
  ChevronRight,
  Cloud,
  ExternalLink,
  Folder,
  FolderOpen,
  Home,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  listChildren,
  normaliseServerUrl,
  verifyCredentials,
  type NextcloudCredentials,
  type NextcloudEntry,
} from '@/lib/nextcloud';

type Step = 'credentials' | 'pick';

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initialCredentials: NextcloudCredentials | null;
  readonly onConnect: (credentials: NextcloudCredentials, folder: string) => void | Promise<void>;
}

export function NextcloudConnectDialog({
  open,
  onOpenChange,
  initialCredentials,
  onConnect,
}: Props) {
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(initialCredentials ? 'pick' : 'credentials');
  const [creds, setCreds] = useState<NextcloudCredentials>(
    initialCredentials ?? { serverUrl: '', username: '', appPassword: '' },
  );
  const [verifying, setVerifying] = useState(false);

  const [folder, setFolder] = useState<string>('');
  const [children, setChildren] = useState<NextcloudEntry[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(initialCredentials ? 'pick' : 'credentials');
    setCreds(initialCredentials ?? { serverUrl: '', username: '', appPassword: '' });
    setFolder('');
    setChildren([]);
  }, [open, initialCredentials]);

  const loadChildren = useCallback(
    async (c: NextcloudCredentials, f: string) => {
      setLoadingChildren(true);
      try {
        const entries = await listChildren(c, f);
        setChildren(entries.filter((e) => e.isDirectory));
      } catch (err) {
        toast({
          title: 'Failed to load folders',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setLoadingChildren(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!open || step !== 'pick') return;
    void loadChildren(creds, folder);
  }, [open, step, creds, folder, loadChildren]);

  const handleVerify = async () => {
    const serverUrl = normaliseServerUrl(creds.serverUrl);
    if (!serverUrl || !creds.username || !creds.appPassword) {
      toast({
        title: 'Missing credentials',
        description: 'Server URL, username, and app password are required.',
        variant: 'destructive',
      });
      return;
    }
    const verified: NextcloudCredentials = { ...creds, serverUrl };
    setVerifying(true);
    try {
      await verifyCredentials(verified);
      setCreds(verified);
      setStep('pick');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const isCors = /cors|network error|failed to fetch|access-control/i.test(msg);
      toast({
        title: isCors ? 'CORS error — server configuration required' : 'Could not authenticate',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const enterFolder = (path: string) => {
    setFolder(path);
  };

  const goUp = () => {
    if (!folder) return;
    const parts = folder.split('/').filter(Boolean);
    parts.pop();
    setFolder(parts.join('/'));
  };

  const handleConnect = async () => {
    await onConnect(creds, folder);
  };

  const breadcrumbs = folder ? folder.split('/').filter(Boolean) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Connect Nextcloud
          </DialogTitle>
          <DialogDescription>
            {step === 'credentials'
              ? 'Enter your Nextcloud server URL, username, and an app password. Credentials stay in your browser.'
              : 'Pick the folder to use as the wiki root.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'credentials' ? (
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nc-server">Server URL</Label>
              <Input
                id="nc-server"
                type="text"
                value={creds.serverUrl}
                onChange={(e) => setCreds({ ...creds, serverUrl: e.target.value })}
                placeholder="https://nextcloud.example.com"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nc-user">Username</Label>
              <Input
                id="nc-user"
                type="text"
                value={creds.username}
                onChange={(e) => setCreds({ ...creds, username: e.target.value })}
                placeholder="your nextcloud login name"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nc-token" className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" /> App password
              </Label>
              <Input
                id="nc-token"
                type="password"
                value={creds.appPassword}
                onChange={(e) => setCreds({ ...creds, appPassword: e.target.value })}
                placeholder="App password from Security settings"
                autoComplete="off"
              />
              <a
                href="https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html#managing-devices"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 w-fit"
              >
                Create an app password in Settings → Security{' '}
                <ExternalLink className="h-3 w-3" />
              </a>
              <p className="text-xs text-muted-foreground">
                <strong>CORS required:</strong> Browsers block cross-origin WebDAV requests unless
                the server sends <code>Access-Control-Allow-Origin</code> headers.
                Your admin must add these headers for <code>/remote.php/dav/</code> in the
                nginx / Apache / openresty config — e.g.{' '}
                <code>add_header Access-Control-Allow-Origin "*";</code> and{' '}
                <code>add_header Access-Control-Allow-Headers "Authorization,Content-Type,Depth,Overwrite,Destination";</code>.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-2 py-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto min-h-[28px]">
              <button
                type="button"
                onClick={() => setFolder('')}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted/60"
              >
                <Home className="h-3.5 w-3.5" />
                <span>Home</span>
              </button>
              {breadcrumbs.map((part, idx) => (
                <span key={idx} className="flex items-center gap-1 whitespace-nowrap">
                  <ChevronRight className="h-3 w-3 opacity-50" />
                  <button
                    type="button"
                    onClick={() => setFolder(breadcrumbs.slice(0, idx + 1).join('/'))}
                    className={
                      'px-1.5 py-0.5 rounded hover:bg-muted/60 ' +
                      (idx === breadcrumbs.length - 1 ? 'text-foreground font-medium' : '')
                    }
                  >
                    {part}
                  </button>
                </span>
              ))}
            </div>

            <div className="rounded-md border border-border bg-muted/20 max-h-[40vh] overflow-auto">
              {folder && (
                <button
                  type="button"
                  onClick={goUp}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/60 text-left text-muted-foreground"
                >
                  <span className="font-mono text-xs">..</span>
                  <span>Up one level</span>
                </button>
              )}
              {loadingChildren ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                </div>
              ) : children.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground italic text-center">
                  No subfolders here.
                </p>
              ) : (
                <ul>
                  {children.map((entry) => (
                    <li key={entry.path}>
                      <button
                        type="button"
                        onClick={() => enterFolder(entry.path)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/60 text-left"
                      >
                        <Folder className="h-3.5 w-3.5 text-folder-icon shrink-0" />
                        <span className="truncate">{entry.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" />
              Selected: <code>{folder ? `/${folder}` : '/ (home)'}</code>
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === 'credentials' ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleVerify} disabled={verifying} className="gap-1.5">
                {verifying && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep('credentials')}
                className="mr-auto"
              >
                Change credentials
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleConnect}>Open</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

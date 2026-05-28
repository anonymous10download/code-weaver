import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, GitBranch, KeyRound, RefreshCw } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  listBranches,
  listRepositories,
  listWorkspaces,
  verifyCredentials,
  type BitbucketBranch,
  type BitbucketCredentials,
  type BitbucketRepository,
  type BitbucketWorkspace,
} from '@/lib/bitbucket';

type Step = 'credentials' | 'pick';

const REQUIRED_SCOPES = ['read:workspace:bitbucket', 'read:repository:bitbucket'] as const;

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initialCredentials: BitbucketCredentials | null;
  readonly onConnect: (
    credentials: BitbucketCredentials,
    workspace: string,
    repo: string,
    branch: string,
  ) => void | Promise<void>;
}

export function BitbucketConnectDialog({
  open,
  onOpenChange,
  initialCredentials,
  onConnect,
}: Props) {
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(initialCredentials ? 'pick' : 'credentials');
  const [creds, setCreds] = useState<BitbucketCredentials>(
    initialCredentials ?? { email: '', apiToken: '' },
  );
  const [verifying, setVerifying] = useState(false);

  const [workspaces, setWorkspaces] = useState<BitbucketWorkspace[]>([]);
  const [workspace, setWorkspace] = useState<string>('');
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);

  const [repositories, setRepositories] = useState<BitbucketRepository[]>([]);
  const [repo, setRepo] = useState<string>('');
  const [loadingRepos, setLoadingRepos] = useState(false);

  const [branches, setBranches] = useState<BitbucketBranch[]>([]);
  const [branch, setBranch] = useState<string>('');
  const [loadingBranches, setLoadingBranches] = useState(false);

  const [copiedScope, setCopiedScope] = useState<string | null>(null);

  const copyScope = useCallback(
    (scope: string) => {
      navigator.clipboard
        .writeText(scope)
        .then(() => {
          setCopiedScope(scope);
          setTimeout(() => setCopiedScope((s) => (s === scope ? null : s)), 1500);
        })
        .catch((err) => {
          toast({
            title: 'Could not copy',
            description: err instanceof Error ? err.message : 'Unknown error',
            variant: 'destructive',
          });
        });
    },
    [toast],
  );

  // Re-sync to incoming credentials whenever the dialog (re)opens.
  useEffect(() => {
    if (!open) return;
    setStep(initialCredentials ? 'pick' : 'credentials');
    setCreds(initialCredentials ?? { email: '', apiToken: '' });
    setWorkspaces([]);
    setWorkspace('');
    setRepositories([]);
    setRepo('');
    setBranches([]);
    setBranch('');
  }, [open, initialCredentials]);

  const loadWorkspaces = useCallback(
    async (c: BitbucketCredentials) => {
      setLoadingWorkspaces(true);
      try {
        const ws = await listWorkspaces(c);
        setWorkspaces(ws);
        if (ws.length === 1) setWorkspace(ws[0].slug);
      } catch (err) {
        toast({
          title: 'Failed to load workspaces',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setLoadingWorkspaces(false);
      }
    },
    [toast],
  );

  // When we land on the pick step, fetch workspaces.
  useEffect(() => {
    if (!open || step !== 'pick') return;
    if (workspaces.length > 0 || loadingWorkspaces) return;
    void loadWorkspaces(creds);
  }, [open, step, creds, workspaces.length, loadingWorkspaces, loadWorkspaces]);

  // When workspace changes, fetch repositories.
  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    setLoadingRepos(true);
    setRepositories([]);
    setRepo('');
    setBranches([]);
    setBranch('');
    listRepositories(creds, workspace)
      .then((repos) => {
        if (cancelled) return;
        setRepositories(repos);
      })
      .catch((err) => {
        if (cancelled) return;
        toast({
          title: 'Failed to load repositories',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingRepos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, creds, toast]);

  // When repo changes, fetch branches and pre-select the main branch.
  useEffect(() => {
    if (!workspace || !repo) return;
    let cancelled = false;
    setLoadingBranches(true);
    setBranches([]);
    setBranch('');
    listBranches(creds, workspace, repo)
      .then((bs) => {
        if (cancelled) return;
        setBranches(bs);
        const main = repositories.find((r) => r.slug === repo)?.mainBranch;
        if (main && bs.some((b) => b.name === main)) setBranch(main);
        else if (bs.length > 0) setBranch(bs[0].name);
      })
      .catch((err) => {
        if (cancelled) return;
        toast({
          title: 'Failed to load branches',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingBranches(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, repo, creds, repositories, toast]);

  const handleVerify = async () => {
    if (!creds.email || !creds.apiToken) {
      toast({
        title: 'Missing credentials',
        description: 'Both Atlassian email and API token are required.',
        variant: 'destructive',
      });
      return;
    }
    setVerifying(true);
    try {
      await verifyCredentials(creds);
      setStep('pick');
    } catch (err) {
      toast({
        title: 'Could not authenticate',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const canConnect = workspace && repo && branch;

  const handleConnect = async () => {
    if (!canConnect) return;
    await onConnect(creds, workspace, repo, branch);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Connect Bitbucket Cloud
          </DialogTitle>
          <DialogDescription>
            {step === 'credentials'
              ? 'Enter your Atlassian account email and a scoped API token. Credentials stay in your browser.'
              : 'Choose a workspace, repository, and branch.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'credentials' ? (
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bb-email">Atlassian account email</Label>
              <Input
                id="bb-email"
                type="email"
                value={creds.email}
                onChange={(e) => setCreds({ ...creds, email: e.target.value })}
                placeholder="you@example.com"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bb-token" className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" /> API token
              </Label>
              <Input
                id="bb-token"
                type="password"
                value={creds.apiToken}
                onChange={(e) => setCreds({ ...creds, apiToken: e.target.value })}
                placeholder="Scoped Atlassian API token"
                autoComplete="off"
              />
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 w-fit"
              >
                Create a scoped API token <ExternalLink className="h-3 w-3" />
              </a>
              <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-muted-foreground">
                    Required scopes — click to copy and paste into Bitbucket's scope picker:
                  </span>
                  <button
                    type="button"
                    onClick={() => copyScope(REQUIRED_SCOPES.join(' '))}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    title="Copy all scopes"
                  >
                    {copiedScope === REQUIRED_SCOPES.join(' ') ? (
                      <>
                        <Check className="h-3 w-3 text-green-500" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Copy all
                      </>
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {REQUIRED_SCOPES.map((scope) => {
                    const copied = copiedScope === scope;
                    return (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => copyScope(scope)}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-border bg-background font-mono text-[11px] hover:bg-muted/60 transition-colors"
                        title="Copy scope"
                      >
                        <span>{scope}</span>
                        {copied ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 opacity-60" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                App passwords are deprecated by Atlassian and stop working June 9, 2026.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Workspace</Label>
              <Select value={workspace} onValueChange={setWorkspace} disabled={loadingWorkspaces}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={loadingWorkspaces ? 'Loading…' : 'Select a workspace'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.slug} value={w.slug}>
                      {w.name} <span className="text-muted-foreground">({w.slug})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Repository</Label>
              <Select
                value={repo}
                onValueChange={setRepo}
                disabled={!workspace || loadingRepos}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !workspace
                        ? 'Pick a workspace first'
                        : loadingRepos
                        ? 'Loading…'
                        : 'Select a repository'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {repositories.map((r) => (
                    <SelectItem key={r.slug} value={r.slug}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Branch</Label>
              <Select value={branch} onValueChange={setBranch} disabled={!repo || loadingBranches}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !repo
                        ? 'Pick a repository first'
                        : loadingBranches
                        ? 'Loading…'
                        : 'Select a branch'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.name} value={b.name}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <Button onClick={handleConnect} disabled={!canConnect}>
                Open
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

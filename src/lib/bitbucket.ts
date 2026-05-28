/**
 * Minimal Bitbucket Cloud REST client. Auth is HTTP Basic with an Atlassian
 * account email + scoped API token. App passwords are being sunset
 * (https://www.atlassian.com/blog/bitbucket/bitbucket-cloud-transitions-to-api-tokens-enhancing-security-with-app-password-deprecation)
 * and the legacy /2.0/workspaces cross-workspace endpoint now returns 410 Gone;
 * we use /2.0/user/workspaces instead.
 *
 * Create tokens at https://id.atlassian.com/manage-profile/security/api-tokens
 * with at least `read:account` (for /user verification), `read:workspace:bitbucket`,
 * `read:repository:bitbucket`, and `read:user:bitbucket`.
 *
 * Only the endpoints needed for read-only wiki browsing are implemented.
 */

const API_BASE = 'https://api.bitbucket.org/2.0';

export interface BitbucketCredentials {
  /** Atlassian account email (the address you sign in to Atlassian with). */
  readonly email: string;
  /** Scoped API token from id.atlassian.com → Security → API tokens. */
  readonly apiToken: string;
}

export interface BitbucketWorkspace {
  readonly slug: string;
  readonly name: string;
}

export interface BitbucketRepository {
  readonly slug: string;
  readonly name: string;
  readonly fullName: string;
  readonly mainBranch: string | null;
}

export interface BitbucketBranch {
  readonly name: string;
  readonly target: string;
}

interface PagedResponse<T> {
  values: T[];
  next?: string;
}

function authHeader({ email, apiToken }: BitbucketCredentials): string {
  return 'Basic ' + btoa(`${email}:${apiToken}`);
}

async function bbFetch<T>(creds: BitbucketCredentials, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(creds),
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bitbucket ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

async function bbFetchText(creds: BitbucketCredentials, url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(creds),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bitbucket ${res.status}: ${text || res.statusText}`);
  }
  return res.text();
}

async function bbFetchAll<T>(
  creds: BitbucketCredentials,
  firstUrl: string,
): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = firstUrl;
  while (url) {
    const page: PagedResponse<T> = await bbFetch(creds, url);
    out.push(...page.values);
    url = page.next;
  }
  return out;
}

/**
 * Verify credentials with a lightweight call to /user/workspaces. We use that
 * (rather than /user) so the token only needs `read:workspace:bitbucket`, not
 * also `read:account`.
 */
export async function verifyCredentials(creds: BitbucketCredentials): Promise<void> {
  await bbFetch<unknown>(creds, `${API_BASE}/user/workspaces?pagelen=1&fields=values.workspace.slug`);
}

export async function listWorkspaces(creds: BitbucketCredentials): Promise<BitbucketWorkspace[]> {
  // The legacy /2.0/workspaces cross-workspace endpoint returns 410 Gone since
  // the cross-workspace API sunset. /2.0/user/workspaces is the documented
  // replacement; each value wraps the workspace in `{workspace: {...}}`.
  // NB: this endpoint's `sort` parameter only accepts top-level property names
  // (not `workspace.slug`), so we sort client-side instead.
  type Raw = { workspace: { slug: string; name?: string } };
  const raw = await bbFetchAll<Raw>(
    creds,
    `${API_BASE}/user/workspaces?pagelen=100` +
      `&fields=values.workspace.slug,values.workspace.name,next`,
  );
  return raw
    .filter((w) => w.workspace?.slug)
    .map((w) => ({ slug: w.workspace.slug, name: w.workspace.name ?? w.workspace.slug }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function listRepositories(
  creds: BitbucketCredentials,
  workspace: string,
): Promise<BitbucketRepository[]> {
  type Raw = {
    slug: string;
    name: string;
    full_name: string;
    mainbranch?: { name: string } | null;
  };
  const raw = await bbFetchAll<Raw>(
    creds,
    `${API_BASE}/repositories/${encodeURIComponent(workspace)}` +
      `?pagelen=100&role=member&sort=-updated_on` +
      `&fields=values.slug,values.name,values.full_name,values.mainbranch.name,next`,
  );
  return raw.map((r) => ({
    slug: r.slug,
    name: r.name,
    fullName: r.full_name,
    mainBranch: r.mainbranch?.name ?? null,
  }));
}

export async function listBranches(
  creds: BitbucketCredentials,
  workspace: string,
  repo: string,
): Promise<BitbucketBranch[]> {
  type Raw = { name: string; target: { hash: string } };
  const raw = await bbFetchAll<Raw>(
    creds,
    `${API_BASE}/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repo)}` +
      `/refs/branches?pagelen=100&fields=values.name,values.target.hash,next`,
  );
  return raw.map((b) => ({ name: b.name, target: b.target.hash }));
}

/**
 * Recursively list every entry in the repo at `ref`. Returns a flat array of
 * file paths (directories are skipped). Uses `max_depth=999` to flatten the
 * whole tree in a single (paged) request rather than walking dir-by-dir.
 */
export async function listAllFiles(
  creds: BitbucketCredentials,
  workspace: string,
  repo: string,
  ref: string,
): Promise<string[]> {
  type Raw = { path: string; type: 'commit_file' | 'commit_directory' };
  const raw = await bbFetchAll<Raw>(
    creds,
    `${API_BASE}/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repo)}` +
      `/src/${encodeURIComponent(ref)}/?pagelen=100&max_depth=999&fields=values.path,values.type,next`,
  );
  return raw.filter((e) => e.type === 'commit_file').map((e) => e.path);
}

/** Fetch raw file contents at `ref`. Path must be repo-relative, no leading slash. */
export async function getFileContent(
  creds: BitbucketCredentials,
  workspace: string,
  repo: string,
  ref: string,
  path: string,
): Promise<string> {
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return bbFetchText(
    creds,
    `${API_BASE}/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repo)}` +
      `/src/${encodeURIComponent(ref)}/${encodedPath}`,
  );
}

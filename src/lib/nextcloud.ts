/**
 * Minimal Nextcloud WebDAV client. Auth is HTTP Basic with the user's
 * username + an app password (Settings → Security → Devices & sessions →
 * "Create new app password"). The browser cannot reach a Nextcloud server
 * unless CORS allows it; many self-hosted instances don't enable CORS on
 * /remote.php/dav/. If a request fails with a CORS error, the caller should
 * surface a hint to configure the server.
 *
 * Only the endpoints needed for browsing markdown wikis are implemented:
 *  - PROPFIND (list children / list everything under a root)
 *  - GET     (file content)
 *  - PUT     (write file content, optional editing)
 */

export interface NextcloudCredentials {
  /** Base URL of the Nextcloud instance, e.g. "https://nextcloud.example.com". No trailing slash. */
  readonly serverUrl: string;
  /** Nextcloud login name. */
  readonly username: string;
  /** App password generated in Nextcloud's security settings. */
  readonly appPassword: string;
}

export interface NextcloudEntry {
  /** Display name (last path segment). */
  readonly name: string;
  /** Path relative to the user's WebDAV root, with no leading slash. */
  readonly path: string;
  readonly isDirectory: boolean;
}

function authHeader({ username, appPassword }: NextcloudCredentials): string {
  return 'Basic ' + btoa(`${username}:${appPassword}`);
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function trimLeadingSlash(path: string): string {
  return path.replace(/^\/+/, '');
}

/** Build the WebDAV URL for the user's files root + optional sub-path. */
function davUrl(creds: NextcloudCredentials, path: string): string {
  const base = trimTrailingSlash(creds.serverUrl);
  const user = encodeURIComponent(creds.username);
  const cleaned = trimLeadingSlash(path);
  const encoded = cleaned
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `${base}/remote.php/dav/files/${user}/${encoded}`;
}

async function davFetch(
  creds: NextcloudCredentials,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(creds),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok && res.status !== 207) {
    const text = await res.text().catch(() => '');
    throw new Error(`Nextcloud ${res.status}: ${text || res.statusText}`);
  }
  return res;
}

const PROPFIND_BODY =
  '<?xml version="1.0"?>' +
  '<d:propfind xmlns:d="DAV:">' +
  '<d:prop><d:resourcetype/><d:getcontenttype/></d:prop>' +
  '</d:propfind>';

/**
 * Parse a multistatus PROPFIND response into a flat list of entries. Returned
 * paths are relative to the WebDAV files root (i.e. relative to the user's
 * home), without the leading slash.
 */
function parseMultiStatus(
  xml: string,
  username: string,
): NextcloudEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const responses = Array.from(doc.getElementsByTagNameNS('DAV:', 'response'));

  const filesRoot = `/remote.php/dav/files/${encodeURIComponent(username)}/`;
  const filesRootDecoded = `/remote.php/dav/files/${username}/`;

  const out: NextcloudEntry[] = [];

  for (const resp of responses) {
    const hrefEl = resp.getElementsByTagNameNS('DAV:', 'href')[0];
    if (!hrefEl?.textContent) continue;
    const rawHref = hrefEl.textContent;

    // The href is server-relative and percent-encoded. Strip the files root
    // prefix to get the path inside the user's home.
    let pathPart = rawHref;
    try {
      // Some servers return absolute URLs; normalise both cases.
      const asUrl = new URL(rawHref, 'http://placeholder');
      pathPart = asUrl.pathname;
    } catch {
      // Already a path.
    }
    const decoded = (() => {
      try { return decodeURIComponent(pathPart); } catch { return pathPart; }
    })();

    let relative: string | null = null;
    if (decoded.startsWith(filesRootDecoded)) {
      relative = decoded.slice(filesRootDecoded.length);
    } else if (pathPart.startsWith(filesRoot)) {
      try { relative = decodeURIComponent(pathPart.slice(filesRoot.length)); } catch { relative = pathPart.slice(filesRoot.length); }
    } else {
      continue;
    }

    // Skip the root response (no relative path after stripping prefix).
    if (!relative || relative === '/' || relative === '') continue;

    const isDirectory = relative.endsWith('/');
    const trimmed = isDirectory ? relative.slice(0, -1) : relative;
    const name = trimmed.split('/').pop() ?? '';
    if (!name) continue;

    // Confirm with resourcetype when present (some servers omit trailing slash).
    let dir = isDirectory;
    const rtype = resp.getElementsByTagNameNS('DAV:', 'resourcetype')[0];
    if (rtype && rtype.getElementsByTagNameNS('DAV:', 'collection').length > 0) {
      dir = true;
    }

    out.push({ name, path: trimmed, isDirectory: dir });
  }

  return out;
}

/**
 * Verify credentials with a Depth-0 PROPFIND on the user's root.
 * Throws on failure.
 */
export async function verifyCredentials(creds: NextcloudCredentials): Promise<void> {
  const res = await davFetch(creds, davUrl(creds, ''), {
    method: 'PROPFIND',
    headers: { Depth: '0', 'Content-Type': 'application/xml' },
    body: PROPFIND_BODY,
  });
  if (res.status !== 207 && res.status !== 200) {
    throw new Error(`Nextcloud ${res.status}: unexpected response`);
  }
}

/**
 * List the immediate children of a folder (Depth: 1). Returns entries with
 * paths relative to the user's WebDAV root.
 */
export async function listChildren(
  creds: NextcloudCredentials,
  folder: string,
): Promise<NextcloudEntry[]> {
  const res = await davFetch(creds, davUrl(creds, folder), {
    method: 'PROPFIND',
    headers: { Depth: '1', 'Content-Type': 'application/xml' },
    body: PROPFIND_BODY,
  });
  const xml = await res.text();
  const entries = parseMultiStatus(xml, creds.username);
  // Drop the folder itself if it appears in the response.
  const norm = trimLeadingSlash(folder).replace(/\/+$/, '');
  return entries.filter((e) => e.path !== norm);
}

/**
 * Recursively list every entry under a folder (Depth: infinity). Many Nextcloud
 * deployments allow this; if a server rejects infinity we fall back to a
 * breadth-first walk via repeated Depth: 1 calls.
 */
export async function listAll(
  creds: NextcloudCredentials,
  folder: string,
): Promise<NextcloudEntry[]> {
  try {
    const res = await davFetch(creds, davUrl(creds, folder), {
      method: 'PROPFIND',
      headers: { Depth: 'infinity', 'Content-Type': 'application/xml' },
      body: PROPFIND_BODY,
    });
    const xml = await res.text();
    const all = parseMultiStatus(xml, creds.username);
    const norm = trimLeadingSlash(folder).replace(/\/+$/, '');
    return all.filter((e) => e.path !== norm);
  } catch (err) {
    // 403 Forbidden / 412 Precondition Failed → server disabled infinity depth.
    const message = err instanceof Error ? err.message : String(err);
    if (!/403|412|Forbidden|Precondition/i.test(message)) throw err;
    return listAllBfs(creds, folder);
  }
}

async function listAllBfs(
  creds: NextcloudCredentials,
  root: string,
): Promise<NextcloudEntry[]> {
  const out: NextcloudEntry[] = [];
  const queue: string[] = [root];
  while (queue.length > 0) {
    const folder = queue.shift()!;
    const children = await listChildren(creds, folder);
    for (const child of children) {
      out.push(child);
      if (child.isDirectory) queue.push(child.path);
    }
  }
  return out;
}

/** Fetch raw text content for a file path (relative to the WebDAV root). */
export async function getFileContent(
  creds: NextcloudCredentials,
  path: string,
): Promise<string> {
  const res = await davFetch(creds, davUrl(creds, path), { method: 'GET' });
  return res.text();
}

/** Write raw text content to a file path (relative to the WebDAV root). */
export async function putFileContent(
  creds: NextcloudCredentials,
  path: string,
  content: string,
): Promise<void> {
  await davFetch(creds, davUrl(creds, path), {
    method: 'PUT',
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    body: content,
  });
}

/** Normalise a user-typed server URL: trim, prepend https:// if scheme is missing, strip trailing slash. */
export function normaliseServerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return trimTrailingSlash(withScheme);
}

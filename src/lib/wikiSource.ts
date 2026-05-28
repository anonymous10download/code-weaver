/**
 * Source-agnostic types for the Markdown Wiki. A "wiki source" abstracts where
 * the markdown files come from — currently a local folder (via File System
 * Access API) or a remote Bitbucket Cloud repository. The page operates on
 * `WikiSource` and `WikiTreeNode` only; it should never reach into a specific
 * source's internals.
 */

export interface WikiFileNode {
  readonly kind: 'file';
  readonly name: string;
  readonly path: string;
  /** Opaque handle understood only by the owning source. */
  readonly ref: unknown;
}

export interface WikiDirNode {
  readonly kind: 'dir';
  readonly name: string;
  readonly path: string;
  readonly children: WikiTreeNode[];
}

export type WikiTreeNode = WikiFileNode | WikiDirNode;

export type WikiSourceKind = 'local' | 'bitbucket';

export interface WikiSource {
  readonly kind: WikiSourceKind;
  /** Short label for the header, e.g. folder name or `workspace/repo @ branch`. */
  readonly label: string;
  /** True if `writeFile` is implemented and safe to call. */
  readonly canWrite: boolean;
  loadTree(): Promise<WikiTreeNode[]>;
  readFile(file: WikiFileNode): Promise<string>;
  writeFile?(file: WikiFileNode, content: string): Promise<void>;
}

const MD_EXTENSIONS = ['.md', '.markdown', '.mdx'];

export function isMarkdownFile(name: string): boolean {
  const lower = name.toLowerCase();
  return MD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function sortTree(nodes: WikiTreeNode[]): WikiTreeNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    })
    .map((n) => (n.kind === 'dir' ? { ...n, children: sortTree(n.children) } : n));
}

/**
 * Resolve a relative wiki link against the current file's path. Returns the
 * normalised target path (relative to the wiki root) or null if it escapes
 * the root.
 */
export function resolveWikiLink(currentPath: string, href: string): string | null {
  const [rawPath] = href.split('#');
  if (!rawPath) return null;

  const currentParts = currentPath.split('/').slice(0, -1);
  const hrefParts = rawPath.split('/');
  const stack = [...currentParts];

  for (const part of hrefParts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (stack.length === 0) return null;
      stack.pop();
    } else {
      stack.push(part);
    }
  }

  return stack.join('/');
}

export function findFileByPath(tree: WikiTreeNode[], path: string): WikiFileNode | null {
  for (const node of tree) {
    if (node.kind === 'file' && node.path === path) return node;
    if (node.kind === 'dir') {
      const inside = findFileByPath(node.children, path);
      if (inside) return inside;
    }
  }
  return null;
}

function flattenFiles(tree: WikiTreeNode[]): WikiFileNode[] {
  const out: WikiFileNode[] = [];
  for (const node of tree) {
    if (node.kind === 'file') out.push(node);
    else out.push(...flattenFiles(node.children));
  }
  return out;
}

/**
 * Match a file:// URL (or absolute disk path) against the tree by checking
 * which file's relative path is a suffix of the URL's path. The longest
 * suffix match wins so nested files take precedence over same-named siblings.
 * Case-insensitive to play nicely with Windows.
 */
export function findFileByFileUrl(tree: WikiTreeNode[], fileUrl: string): WikiFileNode | null {
  const stripped = fileUrl.replace(/^file:\/+/, '');
  const decoded = (() => {
    try { return decodeURIComponent(stripped); } catch { return stripped; }
  })();
  const normalised = decoded.replace(/\\/g, '/').toLowerCase();

  let best: WikiFileNode | null = null;
  let bestLen = 0;
  for (const file of flattenFiles(tree)) {
    const lower = file.path.toLowerCase();
    if (normalised === lower || normalised.endsWith('/' + lower)) {
      if (lower.length > bestLen) {
        best = file;
        bestLen = lower.length;
      }
    }
  }
  return best;
}

/**
 * Try to find the conventional "index" file inside the root of the wiki —
 * README.md / index.md / Home.md. Returns the first match or the first .md
 * file in the tree.
 */
export function findDefaultEntry(tree: WikiTreeNode[]): WikiFileNode | null {
  const preferred = ['README.md', 'readme.md', 'index.md', 'Index.md', 'Home.md', 'home.md'];
  for (const name of preferred) {
    const match = tree.find((n) => n.kind === 'file' && n.name === name);
    if (match && match.kind === 'file') return match;
  }
  for (const node of tree) {
    if (node.kind === 'file') return node;
    if (node.kind === 'dir') {
      const inside = findDefaultEntry(node.children);
      if (inside) return inside;
    }
  }
  return null;
}

/**
 * Build a sorted, pruned tree from a flat list of file paths. Used by remote
 * sources that fetch all paths in one request rather than walking directories.
 * `makeRef` produces the source-specific handle for each file.
 */
export function buildTreeFromPaths(
  paths: string[],
  makeRef: (path: string) => unknown,
): WikiTreeNode[] {
  type Builder = {
    name: string;
    path: string;
    kind: 'dir';
    children: Map<string, Builder | WikiFileNode>;
  };

  const root: Builder = { name: '', path: '', kind: 'dir', children: new Map() };

  for (const fullPath of paths) {
    if (!isMarkdownFile(fullPath)) continue;
    const parts = fullPath.split('/').filter(Boolean);
    let cursor: Builder = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i];
      const path = parts.slice(0, i + 1).join('/');
      const existing = cursor.children.get(segment);
      if (existing && (existing as Builder).kind === 'dir') {
        cursor = existing as Builder;
      } else {
        const next: Builder = { name: segment, path, kind: 'dir', children: new Map() };
        cursor.children.set(segment, next);
        cursor = next;
      }
    }
    const fileName = parts[parts.length - 1];
    cursor.children.set(fileName, {
      kind: 'file',
      name: fileName,
      path: fullPath,
      ref: makeRef(fullPath),
    });
  }

  const materialise = (b: Builder): WikiTreeNode[] => {
    const out: WikiTreeNode[] = [];
    for (const child of b.children.values()) {
      if ((child as WikiFileNode).kind === 'file') {
        out.push(child as WikiFileNode);
      } else {
        const dir = child as Builder;
        const children = materialise(dir);
        if (children.length > 0) {
          out.push({ kind: 'dir', name: dir.name, path: dir.path, children });
        }
      }
    }
    return sortTree(out);
  };

  return materialise(root);
}

/**
 * Walks a FileSystemDirectoryHandle, collects all .md files into a sorted
 * tree, and provides a helper to read a file by its relative path.
 */

export interface WikiFileNode {
  readonly kind: 'file';
  readonly name: string;
  readonly path: string;
  readonly handle: FileSystemFileHandle;
}

export interface WikiDirNode {
  readonly kind: 'dir';
  readonly name: string;
  readonly path: string;
  readonly children: WikiTreeNode[];
}

export type WikiTreeNode = WikiFileNode | WikiDirNode;

const MD_EXTENSIONS = ['.md', '.markdown', '.mdx'];

function isMarkdownFile(name: string): boolean {
  const lower = name.toLowerCase();
  return MD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function sortTree(nodes: WikiTreeNode[]): WikiTreeNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    })
    .map((n) => (n.kind === 'dir' ? { ...n, children: sortTree(n.children) } : n));
}

/**
 * Recursively walks `dir`, returning a sorted tree of every directory that
 * contains (directly or transitively) at least one Markdown file. Empty
 * branches are pruned.
 */
export async function readMarkdownTree(
  dir: FileSystemDirectoryHandle,
  prefix = '',
): Promise<WikiTreeNode[]> {
  const result: WikiTreeNode[] = [];

  for await (const [name, handle] of dir.entries()) {
    // Skip hidden files/folders and common noise.
    if (name.startsWith('.') || name === 'node_modules') continue;
    const path = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === 'file') {
      if (isMarkdownFile(name)) {
        result.push({ kind: 'file', name, path, handle: handle as FileSystemFileHandle });
      }
    } else {
      const children = await readMarkdownTree(handle as FileSystemDirectoryHandle, path);
      if (children.length > 0) {
        result.push({ kind: 'dir', name, path, children });
      }
    }
  }

  return sortTree(result);
}

export async function readFileContent(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

/**
 * Resolve a relative wiki link against the current file's path. Returns the
 * normalised target path (relative to the wiki root) or null if it escapes
 * the root.
 */
export function resolveWikiLink(currentPath: string, href: string): string | null {
  // Strip query/hash for path resolution, we keep hash separately.
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

/**
 * Find a file node in the tree by exact path. Useful after resolving a
 * relative link to its absolute (wiki-root-relative) form.
 */
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
  // Fallback: deepest-first walk for the first markdown file we find.
  for (const node of tree) {
    if (node.kind === 'file') return node;
    if (node.kind === 'dir') {
      const inside = findDefaultEntry(node.children);
      if (inside) return inside;
    }
  }
  return null;
}

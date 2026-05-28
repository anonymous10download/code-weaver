/**
 * Helpers used by MarkdownWiki to classify and resolve clicked links inside
 * rendered markdown. Source-agnostic — operates on `WikiTreeNode`s.
 */

import type { WikiTreeNode } from './wikiSource';

export type LinkKind = 'relative' | 'file-url' | 'external';

const IGNORED_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.tgz', '.bz2', '.7z',
  '.mp3', '.mp4', '.webm', '.ogg', '.wav',
  '.yaml', '.yml', '.json', '.txt', '.sh', '.py', '.js', '.ts', '.html', '.css', '.csv',
]);

export function classifyHref(href: string): LinkKind {
  if (!href || href.startsWith('#')) return 'external';
  if (/^file:\/\//i.test(href)) return 'file-url';
  if (/^[a-z]+:/i.test(href)) return 'external';
  if (href.startsWith('//')) return 'external';

  const [pathPart] = href.split('#');
  const lastSlashIdx = pathPart.lastIndexOf('/');
  const lastSegment = lastSlashIdx >= 0 ? pathPart.slice(lastSlashIdx + 1) : pathPart;

  const lastDotIdx = lastSegment.lastIndexOf('.');
  if (lastDotIdx > 0) {
    const ext = lastSegment.slice(lastDotIdx).toLowerCase();
    if (IGNORED_EXTS.has(ext)) {
      return 'external';
    }
  }

  return 'relative';
}

export function collectDirPaths(tree: WikiTreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of tree) {
    if (node.kind === 'dir') {
      paths.push(node.path);
      paths.push(...collectDirPaths(node.children));
    }
  }
  return paths;
}

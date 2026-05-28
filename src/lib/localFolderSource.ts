/**
 * WikiSource backed by the File System Access API. Walks a directory handle
 * once, collects every markdown file, and reads/writes content on demand.
 */

import {
  isMarkdownFile,
  sortTree,
  type WikiFileNode,
  type WikiSource,
  type WikiTreeNode,
} from './wikiSource';

export class LocalFolderSource implements WikiSource {
  readonly kind = 'local' as const;
  readonly canWrite = true;

  constructor(private readonly root: FileSystemDirectoryHandle) {}

  get label(): string {
    return this.root.name;
  }

  get rootHandle(): FileSystemDirectoryHandle {
    return this.root;
  }

  async loadTree(): Promise<WikiTreeNode[]> {
    return walk(this.root);
  }

  async readFile(file: WikiFileNode): Promise<string> {
    const handle = expectFileHandle(file.ref);
    const f = await handle.getFile();
    return f.text();
  }

  async writeFile(file: WikiFileNode, content: string): Promise<void> {
    const handle = expectFileHandle(file.ref);
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }
}

function expectFileHandle(ref: unknown): FileSystemFileHandle {
  if (!ref || typeof ref !== 'object' || !('getFile' in (ref as object))) {
    throw new Error('Expected FileSystemFileHandle on local file node');
  }
  return ref as FileSystemFileHandle;
}

async function walk(
  dir: FileSystemDirectoryHandle,
  prefix = '',
): Promise<WikiTreeNode[]> {
  const result: WikiTreeNode[] = [];

  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const path = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === 'file') {
      if (isMarkdownFile(name)) {
        result.push({ kind: 'file', name, path, ref: handle });
      }
    } else {
      const children = await walk(handle as FileSystemDirectoryHandle, path);
      if (children.length > 0) {
        result.push({ kind: 'dir', name, path, children });
      }
    }
  }

  return sortTree(result);
}

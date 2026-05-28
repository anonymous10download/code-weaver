/**
 * WikiSource backed by a Nextcloud WebDAV root folder. The root is a path
 * inside the user's home (empty string == the whole home). One Depth:infinity
 * PROPFIND yields the entire tree; reads and writes happen lazily over HTTP.
 */

import {
  buildTreeFromPaths,
  type WikiFileNode,
  type WikiSource,
  type WikiTreeNode,
} from './wikiSource';
import {
  getFileContent,
  listAll,
  putFileContent,
  type NextcloudCredentials,
} from './nextcloud';

export interface NextcloudSourceCoordinates {
  /** Path of the chosen root inside the user's home, no leading/trailing slash. "" means the whole home. */
  readonly folder: string;
}

export class NextcloudSource implements WikiSource {
  readonly kind = 'nextcloud' as const;
  readonly canWrite = true;

  constructor(
    private readonly creds: NextcloudCredentials,
    private readonly coords: NextcloudSourceCoordinates,
  ) {}

  get label(): string {
    const host = (() => {
      try { return new URL(this.creds.serverUrl).host; } catch { return this.creds.serverUrl; }
    })();
    const folder = this.coords.folder ? `/${this.coords.folder}` : '';
    return `${host}${folder}`;
  }

  get coordinates(): NextcloudSourceCoordinates {
    return this.coords;
  }

  async loadTree(): Promise<WikiTreeNode[]> {
    const entries = await listAll(this.creds, this.coords.folder);
    const rootPrefix = this.coords.folder ? `${this.coords.folder}/` : '';

    const filePaths = entries
      .filter((e) => !e.isDirectory)
      .map((e) => {
        if (!rootPrefix) return e.path;
        return e.path.startsWith(rootPrefix) ? e.path.slice(rootPrefix.length) : e.path;
      });

    return buildTreeFromPaths(filePaths, (path) => ({ path }));
  }

  async readFile(file: WikiFileNode): Promise<string> {
    return getFileContent(this.creds, this.absolutePath(file.path));
  }

  async writeFile(file: WikiFileNode, content: string): Promise<void> {
    await putFileContent(this.creds, this.absolutePath(file.path), content);
  }

  private absolutePath(relative: string): string {
    return this.coords.folder ? `${this.coords.folder}/${relative}` : relative;
  }
}

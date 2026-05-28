/**
 * WikiSource backed by a Bitbucket Cloud repository at a specific branch.
 * Read-only: tree comes from one flat `src` listing, file contents are
 * fetched lazily on open.
 */

import {
  buildTreeFromPaths,
  type WikiFileNode,
  type WikiSource,
  type WikiTreeNode,
} from './wikiSource';
import {
  getFileContent,
  listAllFiles,
  type BitbucketCredentials,
} from './bitbucket';

export interface BitbucketSourceCoordinates {
  readonly workspace: string;
  readonly repo: string;
  readonly branch: string;
}

export class BitbucketSource implements WikiSource {
  readonly kind = 'bitbucket' as const;
  readonly canWrite = false;

  constructor(
    private readonly creds: BitbucketCredentials,
    private readonly coords: BitbucketSourceCoordinates,
  ) {}

  get label(): string {
    return `${this.coords.workspace}/${this.coords.repo} @ ${this.coords.branch}`;
  }

  get coordinates(): BitbucketSourceCoordinates {
    return this.coords;
  }

  async loadTree(): Promise<WikiTreeNode[]> {
    const paths = await listAllFiles(
      this.creds,
      this.coords.workspace,
      this.coords.repo,
      this.coords.branch,
    );
    return buildTreeFromPaths(paths, (path) => ({ path }));
  }

  async readFile(file: WikiFileNode): Promise<string> {
    return getFileContent(
      this.creds,
      this.coords.workspace,
      this.coords.repo,
      this.coords.branch,
      file.path,
    );
  }
}

/**
 * IndexedDB-backed storage for Markdown Wiki state. Persists:
 *  - the last opened source descriptor (local folder handle OR Bitbucket coords)
 *  - Bitbucket Cloud credentials (Atlassian email + scoped API token)
 *
 * The user must re-grant FS permission each session — that part the browser
 * does not persist for us.
 */

import type { BitbucketCredentials } from './bitbucket';
import type { NextcloudCredentials } from './nextcloud';

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?: string | FileSystemHandle;
    }) => Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemHandle {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  }

  interface FileSystemDirectoryHandle extends FileSystemHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    values(): AsyncIterableIterator<FileSystemHandle>;
    keys(): AsyncIterableIterator<string>;
  }

  interface FileSystemFileHandle extends FileSystemHandle {
    getFile(): Promise<File>;
    createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: string | BufferSource | Blob): Promise<void>;
    seek(position: number): Promise<void>;
    truncate(size: number): Promise<void>;
  }
}

export type StoredSource =
  | { kind: 'local'; handle: FileSystemDirectoryHandle }
  | { kind: 'bitbucket'; workspace: string; repo: string; branch: string }
  | { kind: 'nextcloud'; folder: string };

const DB_NAME = 'markdown-wiki';
const DB_VERSION = 3;
const STORE = 'handles';
const KEY_SOURCE = 'last-source';
const KEY_CREDS = 'bitbucket-credentials';
const KEY_NC_CREDS = 'nextcloud-credentials';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putValue(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getValue<T>(key: string): Promise<T | null> {
  const db = await openDb();
  const value = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}

async function deleteValue(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function saveLastSource(source: StoredSource): Promise<void> {
  return putValue(KEY_SOURCE, source);
}

export function loadLastSource(): Promise<StoredSource | null> {
  return getValue<StoredSource>(KEY_SOURCE);
}

export function clearLastSource(): Promise<void> {
  return deleteValue(KEY_SOURCE);
}

export function saveBitbucketCredentials(creds: BitbucketCredentials): Promise<void> {
  return putValue(KEY_CREDS, creds);
}

export async function loadBitbucketCredentials(): Promise<BitbucketCredentials | null> {
  const raw = await getValue<unknown>(KEY_CREDS);
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as BitbucketCredentials).email === 'string' &&
    typeof (raw as BitbucketCredentials).apiToken === 'string'
  ) {
    return raw as BitbucketCredentials;
  }
  // Drop legacy app-password records ({username, appPassword}) silently.
  if (raw) await deleteValue(KEY_CREDS);
  return null;
}

export function clearBitbucketCredentials(): Promise<void> {
  return deleteValue(KEY_CREDS);
}

export function saveNextcloudCredentials(creds: NextcloudCredentials): Promise<void> {
  return putValue(KEY_NC_CREDS, creds);
}

export async function loadNextcloudCredentials(): Promise<NextcloudCredentials | null> {
  const raw = await getValue<unknown>(KEY_NC_CREDS);
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as NextcloudCredentials).serverUrl === 'string' &&
    typeof (raw as NextcloudCredentials).username === 'string' &&
    typeof (raw as NextcloudCredentials).appPassword === 'string'
  ) {
    return raw as NextcloudCredentials;
  }
  if (raw) await deleteValue(KEY_NC_CREDS);
  return null;
}

export function clearNextcloudCredentials(): Promise<void> {
  return deleteValue(KEY_NC_CREDS);
}

/**
 * Ensure we have read permission for the given handle. Returns true if granted,
 * false otherwise. Calling `requestPermission` requires a user gesture.
 */
export async function ensureReadPermission(
  handle: FileSystemHandle,
  prompt: boolean,
): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  const current = await handle.queryPermission({ mode: 'read' });
  if (current === 'granted') return true;
  if (!prompt) return false;
  const next = await handle.requestPermission({ mode: 'read' });
  return next === 'granted';
}

/**
 * Ensure we have readwrite permission for the given handle. Returns true if granted,
 * false otherwise. Calling `requestPermission` requires a user gesture.
 */
export async function ensureWritePermission(
  handle: FileSystemHandle,
  prompt: boolean,
): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  const current = await handle.queryPermission({ mode: 'readwrite' });
  if (current === 'granted') return true;
  if (!prompt) return false;
  const next = await handle.requestPermission({ mode: 'readwrite' });
  return next === 'granted';
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

import { type Zippable, zipSync } from 'fflate';

/** A file to put in a ZIP. */
export interface ZipEntry {
  /** Name inside the archive. */
  name: string;
  /** File contents. */
  data: Uint8Array;
}

/**
 * A ZIP archive of `entries` with store-only compression (level 0): the MP4
 * or WebM clips are compressed already, so deflating them again would only
 * cost time.
 */
export function zipStored(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  const files: Zippable = {};
  for (const entry of entries) {
    files[entry.name] = [entry.data, { level: 0 }];
  }
  return zipSync(files, { level: 0 });
}

/** `zipStored` over blobs, as a `application/zip` Blob. */
export async function zipBlobs(files: readonly { name: string; blob: Blob }[]): Promise<Blob> {
  const entries = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      data: new Uint8Array(await file.blob.arrayBuffer()),
    })),
  );
  return new Blob([zipStored(entries)], { type: 'application/zip' });
}

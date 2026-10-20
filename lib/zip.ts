/**
 * A tiny ZIP reader for the browser.
 *
 * Notion exports a workspace as a ZIP file. This reader reads the central
 * directory of the archive and inflates the entries with the platform's
 * `DecompressionStream` — no third-party library required.
 */

export interface ZipEntry {
  /** The full path inside the archive. */
  path: string;
  /** The file name without the path. */
  name: string;
  /** The size of the uncompressed file. */
  size: number;
  /** Reads the contents of the entry. */
  read: () => Promise<Uint8Array>;
}

const SIGNATURE_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const SIGNATURE_CENTRAL_DIRECTORY = 0x02014b50;

const readUint16 = (view: DataView, offset: number) =>
  view.getUint16(offset, true);
const readUint32 = (view: DataView, offset: number) =>
  view.getUint32(offset, true);

const inflateRaw = async (data: Uint8Array) => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
};

/**
 * Reads every file entry of a ZIP archive.
 */
export const readZip = async (file: Blob): Promise<ZipEntry[]> => {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Find the end of the central directory.
  let eocd = -1;
  for (let offset = buffer.byteLength - 22; offset >= 0; offset -= 1) {
    if (readUint32(view, offset) === SIGNATURE_END_OF_CENTRAL_DIRECTORY) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error("This file is not a valid ZIP archive");
  }

  const entryCount = readUint16(view, eocd + 10);
  let pointer = readUint32(view, eocd + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, pointer) !== SIGNATURE_CENTRAL_DIRECTORY) break;

    const compressionMethod = readUint16(view, pointer + 10);
    const compressedSize = readUint32(view, pointer + 20);
    const size = readUint32(view, pointer + 24);
    const fileNameLength = readUint16(view, pointer + 28);
    const extraLength = readUint16(view, pointer + 30);
    const commentLength = readUint16(view, pointer + 32);
    const localHeaderOffset = readUint32(view, pointer + 42);

    const nameBytes = bytes.subarray(
      pointer + 46,
      pointer + 46 + fileNameLength,
    );
    const path = new TextDecoder().decode(nameBytes);

    // Directories end with a slash.
    if (!path.endsWith("/")) {
      const localNameLength = readUint16(view, localHeaderOffset + 26);
      const localExtraLength = readUint16(view, localHeaderOffset + 28);
      const dataOffset =
        localHeaderOffset + 30 + localNameLength + localExtraLength;

      entries.push({
        path,
        name: path.split("/").pop() ?? path,
        size,
        read: async () => {
          const raw = bytes.subarray(
            dataOffset,
            dataOffset + compressedSize,
          );
          if (compressionMethod === 0) return raw;
          if (compressionMethod === 8) return inflateRaw(raw);
          throw new Error(
            `Unsupported compression method (${compressionMethod}) in ${path}`,
          );
        },
      });
    }

    pointer += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

/** Reads a text entry. */
export const readText = async (entry: ZipEntry) =>
  new TextDecoder("utf-8").decode(await entry.read());

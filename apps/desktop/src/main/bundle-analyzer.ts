import { basename } from 'path';
import { open, writeFile, type FileHandle } from 'fs/promises';
import * as zlib from 'zlib';
import type {
  BundleAnalysis,
  BundleCategory,
  BundleCategoryKey,
  BundleEntryNode,
  BundleFileType,
  BundleManifestInfo,
  DexFileInfo,
  NativeLibAbi,
  NativeLibFile,
} from '@android-debugger/shared';

// ---------------------------------------------------------------------------
// Zip central directory reader
// APK/AAB files are standard zip archives. We only need entry metadata
// (names + sizes) plus the raw bytes of a handful of entries (dex headers,
// ELF headers, AndroidManifest.xml), so we read the central directory
// directly instead of extracting the archive.
// ---------------------------------------------------------------------------

const EOCD_SIG = 0x06054b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const ZIP64_EOCD_LOCATOR_SIG = 0x07064b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const LOCAL_HEADER_SIG = 0x04034b50;

interface ZipEntry {
  path: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

async function readExact(fh: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

async function readZipEntries(fh: FileHandle, fileSize: number): Promise<ZipEntry[]> {
  // Locate the end-of-central-directory record (22 bytes + up to 64KB comment)
  const tailLength = Math.min(fileSize, 22 + 65535);
  const tail = await readExact(fh, fileSize - tailLength, tailLength);

  let eocdPos = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIG) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos === -1) {
    throw new Error('Not a valid APK/AAB file (zip end-of-central-directory record not found)');
  }

  let entryCount: number = tail.readUInt16LE(eocdPos + 10);
  let centralDirSize: number = tail.readUInt32LE(eocdPos + 12);
  let centralDirOffset: number = tail.readUInt32LE(eocdPos + 16);

  // Zip64 support for very large archives
  if (entryCount === 0xffff || centralDirSize === 0xffffffff || centralDirOffset === 0xffffffff) {
    const eocdAbsolute = fileSize - tailLength + eocdPos;
    const locator = await readExact(fh, eocdAbsolute - 20, 20);
    if (locator.length === 20 && locator.readUInt32LE(0) === ZIP64_EOCD_LOCATOR_SIG) {
      const zip64EocdOffset = Number(locator.readBigUInt64LE(8));
      const zip64Eocd = await readExact(fh, zip64EocdOffset, 56);
      if (zip64Eocd.length === 56 && zip64Eocd.readUInt32LE(0) === ZIP64_EOCD_SIG) {
        entryCount = Number(zip64Eocd.readBigUInt64LE(32));
        centralDirSize = Number(zip64Eocd.readBigUInt64LE(40));
        centralDirOffset = Number(zip64Eocd.readBigUInt64LE(48));
      }
    }
  }

  const centralDir = await readExact(fh, centralDirOffset, centralDirSize);
  const entries: ZipEntry[] = [];
  let offset = 0;

  for (let i = 0; i < entryCount && offset + 46 <= centralDir.length; i++) {
    if (centralDir.readUInt32LE(offset) !== CENTRAL_DIR_SIG) break;

    const compressionMethod = centralDir.readUInt16LE(offset + 10);
    let compressedSize: number = centralDir.readUInt32LE(offset + 20);
    let uncompressedSize: number = centralDir.readUInt32LE(offset + 24);
    const nameLength = centralDir.readUInt16LE(offset + 28);
    const extraLength = centralDir.readUInt16LE(offset + 30);
    const commentLength = centralDir.readUInt16LE(offset + 32);
    let localHeaderOffset: number = centralDir.readUInt32LE(offset + 42);
    const path = centralDir.toString('utf8', offset + 46, offset + 46 + nameLength);

    // Zip64 extra field holds the real values for any field stored as 0xFFFFFFFF
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      let extraOffset = offset + 46 + nameLength;
      const extraEnd = extraOffset + extraLength;
      while (extraOffset + 4 <= extraEnd) {
        const fieldId = centralDir.readUInt16LE(extraOffset);
        const fieldSize = centralDir.readUInt16LE(extraOffset + 2);
        if (fieldId === 0x0001) {
          let fieldPos = extraOffset + 4;
          if (uncompressedSize === 0xffffffff) {
            uncompressedSize = Number(centralDir.readBigUInt64LE(fieldPos));
            fieldPos += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(centralDir.readBigUInt64LE(fieldPos));
            fieldPos += 8;
          }
          if (localHeaderOffset === 0xffffffff) {
            localHeaderOffset = Number(centralDir.readBigUInt64LE(fieldPos));
          }
          break;
        }
        extraOffset += 4 + fieldSize;
      }
    }

    entries.push({ path, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function inflatePrefix(compressed: Buffer, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const inflater = zlib.createInflateRaw();
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const finish = (result: Buffer) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    inflater.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total >= maxBytes) {
        const result = Buffer.concat(chunks).subarray(0, maxBytes);
        inflater.destroy();
        finish(result);
      }
    });
    inflater.on('end', () => finish(Buffer.concat(chunks).subarray(0, Math.min(total, maxBytes))));
    inflater.on('error', (err) => {
      // Truncated compressed input still yields a usable prefix
      if (total > 0) {
        finish(Buffer.concat(chunks).subarray(0, Math.min(total, maxBytes)));
      } else if (!settled) {
        settled = true;
        reject(err);
      }
    });
    inflater.end(compressed);
  });
}

/**
 * Read the first `maxBytes` decompressed bytes of an entry. Reads only as much
 * compressed data as needed, so probing headers of large entries stays cheap.
 */
async function readEntryPrefix(fh: FileHandle, entry: ZipEntry, maxBytes: number): Promise<Buffer | null> {
  const localHeader = await readExact(fh, entry.localHeaderOffset, 30);
  if (localHeader.length < 30 || localHeader.readUInt32LE(0) !== LOCAL_HEADER_SIG) {
    return null;
  }
  const nameLength = localHeader.readUInt16LE(26);
  const extraLength = localHeader.readUInt16LE(28);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;

  if (entry.compressionMethod === 0) {
    return readExact(fh, dataStart, Math.min(maxBytes, entry.uncompressedSize));
  }
  if (entry.compressionMethod === 8) {
    const wanted = maxBytes >= entry.uncompressedSize
      ? entry.compressedSize
      : Math.min(entry.compressedSize, Math.max(maxBytes * 4, 128 * 1024));
    const compressed = await readExact(fh, dataStart, wanted);
    try {
      return await inflatePrefix(compressed, Math.min(maxBytes, entry.uncompressedSize));
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Format probes: dex header, ELF header, binary AndroidManifest.xml
// ---------------------------------------------------------------------------

interface DexHeaderCounts {
  stringCount: number;
  typeCount: number;
  protoCount: number;
  fieldRefCount: number;
  methodRefCount: number;
  classCount: number;
}

function parseDexHeader(buffer: Buffer): DexHeaderCounts | null {
  if (buffer.length < 112 || buffer.toString('ascii', 0, 3) !== 'dex') {
    return null;
  }
  return {
    stringCount: buffer.readUInt32LE(56),
    typeCount: buffer.readUInt32LE(64),
    protoCount: buffer.readUInt32LE(72),
    fieldRefCount: buffer.readUInt32LE(80),
    methodRefCount: buffer.readUInt32LE(88),
    classCount: buffer.readUInt32LE(96),
  };
}

function parseElfBitness(buffer: Buffer): 32 | 64 | undefined {
  if (buffer.length < 5 || buffer[0] !== 0x7f || buffer.toString('ascii', 1, 4) !== 'ELF') {
    return undefined;
  }
  if (buffer[4] === 1) return 32;
  if (buffer[4] === 2) return 64;
  return undefined;
}

function parseAxmlStringPool(buffer: Buffer, chunkOffset: number): string[] {
  const headerSize = buffer.readUInt16LE(chunkOffset + 2);
  const stringCount = buffer.readUInt32LE(chunkOffset + 8);
  const flags = buffer.readUInt32LE(chunkOffset + 16);
  const stringsStart = buffer.readUInt32LE(chunkOffset + 20);
  const isUtf8 = (flags & 0x100) !== 0;

  const strings: string[] = [];
  for (let i = 0; i < stringCount; i++) {
    const stringOffset = buffer.readUInt32LE(chunkOffset + headerSize + i * 4);
    let pos = chunkOffset + stringsStart + stringOffset;
    if (isUtf8) {
      // UTF-8 strings store char count then byte count, each with a
      // high-bit continuation into a second byte
      if (buffer[pos] & 0x80) pos += 2;
      else pos += 1;
      let byteLength = buffer[pos];
      pos += 1;
      if (byteLength & 0x80) {
        byteLength = ((byteLength & 0x7f) << 8) | buffer[pos];
        pos += 1;
      }
      strings.push(buffer.toString('utf8', pos, pos + byteLength));
    } else {
      let charLength = buffer.readUInt16LE(pos);
      pos += 2;
      if (charLength & 0x8000) {
        charLength = ((charLength & 0x7fff) << 16) | buffer.readUInt16LE(pos);
        pos += 2;
      }
      strings.push(buffer.toString('utf16le', pos, pos + charLength * 2));
    }
  }
  return strings;
}

const AXML_TYPE_STRING = 0x03;
const AXML_TYPE_INT_DEC = 0x10;
const AXML_TYPE_INT_HEX = 0x11;

/** Extract package/version/sdk info from a compiled (binary) AndroidManifest.xml */
function parseAxmlManifest(buffer: Buffer): BundleManifestInfo | undefined {
  try {
    if (buffer.length < 8 || buffer.readUInt16LE(0) !== 0x0003) return undefined;

    let strings: string[] = [];
    const info: BundleManifestInfo = {};
    let offset = 8;

    while (offset + 8 <= buffer.length) {
      const chunkType = buffer.readUInt16LE(offset);
      const headerSize = buffer.readUInt16LE(offset + 2);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkSize < 8 || offset + chunkSize > buffer.length) break;

      if (chunkType === 0x0001) {
        strings = parseAxmlStringPool(buffer, offset);
      } else if (chunkType === 0x0102) {
        const elementName = strings[buffer.readUInt32LE(offset + headerSize + 4)];
        if (elementName === 'manifest' || elementName === 'uses-sdk') {
          const attrStart = buffer.readUInt16LE(offset + headerSize + 8);
          const attrSize = buffer.readUInt16LE(offset + headerSize + 10);
          const attrCount = buffer.readUInt16LE(offset + headerSize + 12);
          for (let i = 0; i < attrCount; i++) {
            const attrOffset = offset + headerSize + attrStart + i * attrSize;
            if (attrOffset + 20 > buffer.length) break;
            const attrName = strings[buffer.readUInt32LE(attrOffset + 4)];
            const rawValueIndex = buffer.readUInt32LE(attrOffset + 8);
            const dataType = buffer[attrOffset + 15];
            const data = buffer.readUInt32LE(attrOffset + 16);

            const stringValue =
              rawValueIndex !== 0xffffffff
                ? strings[rawValueIndex]
                : dataType === AXML_TYPE_STRING
                  ? strings[data]
                  : undefined;
            const intValue =
              dataType === AXML_TYPE_INT_DEC || dataType === AXML_TYPE_INT_HEX ? data : undefined;

            if (elementName === 'manifest') {
              if (attrName === 'package' && stringValue) info.packageName = stringValue;
              else if (attrName === 'versionCode' && intValue !== undefined) info.versionCode = intValue;
              else if (attrName === 'versionName' && stringValue) info.versionName = stringValue;
            } else {
              if (attrName === 'minSdkVersion' && intValue !== undefined) info.minSdkVersion = intValue;
              else if (attrName === 'targetSdkVersion' && intValue !== undefined) info.targetSdkVersion = intValue;
            }
          }
        }
      }
      offset += chunkSize;
    }

    return Object.keys(info).length > 0 ? info : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function buildTree(entries: ZipEntry[]): BundleEntryNode {
  const root: BundleEntryNode = {
    name: '/',
    path: '',
    isDirectory: true,
    size: 0,
    compressedSize: 0,
    children: [],
  };
  const directories = new Map<string, BundleEntryNode>([['', root]]);

  const getDirectory = (path: string): BundleEntryNode => {
    const existing = directories.get(path);
    if (existing) return existing;
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const parent = getDirectory(parentPath);
    const node: BundleEntryNode = {
      name: path.slice(path.lastIndexOf('/') + 1),
      path,
      isDirectory: true,
      size: 0,
      compressedSize: 0,
      children: [],
    };
    parent.children!.push(node);
    directories.set(path, node);
    return node;
  };

  for (const entry of entries) {
    if (entry.path.endsWith('/')) {
      getDirectory(entry.path.slice(0, -1));
      continue;
    }
    const parentPath = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    const parent = getDirectory(parentPath);
    parent.children!.push({
      name: entry.path.slice(entry.path.lastIndexOf('/') + 1),
      path: entry.path,
      isDirectory: false,
      size: entry.uncompressedSize,
      compressedSize: entry.compressedSize,
    });
    // Propagate sizes up to the root
    let directoryPath = parentPath;
    for (;;) {
      const directory = directories.get(directoryPath)!;
      directory.size += entry.uncompressedSize;
      directory.compressedSize += entry.compressedSize;
      if (directoryPath === '') break;
      directoryPath = directoryPath.includes('/') ? directoryPath.slice(0, directoryPath.lastIndexOf('/')) : '';
    }
  }

  const sortBySize = (node: BundleEntryNode) => {
    if (!node.children) return;
    node.children.sort((a, b) => b.size - a.size);
    node.children.forEach(sortBySize);
  };
  sortBySize(root);
  return root;
}

function categorize(path: string, fileType: BundleFileType): BundleCategoryKey {
  if (fileType === 'apk') {
    if (/^classes\d*\.dex$/.test(path)) return 'dex';
    if (path.startsWith('lib/')) return 'native-libs';
    if (path.startsWith('res/') || path === 'resources.arsc') return 'resources';
    if (path.startsWith('assets/')) return 'assets';
    return 'other';
  }
  // AAB paths are prefixed with the module name (base/, feature modules, ...)
  const rest = path.slice(path.indexOf('/') + 1);
  if (!path.includes('/')) return 'other';
  if (rest.startsWith('dex/') && rest.endsWith('.dex')) return 'dex';
  if (rest.startsWith('lib/')) return 'native-libs';
  if (rest.startsWith('res/') || rest === 'resources.pb') return 'resources';
  if (rest.startsWith('assets/')) return 'assets';
  return 'other';
}

const CATEGORY_LABELS: Record<BundleCategoryKey, string> = {
  dex: 'Code (DEX)',
  'native-libs': 'Native Libraries',
  resources: 'Resources',
  assets: 'Assets',
  other: 'Other',
};

function nativeLibAbi(path: string, fileType: BundleFileType): { abi: string; name: string } | null {
  const match =
    fileType === 'apk'
      ? path.match(/^lib\/([^/]+)\/(.+)$/)
      : path.match(/^[^/]+\/lib\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { abi: match[1], name: match[2] };
}

/** Extract a single entry from an APK/AAB to `destPath` */
export async function extractBundleEntry(
  bundlePath: string,
  entryPath: string,
  destPath: string
): Promise<void> {
  const fh = await open(bundlePath, 'r');
  try {
    const stat = await fh.stat();
    const entries = await readZipEntries(fh, stat.size);
    const entry = entries.find((e) => e.path === entryPath);
    if (!entry) {
      throw new Error(`Entry not found in archive: ${entryPath}`);
    }
    const data = await readEntryPrefix(fh, entry, entry.uncompressedSize);
    if (!data || data.length !== entry.uncompressedSize) {
      throw new Error(`Failed to decompress entry: ${entryPath}`);
    }
    await writeFile(destPath, data);
  } finally {
    await fh.close();
  }
}

export async function analyzeBundle(filePath: string): Promise<BundleAnalysis> {
  const fileType: BundleFileType = filePath.toLowerCase().endsWith('.aab') ? 'aab' : 'apk';
  const fh = await open(filePath, 'r');

  try {
    const stat = await fh.stat();
    const allEntries = await readZipEntries(fh, stat.size);
    const fileEntries = allEntries.filter((entry) => !entry.path.endsWith('/'));

    let rawSize = 0;
    let downloadSize = 0;
    const categoryTotals = new Map<BundleCategoryKey, BundleCategory>();
    for (const entry of fileEntries) {
      rawSize += entry.uncompressedSize;
      downloadSize += entry.compressedSize;
      const key = categorize(entry.path, fileType);
      const category = categoryTotals.get(key) ?? {
        key,
        label: CATEGORY_LABELS[key],
        size: 0,
        compressedSize: 0,
        entryCount: 0,
      };
      category.size += entry.uncompressedSize;
      category.compressedSize += entry.compressedSize;
      category.entryCount += 1;
      categoryTotals.set(key, category);
    }

    // Dex file stats from the dex header (class/method/field counts)
    const dexFiles: DexFileInfo[] = [];
    for (const entry of fileEntries) {
      if (categorize(entry.path, fileType) !== 'dex') continue;
      const header = await readEntryPrefix(fh, entry, 112);
      const counts = header ? parseDexHeader(header) : null;
      dexFiles.push({
        path: entry.path,
        size: entry.uncompressedSize,
        compressedSize: entry.compressedSize,
        classCount: counts?.classCount ?? 0,
        methodRefCount: counts?.methodRefCount ?? 0,
        fieldRefCount: counts?.fieldRefCount ?? 0,
        stringCount: counts?.stringCount ?? 0,
        typeCount: counts?.typeCount ?? 0,
        protoCount: counts?.protoCount ?? 0,
      });
    }
    dexFiles.sort((a, b) => b.size - a.size);

    // Native libraries grouped by ABI, with ELF bitness probed per .so
    const abiGroups = new Map<string, NativeLibAbi>();
    for (const entry of fileEntries) {
      const lib = nativeLibAbi(entry.path, fileType);
      if (!lib) continue;
      const group = abiGroups.get(lib.abi) ?? {
        abi: lib.abi,
        totalSize: 0,
        totalCompressedSize: 0,
        libs: [],
      };
      const libFile: NativeLibFile = {
        name: lib.name,
        path: entry.path,
        size: entry.uncompressedSize,
        compressedSize: entry.compressedSize,
      };
      if (lib.name.endsWith('.so')) {
        const elfHeader = await readEntryPrefix(fh, entry, 8);
        libFile.bitness = elfHeader ? parseElfBitness(elfHeader) : undefined;
      }
      group.totalSize += entry.uncompressedSize;
      group.totalCompressedSize += entry.compressedSize;
      group.libs.push(libFile);
      abiGroups.set(lib.abi, group);
    }
    const nativeLibs = [...abiGroups.values()].sort((a, b) => b.totalSize - a.totalSize);
    nativeLibs.forEach((group) => group.libs.sort((a, b) => b.size - a.size));

    // Manifest info (binary AXML in APKs; AABs use protobuf manifests, skipped)
    let manifest: BundleManifestInfo | undefined;
    if (fileType === 'apk') {
      const manifestEntry = fileEntries.find((entry) => entry.path === 'AndroidManifest.xml');
      if (manifestEntry) {
        const data = await readEntryPrefix(fh, manifestEntry, manifestEntry.uncompressedSize);
        if (data && data.length === manifestEntry.uncompressedSize) {
          manifest = parseAxmlManifest(data);
        }
      }
    }

    // AAB modules (top-level directories that contain a module manifest)
    let modules: string[] | undefined;
    if (fileType === 'aab') {
      modules = [
        ...new Set(
          fileEntries
            .filter((entry) => /^[^/]+\/manifest\/AndroidManifest\.xml$/.test(entry.path))
            .map((entry) => entry.path.slice(0, entry.path.indexOf('/')))
        ),
      ].sort();
    }

    const categoryOrder: BundleCategoryKey[] = ['dex', 'native-libs', 'resources', 'assets', 'other'];
    return {
      filePath,
      fileName: basename(filePath),
      fileType,
      fileSize: stat.size,
      rawSize,
      downloadSize,
      entryCount: fileEntries.length,
      root: buildTree(allEntries),
      categories: categoryOrder
        .map((key) => categoryTotals.get(key))
        .filter((category): category is BundleCategory => !!category),
      dexFiles,
      totalClassCount: dexFiles.reduce((sum, dex) => sum + dex.classCount, 0),
      totalMethodRefCount: dexFiles.reduce((sum, dex) => sum + dex.methodRefCount, 0),
      nativeLibs,
      manifest,
      modules,
    };
  } finally {
    await fh.close();
  }
}

/**
 * Build script for the md2Lark Chrome Extension.
 *
 * Uses esbuild to bundle the popup TypeScript entry point into a single
 * browser-ready JS file and copies static assets (HTML, CSS, manifest,
 * icons) into the dist/extension/ output directory.
 */

import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SRC_EXT = path.join(ROOT, 'src', 'extension');
const DIST_EXT = path.join(ROOT, 'dist', 'extension');
const DIST_ICONS = path.join(DIST_EXT, 'icons');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src: string, dest: string): void {
  fs.copyFileSync(src, dest);
  console.log(`  Copied: ${path.relative(ROOT, dest)}`);
}

/**
 * Generate a minimal 1x1 pixel PNG buffer.
 *
 * This produces the smallest valid PNG image (a single transparent pixel).
 * It is used to create placeholder icons so the extension can be loaded
 * in Chrome without errors. Real icons will replace these later.
 */
function createPlaceholderPng(): Buffer {
  // Minimal valid PNG: 1x1 pixel, RGBA, transparent
  // PNG signature + IHDR + IDAT + IEND
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  // IHDR chunk: 1x1, 8-bit RGBA
  const ihdrData = Buffer.from([
    0x00, 0x00, 0x00, 0x01, // width = 1
    0x00, 0x00, 0x00, 0x01, // height = 1
    0x08,                   // bit depth = 8
    0x06,                   // color type = RGBA
    0x00,                   // compression method
    0x00,                   // filter method
    0x00,                   // interlace method
  ]);
  const ihdr = createPngChunk('IHDR', ihdrData);

  // IDAT chunk: zlib-compressed scanline (filter byte 0 + 4 zero bytes for RGBA)
  // Pre-computed zlib stream for [0x00, 0x00, 0x00, 0x00, 0x00]
  const idatData = Buffer.from([
    0x78, 0x01, 0x62, 0x60, 0x60, 0x60, 0x60, 0x00,
    0x00, 0x00, 0x05, 0x00, 0x01,
  ]);
  const idat = createPngChunk('IDAT', idatData);

  // IEND chunk
  const iend = createPngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcInput);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf: Buffer): number {
  // Standard CRC-32 lookup table
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }

  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// ZIP creation (pure Node.js, no external dependencies)
// ---------------------------------------------------------------------------

/**
 * Collect all files in a directory recursively, returning paths relative to
 * the base directory.
 */
function collectFiles(dir: string, base: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, base));
    } else {
      results.push(path.relative(base, full));
    }
  }
  return results;
}

/**
 * Write a 2-byte little-endian value into a buffer at the given offset.
 */
function writeUInt16LE(buf: Buffer, value: number, offset: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
}

/**
 * Write a 4-byte little-endian value into a buffer at the given offset.
 */
function writeUInt32LE(buf: Buffer, value: number, offset: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
  buf[offset + 2] = (value >> 16) & 0xff;
  buf[offset + 3] = (value >> 24) & 0xff;
}

/**
 * Compute CRC-32 for ZIP (same algorithm as used for PNG above but kept
 * separate for clarity).
 */
function zipCrc32(buf: Buffer): number {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Create a ZIP archive from a directory using only Node.js built-in modules.
 * Produces a standard ZIP file with DEFLATE compression.
 */
async function createZipFromDirectory(srcDir: string, destZip: string): Promise<void> {
  const files = collectFiles(srcDir, srcDir);
  const parts: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const relPath of files) {
    const fullPath = path.join(srcDir, relPath);
    const fileData = fs.readFileSync(fullPath);
    // Use forward slashes in ZIP entries (required by spec)
    const entryName = relPath.split(path.sep).join('/');
    const nameBuffer = Buffer.from(entryName, 'utf-8');
    const crc = zipCrc32(fileData);
    const uncompressedSize = fileData.length;

    // Compress with DEFLATE (raw, no zlib header)
    const compressed = zlib.deflateRawSync(fileData, { level: 9 });
    const compressedSize = compressed.length;
    const method = 8; // DEFLATE

    // Local file header (30 bytes + name + compressed data)
    const localHeader = Buffer.alloc(30);
    writeUInt32LE(localHeader, 0x04034b50, 0);  // Local file header signature
    writeUInt16LE(localHeader, 20, 4);            // Version needed to extract
    writeUInt16LE(localHeader, 0, 6);             // General purpose bit flag
    writeUInt16LE(localHeader, method, 8);        // Compression method
    writeUInt16LE(localHeader, 0, 10);            // Last mod file time
    writeUInt16LE(localHeader, 0, 12);            // Last mod file date
    writeUInt32LE(localHeader, crc, 14);          // CRC-32
    writeUInt32LE(localHeader, compressedSize, 18);  // Compressed size
    writeUInt32LE(localHeader, uncompressedSize, 22); // Uncompressed size
    writeUInt16LE(localHeader, nameBuffer.length, 26); // File name length
    writeUInt16LE(localHeader, 0, 28);            // Extra field length

    parts.push(localHeader, nameBuffer, compressed);

    // Central directory header (46 bytes + name)
    const cdHeader = Buffer.alloc(46);
    writeUInt32LE(cdHeader, 0x02014b50, 0);  // Central directory signature
    writeUInt16LE(cdHeader, 20, 4);           // Version made by
    writeUInt16LE(cdHeader, 20, 6);           // Version needed to extract
    writeUInt16LE(cdHeader, 0, 8);            // General purpose bit flag
    writeUInt16LE(cdHeader, method, 10);      // Compression method
    writeUInt16LE(cdHeader, 0, 12);           // Last mod file time
    writeUInt16LE(cdHeader, 0, 14);           // Last mod file date
    writeUInt32LE(cdHeader, crc, 16);         // CRC-32
    writeUInt32LE(cdHeader, compressedSize, 20);  // Compressed size
    writeUInt32LE(cdHeader, uncompressedSize, 24); // Uncompressed size
    writeUInt16LE(cdHeader, nameBuffer.length, 28); // File name length
    writeUInt16LE(cdHeader, 0, 30);           // Extra field length
    writeUInt16LE(cdHeader, 0, 32);           // File comment length
    writeUInt16LE(cdHeader, 0, 34);           // Disk number start
    writeUInt16LE(cdHeader, 0, 36);           // Internal file attributes
    writeUInt32LE(cdHeader, 0, 38);           // External file attributes
    writeUInt32LE(cdHeader, offset, 42);      // Relative offset of local header

    centralDir.push(cdHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  // End of central directory record
  const cdOffset = offset;
  const cdSize = centralDir.reduce((sum, b) => sum + b.length, 0);
  const eocd = Buffer.alloc(22);
  writeUInt32LE(eocd, 0x06054b50, 0);       // End of central directory signature
  writeUInt16LE(eocd, 0, 4);                 // Number of this disk
  writeUInt16LE(eocd, 0, 6);                 // Disk where central directory starts
  writeUInt16LE(eocd, files.length, 8);      // Number of central directory records on this disk
  writeUInt16LE(eocd, files.length, 10);     // Total number of central directory records
  writeUInt32LE(eocd, cdSize, 12);           // Size of central directory
  writeUInt32LE(eocd, cdOffset, 16);         // Offset of start of central directory
  writeUInt16LE(eocd, 0, 20);               // Comment length

  const zipBuffer = Buffer.concat([...parts, ...centralDir, eocd]);
  fs.writeFileSync(destZip, zipBuffer);
}

const IS_PROD = process.argv.includes('--prod');

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function build(): Promise<void> {
  console.log('Building md2Lark Chrome Extension...\n');

  // 1. Ensure output directories exist.
  ensureDir(DIST_EXT);
  ensureDir(DIST_ICONS);

  // 2. Bundle TypeScript entry points with esbuild.
  const entryPoints = [
    { name: 'popup', src: path.join(SRC_EXT, 'popup.ts') },
    { name: 'background', src: path.join(SRC_EXT, 'background.ts') },
    { name: 'content', src: path.join(SRC_EXT, 'content.ts') },
    { name: 'options', src: path.join(SRC_EXT, 'options.ts') },
  ];

  for (const entry of entryPoints) {
    console.log(`  Bundling ${entry.name}.ts...`);
    await esbuild.build({
      entryPoints: [entry.src],
      bundle: true,
      outfile: path.join(DIST_EXT, `${entry.name}.js`),
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      minify: IS_PROD,
      sourcemap: false,
    });
    console.log(`  Bundled:  ${path.relative(ROOT, path.join(DIST_EXT, `${entry.name}.js`))}`);
  }

  // 3. Copy static assets.
  console.log('\n  Copying static assets...');
  copyFile(
    path.join(SRC_EXT, 'popup.html'),
    path.join(DIST_EXT, 'popup.html'),
  );
  copyFile(
    path.join(SRC_EXT, 'popup.css'),
    path.join(DIST_EXT, 'popup.css'),
  );
  copyFile(
    path.join(SRC_EXT, 'options.html'),
    path.join(DIST_EXT, 'options.html'),
  );
  copyFile(
    path.join(SRC_EXT, 'options.css'),
    path.join(DIST_EXT, 'options.css'),
  );
  copyFile(
    path.join(SRC_EXT, 'manifest.json'),
    path.join(DIST_EXT, 'manifest.json'),
  );

  // 4. Copy or generate placeholder icons.
  console.log('\n  Generating icons...');
  const iconSizes = [16, 48, 128];
  const placeholderPng = createPlaceholderPng();

  for (const size of iconSizes) {
    const srcIcon = path.join(SRC_EXT, 'icons', `icon${size}.png`);
    const destIcon = path.join(DIST_ICONS, `icon${size}.png`);

    if (fs.existsSync(srcIcon)) {
      copyFile(srcIcon, destIcon);
    } else {
      // Write a placeholder 1x1 PNG. Real icons will be added in Issue #31.
      fs.writeFileSync(destIcon, placeholderPng);
      console.log(`  Created placeholder: ${path.relative(ROOT, destIcon)}`);
    }
  }

  // 5. Generate ZIP for Chrome Web Store submission (production only).
  if (IS_PROD) {
    console.log('\n  Creating ZIP archive...');
    const zipPath = path.join(ROOT, 'dist', 'md2lark-extension.zip');
    // Remove old zip if exists
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    // Create zip from dist/extension directory using Node.js built-in zlib
    await createZipFromDirectory(DIST_EXT, zipPath);
    const zipSize = fs.statSync(zipPath).size;
    console.log(`  Created: dist/md2lark-extension.zip (${(zipSize / 1024).toFixed(1)} KB)`);
  }

  console.log('\nBuild complete! Extension files are in dist/extension/');
  console.log(
    'To load in Chrome: chrome://extensions -> Load unpacked -> select dist/extension/',
  );
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});

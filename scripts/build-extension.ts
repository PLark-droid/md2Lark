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
      minify: false,
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

  console.log('\nBuild complete! Extension files are in dist/extension/');
  console.log(
    'To load in Chrome: chrome://extensions -> Load unpacked -> select dist/extension/',
  );
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});

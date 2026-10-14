// tools/node-io.js
// The file reads and writes the design tools need in Node. Everything else is pure (lib/).
// Paths are relative to this folder, so the tools work from any working directory.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The object-designs folder itself. */
export const DESIGNS_DIR = resolve(here, '..');
/** Where exports go: the shared asset folder of the Plantern repo (PLANTERN.md §10). */
export const REPO_ASSETS_DIR = resolve(DESIGNS_DIR, '../assets');
export const LIBRARY_FILE = resolve(DESIGNS_DIR, 'materials/library.json');

export function mimeOf(path) {
  return /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
}

/**
 * Loads every texture file the library names, from textures/. A file that is not there is left
 * out of the map; checkLibrary reports it, and buildModel refuses a model that needs it.
 * Returns Map path -> { bytes: Uint8Array, mime }.
 */
export function loadTextures(library) {
  const out = new Map();
  for (const entry of Object.values(library)) {
    const path = entry?.texture;
    if (!path || out.has(path)) continue;
    const file = resolve(DESIGNS_DIR, path);
    if (existsSync(file)) out.set(path, { bytes: new Uint8Array(readFileSync(file)), mime: mimeOf(path) });
  }
  return out;
}

export function readLibrary() {
  return JSON.parse(readFileSync(LIBRARY_FILE, 'utf8'));
}

/**
 * Writes assets/index.json: the names of the models in the repo's assets/ folder (a static page cannot list
 * folders, so the viewer and the Editor read this file). Called after every export.
 */
export function writeAssetIndex(assetsDir = REPO_ASSETS_DIR) {
  const names = readdirSync(assetsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(resolve(assetsDir, d.name, 'model.glb')))
    .map(d => d.name).sort();
  writeFileSync(resolve(assetsDir, 'index.json'), JSON.stringify({ assets: names }, null, 2) + '\n');
  return names;
}

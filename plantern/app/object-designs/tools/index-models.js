#!/usr/bin/env node
// tools/index-models.js
// Writes models/index.json: the list of model files the catalog shows. Run it after adding or
// removing a model file (spec/models.test.js fails until it has been run).
//
//   node tools/index-models.js
//
// The main server does not list folders, so the catalog reads this file instead.

import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const MODELS_DIR = resolve(here, '../models');

/** The model files the catalog lists: .js files in models/, not starting with _ (templates). */
export function listModelFiles(dir = MODELS_DIR) {
  return readdirSync(dir).filter(f => f.endsWith('.js') && !f.startsWith('_')).sort();
}

/** The exact text of models/index.json for the current files. */
export function indexText(dir = MODELS_DIR) {
  return JSON.stringify({ models: listModelFiles(dir) }, null, 2) + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(resolve(MODELS_DIR, 'index.json'), indexText());
  console.log(`wrote models/index.json (${listModelFiles().length} models)`);
}

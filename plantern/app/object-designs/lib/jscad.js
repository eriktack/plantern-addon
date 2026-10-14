// lib/jscad.js
// The only place that loads @jscad/modeling. Model files import from here, never from the bundle.
//
// Browser: index.html includes <script src="vendor/jscad/jscad-modeling.min.js"> before the
// modules run; the bundle then sets window.jscadModeling.
// Node: the bundle is UMD, and its CommonJS branch comes out empty, so it is run in a vm
// sandbox that has a window object (the same branch the browser takes).

let lib = globalThis.jscadModeling;

if (!lib && typeof window === 'undefined') {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const file = new URL('../vendor/jscad/jscad-modeling.min.js', import.meta.url);
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox, { filename: file.pathname });
  lib = sandbox.jscadModeling;
}

if (!lib) {
  throw new Error('@jscad/modeling is not loaded: include vendor/jscad/jscad-modeling.min.js before this module');
}

export const { primitives, booleans, extrusions, transforms, colors, geometries, modifiers, utils } = lib;

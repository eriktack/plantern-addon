import { download } from './download.js';

/**
 * Export the generated 3D model (the view's root group: geometry, materials, lamps as
 * KHR_lights_punctual) as binary glTF. Units are metres, y up (glTF convention).
 */
export async function exportGlb(root, filename) {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const buf = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false });
  download(new Blob([buf], { type: 'model/gltf-binary' }), filename);
}

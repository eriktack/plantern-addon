import { download } from './download.js';

/**
 * Export the current 2D plan as a standalone SVG: same geometry and light state as on screen,
 * without the measure overlay, framed to the drawn content, on a dark background.
 */
export function exportSvg(svg, filename) {
  const clone = svg.cloneNode(true);
  clone.querySelector('#overlay')?.remove();
  clone.removeAttribute('class');
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const b = svg.querySelector('#walls')?.getBBox?.() || svg.getBBox();
  const m = 600, vb = [b.x - m, b.y - m, b.width + 2 * m, b.height + 2 * m];
  clone.setAttribute('viewBox', vb.join(' '));
  clone.setAttribute('width', Math.round(vb[2] / 10));     // 1 px = 10 mm at 100 %
  clone.setAttribute('height', Math.round(vb[3] / 10));
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  Object.entries({ x: vb[0], y: vb[1], width: vb[2], height: vb[3], fill: '#14161a' }).forEach(([k, v]) => bg.setAttribute(k, v));
  clone.insertBefore(bg, clone.firstChild);
  const text = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  download(new Blob([text], { type: 'image/svg+xml' }), filename);
}

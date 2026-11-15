// Lantmäteriet's ground model (Markhöjdmodell grid 1+, 1 m, CC BY 4.0) for a yard (decisions 307, 311). The sheets are found
// in Lantmäteriet's open STAC catalogue; each sheet is a cloud-optimised GeoTIFF (float32, deflate, floating-point predictor,
// 512 × 512 blocks) behind HTTP basic auth with a Geotorget login. Only the blocks over the yard are read (HTTP ranges), and
// the yard's part becomes `yard.terrain` (src/terrain/ground.js). Server side: the login never reaches a page.

import zlib from 'node:zlib';
import { fromSweref } from '../../src/terrain/geojson.js';

export const STAC_ITEMS = 'https://api.lantmateriet.se/stac-hojd/v1/collections/dtm-cog/items';
const NODATA = -9000;

/** The yard's outline in SWEREF 99 TM, as a box [minE, minN, maxE, maxN] (m), from plan points (mm) and the site. */
export function swerefBox(boundary, site) {
  const o = site?.georef?.origin;
  if (!Array.isArray(o) || !(boundary?.length >= 3)) throw new Error('the house needs a map position (site.georef.origin) and the yard an outline');
  const a = ((site.northAngleDeg ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = boundary.map(([x, y]) => [o[0] + (x * c + y * s) / 1000, o[1] + (-x * s + y * c) / 1000]);
  return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
}

// ---- reading a GeoTIFF's first image (the full resolution) ----
const TYPES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };
/** The tags of the first IFD that we need: { width, height, tileW, tileH, compression, predictor, bits, offsets, counts, origin: [E, N], cell }. */
export async function readHeader(range) {
  let head = await range(0, 131071);
  const dv = () => new DataView(head.buffer, head.byteOffset, head.byteLength);
  const le = head[0] === 0x49;
  if (!le && head[0] !== 0x4d) throw new Error('not a TIFF file');
  const u16 = o => dv().getUint16(o, le), u32 = o => dv().getUint32(o, le);
  if (u16(2) !== 42) throw new Error('not a classic TIFF (BigTIFF is not read)');
  const ifd = u32(4), n = u16(ifd), tags = {};
  const need = async (off, len) => { if (off + len > head.length) { const more = await range(head.length, off + len + 65536); const b = new Uint8Array(head.length + more.length); b.set(head); b.set(more, head.length); head = b; } };
  await need(ifd, 2 + 12 * n);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + 12 * i, tag = u16(e), type = u16(e + 2), count = u32(e + 4), size = (TYPES[type] || 1) * count;
    let off = e + 8;
    if (size > 4) { off = u32(e + 8); await need(off, size); }
    const read = k => type === 3 ? u16(off + 2 * k) : type === 4 ? u32(off + 4 * k) : type === 12 ? dv().getFloat64(off + 8 * k, le) : type === 16 ? Number(dv().getBigUint64(off + 8 * k, le)) : head[off + k];
    if ([256, 257, 258, 259, 317, 322, 323, 324, 325, 33550, 33922].includes(tag)) tags[tag] = Array.from({ length: count }, (_, k) => read(k));
  }
  const t = (k, d) => tags[k]?.[0] ?? d;
  if (!tags[324] || !tags[325]) throw new Error('the TIFF is not tiled');
  const scale = tags[33550], tie = tags[33922];
  if (!scale || !tie) throw new Error('the TIFF has no georeference');
  return { width: t(256), height: t(257), bits: t(258), compression: t(259, 1), predictor: t(317, 1), tileW: t(322), tileH: t(323), offsets: tags[324], counts: tags[325], origin: [tie[3] - tie[0] * scale[0], tie[4] + tie[1] * scale[1]], cell: scale[0] };
}

/** One block of float32 heights (m), from its compressed bytes: deflate, then the floating-point predictor (TIFF tag 317 = 3). */
export function decodeBlock(bytes, h) {
  if (h.bits !== 32) throw new Error(`heights of ${h.bits} bits are not read`);
  if (h.compression !== 8 && h.compression !== 32946 && h.compression !== 1) throw new Error(`compression ${h.compression} is not read`);
  const raw = h.compression === 1 ? bytes : zlib.inflateSync(bytes);
  const W = h.tileW, out = new Float32Array(W * h.tileH), rowB = W * 4, f = new DataView(new ArrayBuffer(4));
  for (let r = 0; r < h.tileH; r++) {
    const row = raw.subarray(r * rowB, (r + 1) * rowB);
    if (h.predictor === 3) {
      const b = Uint8Array.from(row);
      for (let i = 1; i < rowB; i++) b[i] = (b[i] + b[i - 1]) & 255;              // undo the byte differencing
      for (let j = 0; j < W; j++) { for (let k = 0; k < 4; k++) f.setUint8(k, b[k * W + j]); out[r * W + j] = f.getFloat32(0, false); }   // the planes are most significant first
    } else {
      const v = new DataView(row.buffer, row.byteOffset, row.byteLength);
      for (let j = 0; j < W; j++) out[r * W + j] = v.getFloat32(j * 4, true);
    }
  }
  return out;
}

/**
 * The ground model over a box of SWEREF 99 TM (m): yard.terrain { source, crs, origin, cell: 1, cols, rows, z (mm, null = none) }.
 * login: { user, password } (Geotorget). fetchImpl: fetch (tests pass their own). margin: metres added round the box.
 */
export async function fetchTerrain(box, login, { fetchImpl = fetch, margin = 5, maxCells = 400000, today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!login?.user || !login?.password) throw new Error('no Geotorget login saved');
  const E0 = Math.floor(box[0] - margin), N0 = Math.ceil(box[3] + margin), cols = Math.ceil(box[2] + margin) - E0, rows = N0 - Math.floor(box[1] - margin);
  if (cols * rows > maxCells) throw new Error(`the yard is too large to fetch at once (${cols} × ${rows} m)`);
  // the sheets over the box, from the open catalogue (it searches in WGS 84)
  const corners = [[E0, N0], [E0 + cols, N0], [E0, N0 - rows], [E0 + cols, N0 - rows]].map(([E, N]) => fromSweref(E, N));
  const bbox = [Math.min(...corners.map(c => c[1])), Math.min(...corners.map(c => c[0])), Math.max(...corners.map(c => c[1])), Math.max(...corners.map(c => c[0]))];
  const sres = await fetchImpl(`${STAC_ITEMS}?bbox=${bbox.map(v => v.toFixed(6)).join(',')}&limit=20`);
  if (!sres.ok) throw new Error(`Lantmäteriet's catalogue answered ${sres.status}`);
  const items = (await sres.json()).features || [];
  if (!items.length) throw new Error('Lantmäteriet has no ground model here');
  const auth = 'Basic ' + Buffer.from(`${login.user}:${login.password}`).toString('base64');
  const sheets = [];
  for (const it of items) {
    const url = it.assets?.data?.href;
    if (!url) continue;
    const range = async (a, b) => {
      const r = await fetchImpl(url, { headers: { Authorization: auth, Range: `bytes=${a}-${b}` } });
      if (r.status === 401 || r.status === 403) throw new Error('Lantmäteriet refused the Geotorget login');
      if (!r.ok) throw new Error(`Lantmäteriet answered ${r.status} for ${it.id}`);
      return new Uint8Array(await r.arrayBuffer());
    };
    sheets.push({ id: it.id, date: (it.properties?.datetime || it.properties?.start_datetime || '').slice(0, 10), range, h: await readHeader(range), blocks: new Map() });
  }
  const across = h => Math.ceil(h.width / h.tileW);
  const block = async (s, bx, by) => {
    const k = by * across(s.h) + bx;
    if (!s.blocks.has(k)) s.blocks.set(k, decodeBlock(await s.range(s.h.offsets[k], s.h.offsets[k] + s.h.counts[k] - 1), s.h));
    return s.blocks.get(k);
  };
  const z = new Array(cols * rows).fill(null);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const E = E0 + i + 0.5, N = N0 - j - 0.5;
    for (const s of sheets) {
      const c = Math.floor((E - s.h.origin[0]) / s.h.cell), r = Math.floor((s.h.origin[1] - N) / s.h.cell);
      if (c < 0 || r < 0 || c >= s.h.width || r >= s.h.height) continue;
      const v = (await block(s, Math.floor(c / s.h.tileW), Math.floor(r / s.h.tileH)))[(r % s.h.tileH) * s.h.tileW + (c % s.h.tileW)];
      if (v > NODATA) z[j * cols + i] = Math.round(v * 1000);
      break;
    }
  }
  const used = sheets.filter(s => s.blocks.size);
  return {
    source: `Lantmäteriet, Markhöjdmodell grid 1+ (1 m), sheet ${used.map(s => `${s.id}${s.date ? ` (${s.date})` : ''}`).join(', ')}, CC BY 4.0; fetched ${today}`,
    crs: 'EPSG:3006', origin: [E0, N0], cell: 1, cols, rows, z,
  };
}

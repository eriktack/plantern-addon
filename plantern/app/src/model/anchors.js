// Anchors (PLANTERN.md §5): the same physical point on two or more levels, to see whether the levels line up.
//   { id: "an_stairwell", name?, points: { ground: "r_hall#p2", upper: "r_hall_up#p2" } }
// A point is a snap ref of that level (preferred: it follows the geometry) or a position [x, y]. The lowest level that
// has the anchor is the reference; every other level should have the point at the same x/y. The older form
// { id, level, pos } (one level, an explicit position) still works and is a snap point `<id>#<level>` only.
// Pure.

import { collectSnapPoints } from '../tools/snap.js';

export const ANCHOR_TOLERANCE = 5;   // mm: levels closer than this count as aligned

/** The levels an anchor has a point on. */
export const anchorLevels = an => (an.points ? Object.keys(an.points) : an.level ? [an.level] : []);

/**
 * Where each anchor's points are: [{ id, points: [{ level, pos | null, error? }], ref, deltas }].
 * `ref` = the reference level (lowest), `deltas` = { level: [dx, dy] } how far each other level's point is from it.
 * `geos` = buildModelGeometry(model) (or buildLevelGeometry per level).
 */
export function anchorStatus(model, geos) {
  const snaps = new Map(model.levels.map(l => [l.id, new Map(collectSnapPoints(model, l, geos.get(l.id)).map(s => [s.ref, s.pos]))]));
  return (model.anchors || []).filter(an => an.points).map(an => {
    const points = Object.entries(an.points).map(([level, p]) => {
      if (!model.levels.some(l => l.id === level)) return { level, pos: null, error: `level "${level}" does not exist` };
      if (Array.isArray(p)) return Number.isFinite(p[0]) && Number.isFinite(p[1]) ? { level, pos: p } : { level, pos: null, error: 'a position must be [x, y]' };
      const pos = snaps.get(level).get(p);
      return pos ? { level, pos: [pos[0], pos[1]], ref: p } : { level, pos: null, ref: p, error: `${p} does not exist on level ${level}` };
    });
    const sorted = [...model.levels].sort((a, b) => a.elevation - b.elevation).map(l => l.id);
    const good = points.filter(p => p.pos).sort((a, b) => sorted.indexOf(a.level) - sorted.indexOf(b.level));
    const ref = good[0]?.level ?? null, deltas = {};
    for (const p of good.slice(1)) deltas[p.level] = [r1(p.pos[0] - good[0].pos[0]), r1(p.pos[1] - good[0].pos[1])];
    return { id: an.id, name: an.name, points, ref, deltas };
  });
}
const r1 = v => Math.round(v * 10) / 10;

const compass = ([dx, dy]) => [Math.abs(dx) >= 0.5 ? `${Math.round(Math.abs(dx))} mm ${dx > 0 ? 'east' : 'west'}` : '', Math.abs(dy) >= 0.5 ? `${Math.round(Math.abs(dy))} mm ${dy > 0 ? 'north' : 'south'}` : ''].filter(Boolean).join(' and ');

/** Validator issues for anchors: bad entries, missing points, levels that do not line up. */
export function checkAnchors(model, geos) {
  const out = [];
  for (const an of model.anchors || []) {
    if (an.points === undefined) continue;                                         // the older form: nothing to compare
    if (!an.points || typeof an.points !== 'object' || Array.isArray(an.points) || Object.keys(an.points).length < 2) out.push({ severity: 'error', id: an.id, msg: 'an anchor needs points on two or more levels: { points: { level: ref or [x, y] } }' });
  }
  for (const st of anchorStatus(model, geos)) {
    for (const p of st.points) if (p.error) out.push({ severity: 'warn', id: st.id, msg: p.error });
    for (const [level, d] of Object.entries(st.deltas)) {
      if (Math.hypot(d[0], d[1]) > ANCHOR_TOLERANCE) out.push({ severity: 'warn', id: st.id, level, msg: `on ${level} this point is ${compass(d)} of where ${st.ref} has it: the levels do not line up (Editor: Anchors → Align)` });
    }
  }
  return out;
}

/** Id for a new anchor from a name. */
export function newAnchorId(model, name, used) {
  const slug = String(name || 'anchor').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'anchor';
  let id = `an_${slug}`, k = 2;
  while (used.has(id)) id = `an_${slug}_${k++}`;
  return id;
}

// The Editor's sidebar tree (PLANTERN.md §7 Editing). Pure: level in, nodes out; the page draws them.
//   room → its walls in order (Wall A, B, …; a split wall or a facade gives one node per stored part)
//          and its ceiling lamps
//   wall → the openings and wall fixtures in this room's stretch of it (a facade runs behind several
//          rooms; each lists only what is in front of it)
//          and the solids (chimney, pillar) that bound it
//   "Solids" → every solid (chimney, pillar, beam, …), with the rooms it bounds
//          and the hand-drawn walls standing in it (a divider, a lintel)
//   "Other" → walls that follow no room edge (hand-drawn, orphans) and what is on them
// A shared wall appears under both rooms. Node: { key, kind, id, label, note?, warn, children }; `key`
// is unique per position in the tree (the same wall under two rooms has two keys).

import { wallName } from '../capture/labels.js';
import { pointInPolygon } from '../geometry/polygon.js';
import { openingAssumed } from '../model/openings.js';
import { boundEdges } from '../geometry/bound.js';
import { solidCover, solidStretches } from '../geometry/solids.js';

const len = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);

export function levelTree(level) {
  const walls = level.walls || [], openings = level.openings || [], fixtures = level.fixtures || [], objects = level.objects || [];
  const placed = new Set();                                   // walls that ended up under a room
  const roomsById = new Map((level.rooms || []).map(r => [r.id, r]));
  const wallAt = (w, s) => { const L = len(w.a, w.b) || 1; return [w.a[0] + (w.b[0] - w.a[0]) * s / L, w.a[1] + (w.b[1] - w.a[1]) * s / L]; };
  const objectLabel = o => o.name || (o.attach ? 'wall object' : 'object');
  const objectNode = (o, key) => ({ key, kind: 'object', id: o.id, label: objectLabel(o), note: `${o.id} · ${o.size.map(Math.round).join('×')}`, warn: !!o.assumed?.length, children: [] });
  const fixtureKind = x => x.kind === 'switch' ? 'switch' : x.kind === 'strip' ? 'LED strip' : x.attach ? 'wall lamp' : 'lamp';
  // a friendly name is the label, with what it is and its id beside it
  const fixtureLabel = x => x.name || fixtureKind(x), fixtureNote = x => x.name ? `${fixtureKind(x)} · ${x.id}` : x.id;
  const thingsOn = (w, keep) => [
    ...openings.filter(o => o.wall === w.id && keep(wallAt(w, o.offset + o.width / 2))).map(o => ({
      key: `${w.id}/${o.id}`, kind: 'opening', id: o.id, label: o.name || `${o.type} ${o.width} mm`, note: o.name ? `${o.type} ${o.width} mm · ${o.id}` : o.id, warn: openingAssumed(o).length > 0, children: [] })),
    ...fixtures.filter(x => x.attach?.wall === w.id && keep(wallAt(w, x.attach.offset))).map(x => ({
      key: `${w.id}/${x.id}`, kind: 'fixture', id: x.id, label: fixtureLabel(x), note: fixtureNote(x), warn: !!x.assumed?.length, children: [] })),
    ...objects.filter(o => o.attach?.wall === w.id && keep(wallAt(w, o.attach.offset + (o.size?.[0] ?? 0) / 2))).map(o => objectNode(o, `${w.id}/${o.id}`)),
  ];
  const solids = (level.solids || []).filter(s => s.polygon?.length >= 3);
  const solidLabel = s => s.name || `${s.kind || 'solid'}`;
  // the rooms each solid bounds: one of their edges runs along a face of it
  // the rooms each solid borders: along their edges (a chimney behind the wall line) or standing inside them
  const bounds = new Map(solids.map(s => { const ids = new Set(solidStretches(s, level.rooms || []).map(x => x.room)); return [s.id, (level.rooms || []).filter(r => ids.has(r.id))]; }));
  const rooms = (level.rooms || []).filter(r => r.polygon?.length >= 3).map(r => {
    const n = r.polygon.length, kids = [];
    r.polygon.forEach((p, i) => {
      const q = r.polygon[(i + 1) % n], L = len(p, q), u = [(q[0] - p[0]) / (L || 1), (q[1] - p[1]) / (L || 1)];
      // what stands in front of this room's edge (projected onto it, within its length)
      const onEdge = P => { const t = (P[0] - p[0]) * u[0] + (P[1] - p[1]) * u[1]; return t >= -1 && t <= L + 1; };
      const parts = walls.filter(w => w.from?.includes(`${r.id}#e${i}`));
      for (const w of parts) {
        placed.add(w.id);
        // shared = another room on its far face; facade = it runs on past this room along others
        const be = boundEdges(w, roomsById), other = [...new Set([...be.facing, ...be.along].map(e => e.room.id))].filter(x => x !== r.id).map(x => roomsById.get(x).name || x);
        const role = be.facing.length ? `shared with ${other.join(', ')}` : be.along.length > 1 ? 'facade' : '';
        kids.push({ key: `${r.id}/${w.id}`, kind: 'wall', id: w.id, label: `Wall ${wallName(i)} · ${w.name || `${Math.round(L)} mm`}`,
          note: [w.name ? `${Math.round(L)} mm` : '', parts.length > 1 || w.name ? w.id : '', role, w.kind !== 'wall' ? w.kind : ''].filter(Boolean).join(' · '),
          warn: !!w.assumed?.length, children: thingsOn(w, onEdge).map(c => ({ ...c, key: `${r.id}/${c.key}` })) });
      }
    });
    for (const x of fixtures) if (!x.attach && x.pos && pointInPolygon(x.pos, r.polygon)) {
      kids.push({ key: `${r.id}/${x.id}`, kind: 'fixture', id: x.id, label: fixtureLabel(x), note: fixtureNote(x), warn: !!x.assumed?.length, children: [] });
    }
    for (const o of objects) if (!o.attach && o.pos && pointInPolygon(o.pos, r.polygon)) kids.push(objectNode(o, `${r.id}/${o.id}`));
    for (const s of solids) if (bounds.get(s.id).includes(r)) kids.push({ key: `${r.id}/${s.id}`, kind: 'solid', id: s.id, label: solidLabel(s), note: s.id, warn: !s.capture, children: [] });
    const opt = [r.floor === 'none' ? 'open below' : '', r.floorOffset ? `step ${r.floorOffset > 0 ? '+' : ''}${r.floorOffset}` : '', r.ceilingHeight ? `ceiling ${r.ceilingHeight}` : ''].filter(Boolean).join(' · ');
    return { key: r.id, kind: 'room', id: r.id, label: r.name || r.id, note: [r.capture ? '' : 'no measurements', opt].filter(Boolean).join(' · '), warn: !r.capture, children: kids };
  });
  // a hand-drawn wall standing in a room (a divider, a lintel) is listed under that room
  const mid = w => [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
  for (const w of walls.filter(w => !placed.has(w.id) && !w.from?.length)) {
    const node = rooms.find(n => { const r = roomsById.get(n.id); return r && pointInPolygon(mid(w), r.polygon); });
    if (!node) continue;
    placed.add(w.id);
    node.children.push({ key: `${node.id}/${w.id}`, kind: 'wall', id: w.id, label: w.name || ((w.base ?? 0) > 0 ? 'Lintel / wall overhead' : w.kind === 'railing' ? 'Railing (free-standing)' : 'Wall (free-standing)'), note: w.id, warn: !!w.assumed?.length,
      children: thingsOn(w, () => true).map(c => ({ ...c, key: `${node.id}/${c.key}` })) });
  }
  const loose = walls.filter(w => !placed.has(w.id)).map(w => ({ key: `other/${w.id}`, kind: 'wall', id: w.id, label: w.name || w.id,
    note: [w.name ? w.id : '', w.from ? 'follows no edge (orphan)' : 'hand-drawn'].filter(Boolean).join(' · '), warn: !!w.from, children: thingsOn(w, () => true).map(c => ({ ...c, key: `other/${c.key}` })) }));
  const inRoom = x => (level.rooms || []).some(r => r.polygon?.length >= 3 && pointInPolygon(x.pos, r.polygon));
  const floating = fixtures.filter(x => !x.attach && x.pos && !inRoom(x)).map(x => ({ key: `other/${x.id}`, kind: 'fixture', id: x.id, label: fixtureLabel(x), note: `${fixtureNote(x)} · in no room`, warn: true, children: [] }));
  const floatingObjects = objects.filter(o => !o.attach && o.pos && !inRoom(o)).map(o => ({ ...objectNode(o, `other/${o.id}`), note: `${o.id} · in no room`, warn: true }));
  const other = [...loose, ...floating, ...floatingObjects];
  const solidGroup = solids.length ? [{ key: 'solids', kind: 'group', id: 'solids', label: 'Solids', note: '', warn: false, children: solids.map(s => {
    const st = solidStretches(s, level.rooms || []), name = id => { const r = (level.rooms || []).find(x => x.id === id); return r?.name || id; };
    const inRoom = [...new Set(st.filter(x => x.inside).map(x => x.room))].map(name), by = [...new Set(st.filter(x => !x.inside).map(x => x.room))].map(name);
    const note = [inRoom.length ? `in ${inRoom.join(', ')}` : '', by.length ? `bounds ${by.join(', ')}` : ''].filter(Boolean).join(' · ') || 'in no room';
    return { key: `solids/${s.id}`, kind: 'solid', id: s.id, label: solidLabel(s), note: `${s.id} · ${note}`, warn: !s.capture, children: [] };
  }) }] : [];
  rooms.push(...solidGroup);
  const stairs = level.stairs || [];
  if (stairs.length) rooms.push({ key: 'stairs', kind: 'group', id: 'stairs', label: 'Stairs', note: '', warn: false, children: stairs.map(s => ({
    key: `stairs/${s.id}`, kind: 'stairs', id: s.id, label: s.name || `Stairs up to ${s.to}`, note: s.name ? `up to ${s.to} · ${s.id}` : s.id, warn: !!s.assumed?.length, children: [] })) });
  return other.length ? [...rooms, { key: 'other', kind: 'group', id: 'other', label: 'Other', note: 'not part of a room', warn: false, children: other }] : rooms;
}

/** Keys of the nodes to open so that every place `id` appears in the tree is visible. */
export function pathsTo(tree, id) {
  const out = new Set();
  const walk = (nodes, trail) => {
    for (const n of nodes) {
      if (n.id === id) trail.forEach(k => out.add(k));
      walk(n.children, [...trail, n.key]);
    }
  };
  walk(tree, []);
  return out;
}

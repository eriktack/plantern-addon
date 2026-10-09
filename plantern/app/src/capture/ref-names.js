// Snap refs as a person reads them (pure): "Kitchen corner 2", "Kitchen wall B, far face at corner 2",
// "Chimney corner 1", "door o_hall, near edge". Lists and pickers show these names; the plan shows the
// same corners by number and the walls by letter, so a choice in a list can be found on the plan.
// Refs are unique per model file, so one namer covers every level.

import { wallName } from './labels.js';

export function refNamer(model) {
  const byId = new Map();
  for (const lv of model?.levels || []) {
    for (const [kind, list] of [['room', lv.rooms], ['solid', lv.solids], ['wall', lv.walls], ['opening', lv.openings], ['fixture', lv.fixtures], ['object', lv.objects], ['stairs', lv.stairs]])
      for (const e of list || []) byId.set(e.id, { kind, e, lv });
  }
  for (const an of model?.anchors || []) byId.set(an.id, { kind: 'anchor', e: an });
  const levelName = id => (model?.levels || []).find(l => l.id === id)?.name || id;
  const roomName = id => { const r = byId.get(id); return r ? r.e.name || r.e.id : id; };
  const solidName = s => s.name || ({ chimney: 'Chimney', pillar: 'Pillar', box: 'Box' })[s.kind] || s.id;
  // the room corner nearest to a wall's point, among the corners of the edges the wall was made from
  const wallCorner = (w, P) => {
    let best = null;
    for (const key of w.from || []) {
      const [rid, h] = key.split('#'), r = byId.get(rid)?.e, i = /^e(\d+)$/.exec(h || '')?.[1];
      if (!r?.polygon || i === undefined) continue;
      for (const k of [+i, (+i + 1) % r.polygon.length]) {
        const c = r.polygon[k], d = Math.hypot(c[0] - P[0], c[1] - P[1]);
        if (!best || d < best.d) best = { d, k, rid };
      }
    }
    return best && best.d < 2000 ? best : null;
  };
  const wallTitle = w => {
    const [rid, h] = (w.from?.[0] || '').split('#'), i = /^e(\d+)$/.exec(h || '')?.[1];
    if (w.name) return w.name;
    return i !== undefined && byId.has(rid) ? `${roomName(rid)} wall ${wallName(+i)}` : `wall ${w.id}`;
  };

  return function name(ref) {
    const [id, h = ''] = String(ref).split('#'), hit = byId.get(id);
    if (!hit) return ref;
    const { kind, e } = hit;
    let m;
    if (h === '') {
      // the thing itself: its name, or what it is
      if (kind === 'wall') return wallTitle(e);
      if (kind === 'room') return roomName(id);
      if (kind === 'solid') return solidName(e);
      if (kind === 'opening') return e.name || `${e.type} ${id}`;
      if (kind === 'fixture') return e.name || `${e.kind === 'switch' ? 'switch' : 'lamp'} ${id}`;
      return e.name || id;
    }
    if (kind === 'room') {
      if ((m = /^p(\d+)$/.exec(h))) return `${roomName(id)} corner ${m[1]}`;
      if ((m = /^e(\d+)$/.exec(h))) return `${roomName(id)} wall ${wallName(+m[1])}`;
    }
    if (kind === 'solid') {
      if ((m = /^p(\d+)$/.exec(h))) return `${solidName(e)} corner ${m[1]}`;
      if ((m = /^f(\d+)$/.exec(h))) return `${solidName(e)} side ${wallName(+m[1])}`;
    }
    if (kind === 'wall') {
      const bound = !!e.from?.length;
      // a wall made from a room edge runs with the room on its right: right = the room's face
      const face = s => (bound ? (s === 'right' ? 'room face' : 'far face') : `${s} face`);
      if ((m = /^(a|b)(?:\.(left|right))?$/.exec(h))) {
        // "at corner 2" of the room the wall is named after, else of the room that corner belongs to (a facade)
        const c = bound ? wallCorner(e, e[m[1]]) : null, own = (e.from?.[0] || '').split('#')[0];
        const at = c ? `at ${c.rid === own ? '' : `${roomName(c.rid)} `}corner ${c.k}` : m[1] === 'a' ? 'start' : 'end';
        return `${wallTitle(e)}, ${m[2] ? `${face(m[2])} ` : 'end '}${at}`;
      }
      if (h === 'left' || h === 'right') return `${wallTitle(e)}, ${face(h)}`;
      if (h === 'mid') return `${wallTitle(e)}, middle`;
    }
    if (kind === 'opening' && (m = /^(near|far)\.(left|right)$/.exec(h))) return `${e.name || `${e.type} ${id}`}, ${m[1]} edge (${m[2]} face)`;
    if (kind === 'fixture') return e.name || `${e.kind === 'switch' ? 'switch' : 'lamp'} ${id}`;
    if (kind === 'object') {
      if ((m = /^c(\d+)$/.exec(h))) return `${e.name || id} corner ${m[1]}`;
      if (h === 'attach') return `${e.name || id} on its wall`;
    }
    if (kind === 'anchor') return `anchor ${e.name || id} (${levelName(h)})`;
    if (kind === 'stairs' && (m = /^p(\d+)$/.exec(h))) return `${e.name || `stairs ${id}`} corner ${m[1]}`;
    return ref;
  };
}

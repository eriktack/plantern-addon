// A worktop in one piece over a run of kitchen cabinets (docs/archive/2026-10-28-kitchen.md K2, decision 284). Pure.
//
// The run is the base cabinets (and base appliance housings, an oven under the worktop) standing in a row with the one picked: on the same wall face (or free, turned the same way, their
// backs on one line), at the same height, each starting where the one before ends (within 5 mm). Their own worktops are turned off
// (the cabinet is then its carcass with its 18 mm top panel, as tall as its `height` option and as deep as its `depth`, its back
// where it was), and one `worktop` object is laid over the run: as long as the run, as deep as its deepest cabinet plus the 20 mm
// front overhang the cabinet's own worktop had, as thick as that worktop and in its material. One model change, so one undo step.

import { resolveParams } from '../../object-designs/lib/params.js';
import { addObject, setObject } from './ops.js';

const TOL = 5;                  // mm: how far apart two cabinets may stand and still be one run, and how far off one line
const FRONT_OVERHANG = 20;      // mm: kitchen-cabinet's own worktop reaches this far past the fronts
// the models a worktop can lie on, and their variants that stand under one
const RUN_MODELS = { 'kitchen-cabinet': ['base', 'base_drawer'], 'appliance-housing': ['base'] };
const r1 = v => Math.round(v * 10) / 10;

const refuse = (model, error) => ({ model, report: { errors: [error], issues: [] } });

/** Where an object of the run stands, in the run's own terms: along (start, end) and the line its back is on. */
function placeOf(o) {
  if (o.attach) return { start: o.attach.offset ?? 0, end: (o.attach.offset ?? 0) + o.size[0], key: `${o.attach.wall}|${o.attach.side ?? 'right'}`, back: o.attach.gap ?? 0 };
  const r = ((o.rotationDeg || 0) * Math.PI) / 180, u = [Math.cos(r), Math.sin(r)], v = [-u[1], u[0]];
  const s = o.pos[0] * u[0] + o.pos[1] * u[1], t = o.pos[0] * v[0] + o.pos[1] * v[1];
  // a free object's footprint starts at its front left corner (pos); its back is `depth` behind it
  return { start: s, end: s + o.size[0], key: `free|${(((o.rotationDeg || 0) % 360) + 360) % 360}`, back: t + o.size[1], u, v };
}

const sameLine = (a, b) => a.key === b.key && Math.abs(a.back - b.back) <= TOL;

/** Is this object a base cabinet (or base housing) a worktop can lie on? Returns its resolved options, or null. */
function baseCabinet(o, metas) {
  const variants = RUN_MODELS[o?.blueprint], meta = variants && metas.get(o.blueprint);
  if (!meta || o.attach?.opening !== undefined || o.on || !Array.isArray(o.size)) return null;
  let q;
  try { q = resolveParams(meta, o.params ?? {}); } catch { return null; }
  return variants.includes(q.variant) ? q : null;
}

/**
 * The run of base cabinets that `id` stands in, in order along it: [{ o, q, place }], or { error } in words.
 * metas: Map of blueprint id → meta (the Editor's `Ed.blueprints`, `opts().blueprints`).
 */
export function cabinetRun(model, levelId, id, metas) {
  const lv = model.levels.find(l => l.id === levelId);
  const o = lv?.objects?.find(x => x.id === id);
  if (!o) return { error: `no object "${id}" on level "${levelId}"` };
  if (!metas?.get?.('kitchen-cabinet') || !metas.get('worktop')) return { error: "The library's kitchen cabinet and worktop are not known here: Plantern's server has to be running." };
  const q0 = baseCabinet(o, metas);
  if (!q0) return { error: `${id} is not a base cabinet, so a worktop cannot lie on it.` };
  const p0 = placeOf(o);
  const z0 = o.z ?? 0;
  const mates = (lv.objects || [])
    .map(x => ({ o: x, q: baseCabinet(x, metas) }))
    .filter(x => x.q && Math.abs((x.o.z ?? 0) - z0) <= TOL && Math.abs(x.q.height - q0.height) <= TOL)
    .map(x => ({ ...x, place: placeOf(x.o) }))
    .filter(x => sameLine(x.place, p0))
    .sort((a, b) => a.place.start - b.place.start);
  // from the picked cabinet, take each neighbour that starts where the run ends (and the one before that ends where it starts)
  const at = mates.findIndex(x => x.o.id === id);
  let lo = at, hi = at;
  while (lo > 0 && Math.abs(mates[lo - 1].place.end - mates[lo].place.start) <= TOL) lo--;
  while (hi < mates.length - 1 && Math.abs(mates[hi + 1].place.start - mates[hi].place.end) <= TOL) hi++;
  return { run: mates.slice(lo, hi + 1) };
}

/**
 * Lay one worktop over the run that cabinet `id` stands in, and turn the cabinets' own worktops off. options are the edit options
 * (`blueprints` is the map of metas). Returns { model, report, worktop, cabinets } or a refusal with the reason.
 */
export function worktopOverRun(model, levelId, id, options = {}) {
  const found = cabinetRun(model, levelId, id, options.blueprints);
  if (found.error) return refuse(model, found.error);
  const { run } = found;
  const first = run[0], picked = run.find(x => x.o.id === id);
  const start = first.place.start, end = run[run.length - 1].place.end;

  // a worktop already over this run: say so instead of laying a second one
  const lv = model.levels.find(l => l.id === levelId);
  const already = (lv.objects || []).find(x => x.blueprint === 'worktop' && !x.attach?.opening && Array.isArray(x.size) && (() => {
    const p = placeOf(x);
    return p.key === first.place.key && p.start < end - TOL && p.end > start + TOL;
  })());
  if (already) return refuse(model, `${already.id} already lies over this run of cabinets.`);

  const meta = options.blueprints.get(picked.o.blueprint);
  const depth = Math.max(...run.map(x => x.q.depth)) + FRONT_OVERHANG;
  const thickness = picked.q.worktopThickness;
  const material = picked.o.partMaterials?.top ?? picked.o.params?.material ?? meta.params.find(p => p.type === 'material')?.default;
  const length = r1(end - start);
  const z = r1((picked.o.z ?? 0) + picked.q.height);
  const sized = run.some(x => x.o.assumed?.includes('size'));

  let m = model, report;
  for (const { o, q } of run) {
    // without its own worktop the cabinet is its carcass: as wide, deep and high as its options say, its back where it was
    const size = [q.width, q.depth, q.height];
    const props = { params: { ...o.params, worktop: false }, size, assumed: o.assumed ?? [] };
    if (!o.attach) {
      const { v } = placeOf(o), shift = o.size[1] - q.depth;
      props.pos = [r1(o.pos[0] + v[0] * shift), r1(o.pos[1] + v[1] * shift)];
      props.rotationDeg = o.rotationDeg ?? 0;
    }
    const r = setObject(m, levelId, o.id, props, options);
    if (r.report.errors.length) return refuse(model, r.report.errors.join('; '));
    m = r.model; report = r.report;
  }

  const spec = {
    name: 'Worktop', blueprint: 'worktop',
    params: { length, depth, thickness, ...(material ? { material } : {}) },
    size: [length, depth, thickness], z, assumed: sized ? ['size'] : [],
  };
  if (first.o.attach) {
    spec.attach = { wall: first.o.attach.wall, side: first.o.attach.side ?? 'right', offset: r1(start), ...(picked.o.attach.gap ? { gap: picked.o.attach.gap } : {}) };
  } else {
    // its back on the cabinets' back line, from where the run starts
    const { u, v } = first.place, t = picked.place.back - depth;
    spec.pos = [r1(start * u[0] + t * v[0]), r1(start * u[1] + t * v[1])];
    spec.rotationDeg = first.o.rotationDeg ?? 0;
  }
  const r = addObject(m, levelId, spec, options);
  if (r.report.errors.length) return refuse(model, r.report.errors.join('; '));
  return { model: r.model, report: r.report ?? report, worktop: r.object, cabinets: run.map(x => x.o.id) };
}

// The declarative interpreter (docs/plans/object-templates.md, T2): turns a house blueprint's JSON and its
// resolved parameters into { partKey: geom3 }, the same contract as a built-in model's build(), so
// object-designs/lib/build.js makes its GLB like any model's. Runs the same in Node (the server) and in the
// browser (the Objects page's preview, with the vendored @jscad/modeling loaded by lib/jscad.js).
//
// The blocks are those of object-designs/AGENT_INSTRUCTIONS.md §9. Geometry is millimetres, z up, centred on
// x and y, standing on z = 0. The file is checked first (load.js); a block that is still wrong at these
// parameter values (a size of 0 mm, over 5000 mm) throws an Error that names it.

import { primitives, booleans, transforms, geometries } from '../../object-designs/lib/jscad.js';
import { checkHouseBlueprint, metaOf, evalValue, LIMITS } from './load.js';

const DEFAULT_SEGMENTS = 32;

class Builder {
  constructor(p) { this.p = p; }

  value(v, where) {
    try { return evalValue(v, this.p); } catch (e) { throw new Error(`${where}: ${e.message}`); }
  }

  /** A length that must be above 0 and within the limit. */
  length(v, where) {
    const x = this.value(v, where);
    if (!(x > 0)) throw new Error(`${where} must be above 0 mm (it is ${Math.round(x * 100) / 100} mm)`);
    if (x > LIMITS.dimension) throw new Error(`${where} is ${Math.round(x)} mm, over the ${LIMITS.dimension} mm limit`);
    return x;
  }

  /** A block that makes one solid. */
  shape(node, where) {
    switch (node.type) {
      case 'box': {
        const size = node.size.map((v, i) => this.length(v, `${where}.size[${i}]`));
        return primitives.cuboid({ size, center: [0, 0, size[2] / 2] });
      }
      case 'cylinder': {
        const radius = this.length(node.radius, `${where}.radius`);
        if (radius * 2 > LIMITS.dimension) throw new Error(`${where}.radius makes a diameter of ${Math.round(radius * 2)} mm, over the ${LIMITS.dimension} mm limit`);
        const height = this.length(node.height, `${where}.height`);
        return primitives.cylinder({ radius, height, center: [0, 0, height / 2], segments: node.segments ?? DEFAULT_SEGMENTS });
      }
      case 'union': return this.join(booleans.union, node, where);
      case 'subtract': return this.join(booleans.subtract, node, where);
      case 'intersect': return this.join(booleans.intersect, node, where);
      case 'translate': return transforms.translate(node.offset.map((v, i) => this.value(v, `${where}.offset[${i}]`)), this.shape(node.child, `${where}.child`));
      case 'rotate': return transforms.rotateZ((node.degrees * Math.PI) / 180, this.shape(node.child, `${where}.child`));
      case 'repeat': return this.repeatShape(node, where);
      default: throw new Error(`${where}: a ${node.type} cannot be used here`);
    }
  }

  join(op, node, where) {
    const kids = node.children.map((c, i) => this.shape(c, `${where}.children[${i}]`));
    return kids.length === 1 ? kids[0] : op(...kids);
  }

  /** The offsets of a repeat: copy i is moved by i × step, the whole row centred on the origin. */
  offsets(node, where) {
    const count = this.value(node.count, `${where}.count`);
    const [sx, sy] = node.step.map((v, i) => this.value(v, `${where}.step[${i}]`));
    return Array.from({ length: count }, (_, i) => [(i - (count - 1) / 2) * sx, (i - (count - 1) / 2) * sy, 0]);
  }

  repeatShape(node, where) {
    const child = this.shape(node.child, `${where}.child`);
    const copies = this.offsets(node, where).map(o => transforms.translate(o, child));
    return copies.length === 1 ? copies[0] : booleans.union(...copies);
  }

  /** A block that holds groups: { partKey: geom3 }, the groups of one part joined. */
  parts(node, where) {
    switch (node.type) {
      case 'group': return { [node.part]: this.join(booleans.union, node, where) };
      case 'union': {
        const out = {};
        node.children.forEach((c, i) => {
          for (const [k, g] of Object.entries(this.parts(c, `${where}.children[${i}]`))) out[k] = k in out ? booleans.union(out[k], g) : g;
        });
        return out;
      }
      case 'translate': {
        const offset = node.offset.map((v, i) => this.value(v, `${where}.offset[${i}]`));
        return this.mapParts(this.parts(node.child, `${where}.child`), g => transforms.translate(offset, g));
      }
      case 'rotate': return this.mapParts(this.parts(node.child, `${where}.child`), g => transforms.rotateZ((node.degrees * Math.PI) / 180, g));
      case 'repeat': {
        const child = this.parts(node.child, `${where}.child`), offsets = this.offsets(node, where);
        return this.mapParts(child, g => {
          const copies = offsets.map(o => transforms.translate(o, g));
          return copies.length === 1 ? copies[0] : booleans.union(...copies);
        });
      }
      default: throw new Error(`${where}: a ${node.type} cannot hold parts`);
    }
  }

  mapParts(parts, fn) {
    return Object.fromEntries(Object.entries(parts).map(([k, g]) => [k, fn(g)]));
  }
}

/**
 * The shapes of a house blueprint for resolved parameters `p` (every key present, as resolveParams() makes them).
 * One geom3 per part of the blueprint; a part with no group is returned empty, as AGENT_INSTRUCTIONS.md §3.2 asks.
 */
export function buildBlueprintGeoms(json, p) {
  const problems = checkHouseBlueprint(json);
  if (problems.length) throw new Error(`Blueprint "${json?.id}" is not valid: ${problems.join('; ')}`);
  const made = new Builder(p).parts(json.build, 'build');
  return Object.fromEntries(json.parts.map(part => [part.key, made[part.key] ?? geometries.geom3.create()]));
}

/** A house blueprint as a model module ({ meta, build }), so lib/build.js treats it like a built-in model. */
export function blueprintModule(json) {
  const problems = checkHouseBlueprint(json);
  if (problems.length) throw new Error(`Blueprint "${json?.id}" is not valid: ${problems.join('; ')}`);
  return { meta: metaOf(json), build: p => buildBlueprintGeoms(json, p) };
}

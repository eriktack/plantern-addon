// The Editor's underlay form (docs/plans/underlay.md UL5): what the person types or picks, turned into model values. Pure.

import { UNDERLAY_DIR, UNDERLAY_TYPES } from '../model/underlays.js';

/**
 * The house-folder path for an uploaded image: assets/underlays/<name from the given name>.<the file's own extension>,
 * unique among `used` (a number is added). null when the file is not PNG, JPEG or WebP.
 */
export function underlayFileName(name, original, used = []) {
  const ext = (/\.[a-z0-9]+$/i.exec(String(original || ''))?.[0] || '').toLowerCase();
  if (!Object.hasOwn(UNDERLAY_TYPES, ext)) return null;
  const slug = String(name || 'underlay').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'underlay';
  const taken = new Set(used);
  let file = `${UNDERLAY_DIR}${slug}${ext}`, k = 2;
  while (taken.has(file)) file = `${UNDERLAY_DIR}${slug}-${k++}${ext}`;
  return file;
}

/** A plan point as typed: a snap ref ("r_hall#p0") or "x, y" in mm. null when it is neither. */
export function readPlanPoint(text) {
  const t = String(text ?? '').trim();
  if (/^[a-z][a-z0-9_]*#[\w.]+$/i.test(t)) return t;
  const v = t.split(/[\s,;]+/).filter(Boolean).map(s => Number(s.replace(/−/g, '-')));
  return v.length === 2 && v.every(Number.isFinite) ? v.map(x => Math.round(x)) : null;
}

/** How a plan point is shown in its box. */
export const formatPlanPoint = plan => (Array.isArray(plan) ? plan.map(Math.round).join(', ') : String(plan ?? ''));

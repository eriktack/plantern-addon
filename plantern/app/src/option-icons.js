// Icons for the options of the library models (nicer dropdowns, ND5): a variant or any other option is drawn from what the
// object is (a chair, a sofa, a sink), not an abstract shape. An option has its icon under its name; a model's own `icons`
// meta may override it later. optionIcon(key, option) gives the icon's name for the menus and buttons, or '' when the option
// has none: it never fails, so a model's own options show their label only. Browser and tests; the names are in ICONS as
// `opt:<name>` (src/icons.js). Pure apart from registering them.
import { ICONS } from './icons.js';

const svg = body => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// one drawing per family of options (the family names are the options that share it)
const DRAWN = {
  armchair: '<path d="M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"/><path d="M4 11h16v5H4z"/><path d="M6 16v3M18 16v3M4 11v5M20 11v5"/>',
  office: '<path d="M8 4h8v7H8z"/><path d="M12 11v5M7 20h10M9 16h6"/>',
  lounge: '<path d="M3 13V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4"/><path d="M3 13h18v4H3z"/><path d="M5 17v3M19 17v3"/>',
  sofa: '<path d="M3 11V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3"/><path d="M3 11h18v5H3z"/><path d="M5 16v3M19 16v3"/>',
  sofaLong: '<path d="M3 11V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3"/><path d="M3 11h18v5H3z"/><path d="M9 11v5M15 11v5M5 16v3M19 16v3"/>',
  sofaL: '<path d="M3 5h4v9h10v5H3z"/>',
  sofaU: '<path d="M3 5h4v12h10V5h4v16H3z"/>',
  sofaBed: '<path d="M3 11V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3"/><path d="M3 11h18v5H3z"/><path d="M5 16v3M19 16v3M3 19h18"/>',
  bed: '<path d="M3 18V6M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-6v6"/><circle cx="7" cy="11" r="1.5"/>',
  bunk: '<path d="M5 3v18M19 3v18M5 9h14M5 15h14"/>',
  lowBed: '<path d="M3 16h18M3 12h18M3 12v4M21 12v4"/>',
  table: '<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M5 16v4M19 16v4"/>',
  round: '<circle cx="12" cy="11" r="8"/>',
  oval: '<ellipse cx="12" cy="11" rx="9" ry="6"/>',
  square: '<rect x="5" y="5" width="14" height="14"/>',
  pedestal: '<ellipse cx="12" cy="8" rx="8" ry="3"/><path d="M12 11v7M8 21h8"/>',
  trestle: '<rect x="3" y="7" width="18" height="3"/><path d="M6 10l-2 11M18 10l2 11"/>',
  nesting: '<circle cx="9" cy="12" r="5"/><circle cx="16" cy="12" r="3"/>',
  lShape: '<path d="M4 4h7v9h9v7H4z"/>',
  desk: '<rect x="3" y="8" width="18" height="3"/><path d="M6 11v10M18 11v10"/><rect x="13" y="13" width="4" height="4"/>',
  standing: '<rect x="3" y="4" width="18" height="2.5"/><path d="M6 6.5v14M18 6.5v14"/>',
  lowTable: '<rect x="3" y="12" width="18" height="2"/><path d="M5 14v6M19 14v6"/>',
  hinged: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 3v18"/>',
  sliding: '<rect x="4" y="3" width="10" height="18"/><rect x="10" y="3" width="10" height="18"/>',
  glass: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 7h8v10H8z"/>',
  shelves: '<path d="M4 3v18M20 3v18M4 8h16M4 14h16"/>',
  drawers: '<rect x="5" y="3" width="14" height="18"/><path d="M5 9h14M5 15h14"/>',
  sideboard: '<rect x="2" y="10" width="20" height="10"/><path d="M12 10v10"/>',
  tvBench: '<rect x="2" y="14" width="20" height="6"/>',
  fridge: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M6 10h12"/>',
  freezer: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M6 12h12"/>',
  oven: '<rect x="4" y="3" width="16" height="18"/><rect x="7" y="11" width="10" height="7"/>',
  hob: '<rect x="3" y="6" width="18" height="12"/><circle cx="8" cy="11" r="2"/><circle cx="16" cy="11" r="2"/><circle cx="8" cy="15" r="2"/><circle cx="16" cy="15" r="2"/>',
  dishwasher: '<rect x="4" y="3" width="16" height="18"/><path d="M4 9h16"/><circle cx="12" cy="14" r="2"/>',
  laundry: '<rect x="4" y="3" width="16" height="18"/><circle cx="12" cy="13" r="5"/>',
  hood: '<path d="M5 8h14l2 4H3z"/><path d="M12 12v8"/>',
  microwave: '<rect x="3" y="7" width="18" height="10"/><rect x="6" y="9" width="8" height="6"/>',
  basin: '<rect x="3" y="8" width="18" height="10" rx="1"/><ellipse cx="8" cy="13" rx="2.5" ry="2"/>',
  basinDouble: '<rect x="3" y="8" width="18" height="10" rx="1"/><ellipse cx="8" cy="13" rx="2.5" ry="2"/><ellipse cx="16" cy="13" rx="2.5" ry="2"/>',
  tub: '<rect x="3" y="6" width="18" height="12"/>',
  toilet: '<path d="M5 4h14v6H5z"/><path d="M8 10c0 6 8 6 8 0"/>',
  stall: '<rect x="4" y="3" width="16" height="18"/><path d="M4 10h16"/>',
  mirror: '<rect x="5" y="3" width="14" height="18" rx="1"/>',
  pendant: '<path d="M12 2v6"/><path d="M7 8h10l-2 9H9z"/>',
  flush: '<path d="M3 5h18"/><path d="M6 5v3a6 3 0 0 0 12 0V5"/>',
  chandelier: '<path d="M12 2v5"/><circle cx="12" cy="10" r="2"/><path d="M4 14q8 6 16 0"/><circle cx="6" cy="14" r="1.5"/><circle cx="18" cy="14" r="1.5"/>',
  downlight: '<path d="M3 4h18"/><circle cx="12" cy="10" r="4"/>',
  track: '<path d="M3 4h18"/><path d="M7 4v5M12 4v6M17 4v5"/>',
  arc: '<path d="M3 21h4"/><path d="M5 21c0-9 6-14 14-12"/><path d="M15 7l3 3-2 3-3-3z"/>',
  torchiere: '<path d="M9 9h6l-1 11h-4z"/><path d="M12 2v7"/>',
  tripod: '<path d="M8 6h8l-1-3h-6z"/><path d="M12 9v5M12 14 6 22M12 14l6 8"/>',
  drum: '<rect x="5" y="7" width="14" height="10" rx="1"/>',
  cone: '<path d="M9 5h6l5 13H4z"/>',
  globe: '<circle cx="12" cy="12" r="8"/>',
  bell: '<path d="M8 6h8c0 6 3 8 3 12H5c0-4 3-6 3-12"/>',
  bulb: '<path d="M9 16a5 5 0 1 1 6 0v2H9z"/>',
  empire: '<path d="M8 6h8l3 10H5z"/>',
  candle: '<path d="M12 4v6M10 10h4v10h-4z"/>',
  orb: '<circle cx="12" cy="12" r="6"/>',
  deskArm: '<path d="M4 20h6M7 20v-12l7-2 4 4"/>',
  upDown: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
};

// the names the batches list, mapped to their family's drawing (ND5 batches 1 to 4)
const BY_NAME = {
  armchair: 'armchair', office: 'office', lounge: 'lounge', kitchen_sofa: 'sofa', two_seat: 'sofa', three_seat: 'sofaLong',
  corner_l: 'sofaL', corner_u: 'sofaU', sofa_bed: 'sofaBed',
  rectangular: 'table', round: 'round', oval: 'oval', square: 'square', pedestal: 'pedestal', trestle: 'trestle',
  nesting_pair: 'nesting', l_shaped: 'lShape', standing: 'standing', dining: 'table',
  standard: 'bed', platform: 'lowBed', storage_bed: 'bed', bunk: 'bunk', daybed: 'lowBed', cot: 'lowBed',
  open: 'shelves', glass_door: 'glass', corner_unit: 'hinged', corner_glass_door: 'glass', string: 'shelves', hinged: 'hinged',
  sliding: 'sliding', built_in_closet: 'hinged', walk_in: 'shelves', tall_pantry: 'hinged', shoe_cabinet: 'drawers',
  coat_rack: 'shelves', shoe_rack: 'shelves', umbrella_stand: 'tub', sideboard: 'sideboard', skank: 'sideboard', tv_bench: 'tvBench',
  nightstand: 'drawers', chest: 'drawers', low_boy: 'drawers', tall_boy: 'drawers',
  fridge_freezer: 'fridge', fridge: 'fridge', freezer: 'freezer', range_cooker: 'oven', dishwasher: 'dishwasher', oven: 'oven',
  hob: 'hob', washing_machine: 'laundry', dryer: 'laundry', drying_cabinet: 'laundry', range_hood: 'hood', microwave: 'microwave',
  single_bowl: 'basin', double_bowl: 'basinDouble', utility_tub: 'tub', single_sink: 'basin', double_sink: 'basinDouble',
  with_cabinet: 'basin', wall_hung: 'toilet', floor_standing: 'toilet', on_stand: 'basin', wall_mounted: 'mirror',
  enclosed_stall: 'stall', corner: 'stall', round_pedestal: 'pedestal', medicine_cabinet: 'mirror', backlit: 'mirror',
  flush: 'flush', pendant: 'pendant', chandelier: 'chandelier', recessed_downlight: 'downlight', track_light: 'track',
  track: 'track', arc: 'arc', torchiere: 'torchiere', tripod: 'tripod', drum: 'drum', cone: 'cone', globe: 'globe', bell: 'bell',
  bare_bulb: 'bulb', empire: 'empire', candlestick: 'candle', orb: 'orb', desk_arm: 'deskArm', swing_arm: 'deskArm', up_down: 'upDown',
};

/** The icon's name in ICONS for a parameter's option (`opt:<name>`), or '' when the option has no drawing. key is the parameter. */
export function optionIcon(key, option) {
  const name = String(option ?? '');
  // a parameter's own drawing first (shade/drum and variant/drum may differ); none is registered yet
  if (ICONS[`opt:${key}/${name}`]) return `opt:${key}/${name}`;
  return ICONS[`opt:${name}`] ? `opt:${name}` : '';
}

for (const [name, family] of Object.entries(BY_NAME)) ICONS[`opt:${name}`] = svg(DRAWN[family]);

/** Every option name that has a drawing (for the coverage test). */
export const DRAWN_OPTIONS = Object.keys(BY_NAME);

// What kind of object a library model is, for the object type picker (nicer dropdowns, ND11): its group (the library's own
// categories, LIBRARY.md) and an abstract icon. The table is by hand, one line per model, including the models still to build,
// so a model has its place the day it is added. kindOf() guesses for a model that is not in the table; groupBlueprints() sorts
// a list into the groups in a fixed order. Pure, except that it registers the icons (ICONS `kind:<name>`).
import { ICONS } from '../icons.js';

/** The groups in the order a list shows them. */
export const KIND_GROUPS = Object.freeze(['Seating', 'Tables', 'Beds', 'Storage', 'Kitchen', 'Bathroom', 'Lighting', 'Heating & other', 'Electronics', 'Miscellaneous', 'Other']);

// abstract drawings, 24 × 24 strokes, one per family of model (a chair is a seat, back and legs; a sofa a wide seat with arms…)
const svg = body => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const DRAWN = {
  chair: '<path d="M7 4h10v8H7z"/><path d="M7 12h10"/><path d="M8 12v8M16 12v8"/>',
  sofa: '<path d="M3 11V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3"/><path d="M3 11h18v5H3z"/><path d="M5 16v3M19 16v3"/>',
  stool: '<ellipse cx="12" cy="8" rx="6" ry="2"/><path d="M12 10v9M8 19h8"/>',
  bench: '<rect x="3" y="10" width="18" height="3"/><path d="M5 13v7M19 13v7"/>',
  table: '<rect x="3" y="8" width="18" height="3"/><path d="M5 11v10M19 11v10"/>',
  lowTable: '<rect x="4" y="13" width="16" height="2"/><path d="M6 15v5M18 15v5"/>',
  sideTable: '<rect x="7" y="8" width="10" height="2"/><path d="M9 10v10M15 10v10"/>',
  desk: '<rect x="3" y="7" width="18" height="2.5"/><path d="M6 9.5v11M18 9.5v11"/><rect x="13" y="12" width="4" height="3"/>',
  bed: '<path d="M3 19V5M3 15h18v4M21 15v-4a2 2 0 0 0-2-2h-7v6"/><circle cx="7" cy="11" r="1.3"/>',
  wardrobe: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 3v18M10 12h0M14 12h0"/>',
  drawers: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M5 9h14M5 15h14M11 6h2M11 12h2M11 18h2"/>',
  shelves: '<path d="M4 3v18M20 3v18M4 8h16M4 14h16"/>',
  hutch: '<rect x="3" y="12" width="18" height="7" rx="1"/><rect x="6" y="3" width="12" height="9"/><path d="M12 3v16M6 7.5h12M6 19v2M18 19v2"/>',
  sideboard: '<rect x="2" y="10" width="20" height="9" rx="1"/><path d="M12 10v9M6 15h0M18 15h0"/>',
  hallway: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h0M12 8h0M16 8h0"/><path d="M4 13h16"/>',
  workbench: '<rect x="3" y="6" width="18" height="2.5"/><path d="M5 8.5V21M19 8.5V21M8 12h8v4H8z"/>',
  wallShelf: '<path d="M3 9h18"/><path d="M5 9v5M19 9v5M7 14h10"/>',
  cabinet: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M9 11h0M15 11h0"/>',
  appliance: '<rect x="5" y="3" width="14" height="18" rx="1"/><rect x="8" y="10" width="8" height="7"/><path d="M5 7h14"/>',
  sink: '<rect x="3" y="8" width="18" height="10" rx="1"/><ellipse cx="12" cy="13" rx="5" ry="2.5"/>',
  island: '<rect x="3" y="9" width="18" height="10" rx="1"/><path d="M3 9h18"/>',
  toilet: '<path d="M5 4h14v6H5z"/><path d="M8 10c0 6 8 6 8 0"/>',
  bathtub: '<path d="M3 11h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 18v2M18 18v2"/>',
  shower: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 3v18"/><path d="M12 7l-2 2"/>',
  vanity: '<ellipse cx="12" cy="7" rx="6" ry="2"/><rect x="4" y="10" width="16" height="11" rx="1"/>',
  towelRail: '<path d="M6 3v18M18 3v18"/><path d="M6 8h12M6 14h12"/>',
  mirror: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 7l3 3M8 11l5 5"/>',
  ceiling: '<path d="M3 4h18"/><path d="M12 4v5"/><path d="M8 9h8l2 6H6z"/>',
  tableLamp: '<path d="M8 6h8l2 6H6z"/><path d="M12 12v5M8 21h8"/>',
  floorLamp: '<path d="M8 3h8l2 5H6z"/><path d="M12 8v12M8 21h8"/>',
  sconce: '<path d="M3 12h4"/><path d="M6 8h8l2 8H6z"/>',
  radiator: '<path d="M5 3v18M9 3v18M13 3v18M17 3v18"/><path d="M3 6h18M3 18h18"/>',
  stove: '<rect x="6" y="9" width="12" height="12" rx="1"/><path d="M10 9V3h4v6"/>',
  heatPump: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 14h4M13 14h4"/>',
  rug: '<rect x="3" y="7" width="18" height="10"/><rect x="6" y="10" width="12" height="4"/>',
  planter: '<path d="M6 13h12l-2 8H8z"/><path d="M12 13V6M12 6c-2-2-3-1-3 0M12 6c2-2 3-1 3 0"/>',
  waterHeater: '<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v4"/>',
  sauna: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M8 19h8M7 11h10"/>',
  tv: '<rect x="2" y="4" width="20" height="13" rx="1"/><path d="M8 21h8M12 17v4"/>',
  deskSetup: '<rect x="6" y="3" width="12" height="9" rx="1"/><path d="M12 12v3M9 15h6"/><rect x="4" y="18" width="12" height="3" rx="1"/><rect x="18" y="17" width="3" height="4" rx="1.5"/>',
  catTree: '<path d="M12 2v20"/><ellipse cx="7" cy="7" rx="4" ry="1.3"/><ellipse cx="17" cy="12" rx="4" ry="1.3"/><ellipse cx="7" cy="17" rx="4" ry="1.3"/><path d="M7 22h10"/>',
  radiatorCover: '<rect x="3" y="5" width="18" height="15" rx="1"/><path d="M3 8h18M7 11v6M10 11v6M14 11v6M17 11v6"/>',
  hookRack: '<rect x="3" y="6" width="18" height="4" rx="1"/><path d="M7 10v6M12 10v6M17 10v6M7 16a2 2 0 0 1 3 0M12 16a2 2 0 0 1 3 0M17 16a2 2 0 0 1 3 0"/>',
  wasteBin: '<path d="M6 7h12l-1 14H7z"/><path d="M4 7h16M9 7V4h6v3"/>',
  chest: '<rect x="3" y="12" width="18" height="8" rx="1"/><path d="M3 12c0-4 4-6 9-6s9 2 9 6"/><path d="M12 12v3"/>',
  cube: '<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
};
for (const [name, body] of Object.entries(DRAWN)) ICONS[`kind:${name}`] = svg(body);

// one line per model (its meta id): the group and the drawing. The models still to build are in it too.
const TABLE = {
  chair: ['Seating', 'chair'], sofa: ['Seating', 'sofa'], stool: ['Seating', 'stool'], bench: ['Seating', 'bench'],
  'dining-table': ['Tables', 'table'], 'coffee-table': ['Tables', 'lowTable'], 'side-table': ['Tables', 'sideTable'], desk: ['Tables', 'desk'],
  bed: ['Beds', 'bed'],
  wardrobe: ['Storage', 'wardrobe'], 'chest-of-drawers': ['Storage', 'drawers'], bookshelf: ['Storage', 'shelves'], sideboard: ['Storage', 'sideboard'], 'display-cabinet': ['Storage', 'hutch'],
  'hallway-unit': ['Storage', 'hallway'], workbench: ['Storage', 'workbench'], 'wall-shelf': ['Storage', 'wallShelf'],
  'kitchen-cabinet': ['Kitchen', 'cabinet'], appliance: ['Kitchen', 'appliance'], sink: ['Kitchen', 'sink'], 'kitchen-island': ['Kitchen', 'island'],
  toilet: ['Bathroom', 'toilet'], bathtub: ['Bathroom', 'bathtub'], shower: ['Bathroom', 'shower'], vanity: ['Bathroom', 'vanity'],
  'towel-rail': ['Bathroom', 'towelRail'], mirror: ['Bathroom', 'mirror'],
  'ceiling-light': ['Lighting', 'ceiling'], 'table-lamp': ['Lighting', 'tableLamp'], 'floor-lamp': ['Lighting', 'floorLamp'], 'wall-sconce': ['Lighting', 'sconce'],
  radiator: ['Heating & other', 'radiator'], 'tile-stove': ['Heating & other', 'stove'], 'wood-stove': ['Heating & other', 'stove'],
  'heat-pump-indoor': ['Heating & other', 'heatPump'], rug: ['Heating & other', 'rug'], planter: ['Heating & other', 'planter'],
  'water-heater': ['Heating & other', 'waterHeater'], 'sauna-heater': ['Heating & other', 'sauna'],
  tv: ['Electronics', 'tv'], 'desk-setup': ['Electronics', 'deskSetup'],
  'cat-tree': ['Miscellaneous', 'catTree'], chest: ['Miscellaneous', 'chest'], 'waste-bin': ['Miscellaneous', 'wasteBin'], 'radiator-cover': ['Heating & other', 'radiatorCover'], 'hook-rack': ['Storage', 'hookRack'],
};

/** { group, icon } of a model: from the table, else a guess from its id, else Other with a cube. icon is a name in ICONS (`kind:…`). */
export function kindOf(id) {
  const hit = TABLE[id];
  if (hit) return { group: hit[0], icon: `kind:${hit[1]}` };
  const guess = [
    [/chair|sofa|stool|bench|seat/, 'Seating', 'chair'],
    [/table|desk/, 'Tables', 'table'],
    [/bed/, 'Beds', 'bed'],
    [/wardrobe|cabinet|drawer|shelf|unit|bookcase|storage/, 'Storage', 'shelves'],
    [/sink|oven|fridge|appliance|kitchen|hob/, 'Kitchen', 'appliance'],
    [/toilet|bath|shower|vanity|mirror|towel/, 'Bathroom', 'vanity'],
    [/lamp|light|sconce/, 'Lighting', 'ceiling'],
    [/tv|screen|speaker/, 'Electronics', 'tv'],
    [/radiator|stove|heat|rug|planter|heater|sauna/, 'Heating & other', 'radiator'],
  ].find(([re]) => re.test(String(id ?? '')));
  return guess ? { group: guess[1], icon: `kind:${guess[2]}` } : { group: 'Other', icon: 'kind:cube' };
}

/**
 * The list grouped: [{ group, items }] in KIND_GROUPS order, each group's items by name, each item { id, name, kind: { group, icon } }.
 * Groups with no items are left out.
 */
export function groupBlueprints(list) {
  const byGroup = new Map(KIND_GROUPS.map(g => [g, []]));
  for (const item of list ?? []) {
    const kind = kindOf(item.id);
    byGroup.get(kind.group).push({ ...item, kind });
  }
  return KIND_GROUPS.map(group => ({
    group,
    items: byGroup.get(group).sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id))),
  })).filter(g => g.items.length);
}

/** The ids the table has (for the test: every model in the library is in it). */
export const KIND_IDS = Object.freeze(Object.keys(TABLE));

// Editor page: the state every part shares. Split from ui.js (ui-consistency plan, UX34): the module-level variables of the old ui.js, as
// properties of one object, so each module reads and writes the same values.

import { readPrefs } from '../../model/prefs.js';

export const Ed = {
  perfLabel: null,
  nextLabel: null,

  loc: undefined,   // house: where the model is loaded from and saved to (src/model/house.js)
  model: undefined,
  entry: undefined,
  house: undefined,
  levelId: null,
  roomId: null,          // selected existing room id, or null while creating a new one
  draft: null,           // { name, exterior } of a new room ({ name, solid: true } of a new chimney or pillar)
  shape: 'room',         // what the measurement panel edits: a 'room' or a 'solid' (chimney, pillar)
  solved: null,          // last solver result for the form
  dirty: false,
  saveMode: null,
  curGeo: null,          // derived geometry of the current level (overlap checks)
  snaps: [],          // snap points of the current level
  snapsAround: [],    // …and those of the level below and above (where a room or solid can start)
  underlay: [],       // faint outlines of those levels
  wallId: null,       // selected wall id (then no room is selected)
  openingId: null,    // selected opening id (then no room or wall is selected)
  fixtureId: null,    // selected lamp or switch
  stairsId: null,     // selected stairs
  stairsFormFor: null,
  objectId: null,     // selected object
  objectFormFor: null,
  dragging: null,     // a lamp, switch or object being dragged on the plan
  planFs: 16,         // the label size of the plan as last drawn (SVG units per 16 screen px)
  treeShownFor: null,      // the selection the tree last opened itself to
  fixtureFormFor: null,
  openingFormFor: null,
  wallFormFor: null,  // the wall object the wall panel was last filled from (refill only when it changes)
  history: null,      // undo/redo snapshots of the model
  savedModel: null,
  savedLoc: null,   // the location (bindings) as last loaded or saved
  issuesNow: [],      // validation issues of the current model
  modelGeos: null,    // derived geometry of every level, from the last validation
// Edit mode: the sidebar shows only the thing being edited, with Apply / Revert / Close in a bar at the
// bottom. A single click selects; double-click, Enter or ✎ edits. Leaving with unapplied changes asks first.
  editing: null,      // { kind: 'room' | 'solid' | 'wall' | 'opening' | 'fixture' | 'material', id, back? } or null
  editBase: null,     // Map(field → its value when the panel was last filled), or null: dirty = any field with another value (by field, not by position: a form that gains fields later, or fills them late, is not a change)
  measure: null,      // the measuring tool on the plan (also while editing: clicks then measure)
  peekId: null,       // while editing: another level shown read-only (nothing selected or changed there)
  peekSel: null,      // { kind, id } picked on the level looked at (its info card)
  underlayMode: ['auto', 'always', 'off'].includes(readPrefs().editorUnderlay) ? readPrefs().editorUnderlay : 'auto',
  drawing: null,      // + Wall: { a: point | null, hover } while a wall is being drawn on the plan
// Zoom and pan: `view` is the part of the plan shown (SVG units, as the viewBox); null = the whole level.
  view: null,
  lastFit: null,
  autoZoomed: false,
  pan: null,
  suppressClick: false,
  levelMenu: null,                   // the level dropdown of the plan's tools on a phone (made when first shown)
  lastMenuAt: -1e9,                  // when the right-click / long-press menu last opened (a touch press must not open it twice)
  panFrame: 0,
  pinch: null,
  lastClick: null,
// ---- new things are created by their first Apply (decision 120) ----
// + Object, + Door, + Lamp, + Stairs, a drawn wall and Duplicate put the thing into the model so the plan and its form can
// show it, but it is "fresh" until its first Apply: leaving the editor (Cancel, Esc, another click) takes it out again, Save
// waits for it, and its id is made from the name typed (ob_kitchen_cabinet) when it is applied, not before.
  fresh: null,                                                // { kind, id, autoId, base (the model before it), what }
  baseStatus: '',
  nudgeBurst: null,                                            // { id, key, timer }: arrow presses close together are one undo step

/** One thing in the sidebar at a time, as for a room: the browse list, the edit view of a room, or the house or
 *  floor form (which take the browse list's place, under the same top row). */
  sideFormShown: false,
  snapsKey: null,
  snapsDataKey: null,
  nextToKey: null,
  sectionsKey: null,

// ---- materials ----
  matId: null,                       // the material being edited ('' = a new one)

/**
 * Another corner picked to measure from: a typed position is converted so the opening stays where it is;
 * with nothing typed yet the panel is simply refilled for that corner.
 */
/** "Measured from … On the plan" (fixes list 16): the corners along the wall are marked, a click on one picks it. */
  fromPick: null,                                             // { sel, wallId } while picking
// Select from point (under Corner 0): the start points of the house are on the plan only while it is on
  startPick: false,

// an opening's bottom, top, height and distance below the ceiling follow the one typed last (UX22); that one is what Apply keeps
  openingHeightFrom: null,

// The asset models of this house (decision 146). Made when first used, read through the house's own assets/ and the
// repo's shared ones; a model that loads or fails redraws the plan, and the object panel's list offers the names found.
  assets: null,
  assetNameList: [],

// The blueprints this house can use (the built-in library and its own blueprints/), for the validator (decision 188): it then
// checks a blueprint object's values against its blueprint. Only with Plantern's server; without it those checks are skipped.
  blueprints: null,       // id → meta; and the list itself ({ id, source, meta }), for the Add menus
  blueprintList: null,
// where a right-click asked for the new thing (UX9): set while its Add entry runs, else null (the middle of the room or wall)
  addAt: null,

// ---- placing a new thing with a click (ui-consistency plan, UX10) ----
// A lamp or an object picked in an Add menu follows the pointer as a marker; a click puts it there (in the room clicked, or
// on the selected wall where the click is along it), Enter puts it in the middle as before, Esc cancels.
  placing: null,                                               // { where, entry } while waiting for the click
  assetPickNames: [],   // the names the model menu lists (fillAssetNames)

// ---- the options of a blueprint object, edited here (src/param-form.js; the Objects page shows the same form) ----
  optionsForm: null,
  optionsShownFor: null,
  optionLibraryLoaded: null,

// ---- Placed: in the room, on a wall or in an opening (openings-and-lit-objects OB1b) ----
  placeDraft: null,        // { to, opening, at }: the choice in the object panel, applied with Apply
  placeDraftFor: null,     // the object the draft is for

// ---- the link to Home Assistant: location.json → bindings (saved at once, a file of its own) ----
  haStates: null,       // the states of the house's connection kept by Plantern's server, once loaded
  dry: null,            // an Apply being run to see what it gives (live-preview.js): commit() keeps its model here instead of storing it
  livePreview: false,   // the plan shows a draft of the form, not the stored model
  liveQueued: false,    // a preview is asked for in the next frame
  liveSeq: 0,           // the newest preview asked for; an older answer is dropped
  draft3d: null,        // the draft of the form as published by live-preview.js: { model, kind, id } or null (draft-bus.js)
  draftSubs: new Set(), // who wants it: the plan and the 3D preview pane
  // the 3D preview pane (preview3d.js): its view, the draft it shows, the lights the person switched on, and the choices made in it
  pv: { open: false, view: null, loading: null, timer: 0, seq: 0, draft: null, assets: null, assetsFor: null, cache: null, edited: null, lights: new Map(), dayChoice: null, lightsUsed: false, solidWalls: false, side: 1, before: false, frameKey: null, updating: 0, error: '', focus: null, fixtures: [], settings: null, elevation: 0 },
  haConn: null,         // resolveConnection() for the house: { name, conn, note?, fallback? }; its note says why the list may be empty (a fallback, or mock)
  haAsked: 0,           // when the server was last asked (ms); asked again only after HA_RETRY_MS, never on every click

/** A lit object's light (openings-and-lit-objects LA4, LA5): its link, the look it has when on, and its radius. Shown once the object has a light, stored with it or built by the server. */
  objectLightFilledFor: null,   // the object whose light fields were last filled from location.json

// ---- splitting a wall with a click (ui-consistency plan, UX16) ----
  splitPick: false,

// ---- the room's measurements as a table, one row per wall (ui-consistency plan UX24, decision 257 point 4) ----
// The text fields under "As text" stay what is solved and stored; the table reads them (renderWallTable) and writes them
// (writeWallTable), so nothing about the data changes. While the table is being typed in it is not drawn again.
  wt: null,
  tableWriting: false,
  overlapTimer: 0,

/** A wall side running along several rooms (a facade): one row per room on that side. */
  foldedLooks: new Set(),   // per-room looks shown as their face's own look (the face runs along only that room)
};

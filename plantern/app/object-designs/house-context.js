// house-context.js
// The Objects page in a house (docs/archive/2026-10-14-object-templates.md, T6): with Plantern's server and a house (?loc= or the one last
// picked), the page also offers the house's own blueprints, *Place in house*, and changing the options of an object already
// placed (?object=<id>). Without a house or without the server none of this shows and the page is the catalog it always was.
// Only wiring: the rules are in src/blueprints/place.js and src/edit/ops.js.

import { listHouses, openHouse, houseOptions, setApiBase } from '../src/model/house.js';
import { chooseLocation, chooseLevel, remember, linkPages } from '../src/model/current.js';
import { blueprintModule } from '../src/blueprints/build.js';
import { placeOptions, placeSpec, optionProps, findObject, startPlacement } from '../src/blueprints/place.js';
import { placementOf, defaultsFor } from './lib/params.js';
import { addObject, setObject } from '../src/edit/ops.js';
import { levelLabel } from '../src/model/names.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Opens the house of the page, or returns null (no server, no house, or the house cannot be read). Returns
 * { index, house, list, houseModels, objectId }: `list` is what the server answers for the house's blueprints, `houseModels`
 * the house's own blueprints as models for the catalog ({ file, mod, source: 'house' }), `objectId` the ?object= of the URL.
 */
export async function openHouseContext() {
  setApiBase('../');
  const params = new URLSearchParams(location.search);
  try {
    const index = await listHouses();
    if (!index.server) return null;
    const id = chooseLocation(index, params.get('loc'));
    if (!id) return null;
    const house = await openHouse(index, id);
    remember(id);
    linkPages(id);
    const res = await fetch(`../api/houses/${encodeURIComponent(id)}/blueprints`, { cache: 'no-store' });
    const list = res.ok ? await res.json() : { blueprints: [], refused: [] };
    const houseModels = [];
    for (const b of list.blueprints.filter(b => b.source === 'house')) {
      try { houseModels.push({ file: `house:${b.id}`, mod: blueprintModule(b.json), source: 'house' }); }
      catch (e) { list.refused.push({ id: b.id, source: 'house', problems: [e.message] }); }
    }
    return { index, house, list, houseModels, objectId: params.get('object') };
  } catch (e) {
    console.warn('The Objects page has no house to place into:', e.message);
    return null;
  }
}

const POST = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Asks the server for the GLB of these settings: { hash, size }. Throws with the server's reason. */
async function build(house, blueprint, params, partMaterials) {
  const r = await fetch('../api/glb', POST({ house: house.id, blueprint, params, partMaterials }));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `the server answered ${r.status}`);
  return j;
}

/**
 * Wires the house panel. `page` is what the catalog offers: { form, current(): the shown model or null, show(id, values): picks
 * a blueprint (and fills its form with the values of a placed object) }.
 */
export function wireHousePanel(ctx, page) {
  const { house, list, index } = ctx;
  $('houseBox').hidden = false;
  $('hLoc').innerHTML = houseOptions(index, house.id);
  $('hLoc').addEventListener('change', () => { const q = new URLSearchParams({ loc: $('hLoc').value }); location.search = q; });
  const say = (text, bad = false) => { const el = $('hMsg'); el.textContent = text; el.classList.toggle('bad', bad); };

  if (list.refused.length) {
    const el = $('hRefused');
    el.hidden = false;
    el.textContent = list.refused.map(r => `${r.file ?? r.id} is not offered: ${r.problems.join('; ')}`).join('\n');
  }

  const level = () => house.model.levels.find(l => l.id === $('hLevel').value);
  const fillLevel = (levelId) => {
    $('hLevel').innerHTML = house.model.levels.map(l => `<option value="${esc(l.id)}">${esc(levelLabel(l))}</option>`).join('');
    $('hLevel').value = levelId ?? chooseLevel(house.model, house.id, null);
    fillPlace();
  };
  function fillPlace() {
    const { rooms, walls } = placeOptions(level());
    $('hRoom').innerHTML = rooms.length ? rooms.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('') : '<option value="">no rooms on this level</option>';
    $('hWall').innerHTML = walls.length ? walls.map(w => `<option value="${esc(w.id)}">${esc(w.label)}</option>`).join('') : '<option value="">no walls on this level</option>';
    const first = rooms[0];
    if (first && $('hX').value === '') { $('hX').value = first.centre[0]; $('hY').value = first.centre[1]; }
    pickRoom();
  }
  function pickRoom() {
    const room = placeOptions(level()).rooms.find(r => r.id === $('hRoom').value);
    if (room) { $('hX').value = room.centre[0]; $('hY').value = room.centre[1]; }
  }
  const showKind = () => {
    const wall = $('hKind').value === 'wall';
    $('hRoomRows').hidden = wall;
    $('hWallRows').hidden = !wall;
  };

  $('hLevel').addEventListener('change', () => { $('hX').value = ''; fillPlace(); });
  $('hRoom').addEventListener('change', pickRoom);
  $('hKind').addEventListener('change', showKind);
  fillLevel();
  showKind();

  // where a new object starts comes from the blueprint (meta.placement, decision 230): on a wall at its height, on the
  // floor, or under the ceiling (the bottom is then worked out from the built height when it is placed)
  // a bottom the person has not typed follows the blueprint and its chosen variant when Place is pressed
  let zTyped = false;
  $('hZ').addEventListener('input', () => { zTyped = $('hZ').value.trim() !== ''; });
  page.onSelect?.((meta, placed) => {
    if (placed) return;
    const pl = placementOf(meta, defaultsFor(meta).variant);
    zTyped = false;
    $('hKind').value = pl.mount === 'wall' ? 'wall' : 'room';
    showKind();
    $('hZ').value = '';
    $('hZ').placeholder = pl.mount === 'ceiling' ? 'under the ceiling' : `${pl.z} · ${pl.mount === 'wall' ? 'on the wall' : 'default'}`;
  });
  const bottomFor = (size, params) => {
    if (zTyped) return $('hZ').value;
    const room = $('hKind').value === 'room' ? level().rooms.find(r => r.id === $('hRoom').value) : null;
    return startPlacement(page.current().mod.meta, size, level(), room, params).z;
  };

  // What the form says now, as the server builds it: the values, then the size.
  async function builtNow() {
    if (!page.current()) throw new Error('Pick a blueprint first.');
    if (!page.form.valid) throw new Error('Some values need a fix first (see the top of the panel).');
    const { params, partMaterials } = page.form.readForObject();
    return { params, partMaterials, ...(await build(house, page.current().mod.meta.id, params, partMaterials)) };
  }

  // Read the house again, change it, save: another page may have saved meanwhile, and this page keeps no history.
  async function change(apply) {
    await house.load();
    const r = apply(house.model);
    if (r.report?.errors?.length || r.errors?.length) throw new Error((r.report?.errors ?? r.errors).join('; '));
    await house.save(r.model);
    return r;
  }

  $('hPlace').addEventListener('click', async () => {
    const button = $('hPlace');
    button.disabled = true;
    say('Building…');
    try {
      const built = await builtNow();
      const placed = placeSpec({
        blueprint: page.current().mod.meta.id, params: built.params, partMaterials: built.partMaterials, size: built.size, z: bottomFor(built.size, built.params), name: $('hName').value,
        place: $('hKind').value === 'wall'
          ? { kind: 'wall', wall: $('hWall').value, side: $('hSide').value, offset: $('hOffset').value, gap: $('hGap').value }
          : { kind: 'room', x: $('hX').value, y: $('hY').value, rotationDeg: $('hTurn').value },
      });
      if (placed.error) throw new Error(placed.error);
      const levelId = $('hLevel').value;
      const r = await change(model => addObject(model, levelId, placed.spec));
      if (!r.object) throw new Error('The object could not be placed.');
      const editor = `../room-editor.html?${new URLSearchParams({ loc: house.id, level: levelId })}`;
      say(`Placed as ${r.object.id} (${built.size.join(' × ')} mm) and saved. `);
      $('hMsg').insertAdjacentHTML('beforeend', `<a href="${esc(editor)}">Open the Editor</a> · <a href="?${new URLSearchParams({ loc: house.id, object: r.object.id })}">edit its options</a>`);
    } catch (e) {
      say(e.message, true);
    } finally { button.disabled = false; }
  });

  // Export: the model with the options now shown, written into the house's own assets/ folder (decision 234). It is a
  // file for use outside a placed object; the object itself keeps its blueprint and options.
  $('hExport').addEventListener('click', async () => {
    const button = $('hExport');
    button.disabled = true;
    say('Exporting…');
    try {
      if (!page.current()) throw new Error('Pick a blueprint first.');
      if (!page.form.valid) throw new Error('Some values need a fix first (see the top of the panel).');
      const { params, partMaterials } = page.form.readForObject();
      const name = $('hAssetName').value.trim();
      const r = await fetch(`../api/houses/${encodeURIComponent(house.id)}/export-asset`, POST({
        blueprint: page.current().mod.meta.id, params, partMaterials, ...(name ? { name } : {}),
      }));
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `the server answered ${r.status}`);
      say(`Saved to ${j.path} in ${house.name} (${j.size.join(' × ')} mm).`);
    } catch (e) {
      say(e.message, true);
    } finally { button.disabled = false; }
  });

  // ---- an object already placed: ?object=<id> ----
  const found = ctx.objectId ? findObject(house.model, ctx.objectId) : null;
  if (ctx.objectId && !found) say(`There is no object "${ctx.objectId}" in ${house.name}.`, true);
  else if (found && !found.object.blueprint) say(`${found.object.id} is not made from a blueprint, so it has no options here.`, true);
  else if (found) {
    const { object, level: where } = found;
    if (!page.show(object.blueprint, { params: object.params, partMaterials: object.partMaterials })) {
      say(`The blueprint "${object.blueprint}" of ${object.id} is not in this house or the library.`, true);
    } else {
      $('hPlaceBox').hidden = true;
      $('hEditBox').hidden = false;
      $('hEditing').textContent = `${object.name || object.id} · ${levelLabel(where)}`;
      $('hApply').addEventListener('click', async () => {
        const button = $('hApply');
        button.disabled = true;
        say('Building…');
        try {
          const built = await builtNow();
          const r = await change(model => setObject(model, where.id, object.id, optionProps(built)));
          say(`Applied to ${object.id} (${built.size.join(' × ')} mm) and saved. The Editor shows it when it reads the house again.`);
          void r;
        } catch (e) {
          say(e.message, true);
        } finally { button.disabled = false; }
      });
    }
  }
}

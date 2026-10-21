# Changelog

## 0.6.8

- The Lovelace card: ticking every floor shows the floor picker, the same as ticking none. The 3D view follows the floors you ticked, and the floor pills keep their height. The stack menu is hidden when one or several floors are ticked.

## 0.6.7

- A light on an object now stands at the height you set (it used to hang near the ceiling), a bookshelf's inner shelves can have a material of their own (glass shelves in a wooden frame), glass no longer casts shadows in the 3D view, and LED strips no longer light through walls.

## 0.6.6

- Bookshelves take a height and optional feet (the shelf spacing follows from the height), objects can carry a light of their own (+ Light in the object panel), Alt now pulls an object off its wall at once while dragging, and beds get pillows.

## 0.6.5

- A tall vertical LED strip on a short wall is no longer refused: its length is its height, not a run along the wall (for example the strips beside a shelf opening).

## 0.6.4

- Closes the library gaps found while furnishing BBV28: a radiator cover, a hook rack, a floor lamp with several shades, a round wood stove (braskamin) and a pouf. The wood stove, side table and stool take larger sizes, and a waste bin, shower fittings and a rounded corner shower arrived earlier in 0.6.3. Houses that use the new models or sizes show them correctly after this update.

## 0.6.3

- A waste bin for the object library, shower fittings and a rounded corner shower, and wall objects on the left face of a wall now stand with their back on the wall (towel rails were the wrong way round). The pedal bin's pedal reaches out from the front.

## 0.6.2

- Rooms with corners other than 90° join cleanly: walls a little off parallel carry on as one wall, and corners where three rooms meet no longer poke into the next wall, so no more overlap warnings there (issue #28).
- Separate walls: a wall shared by two rooms can be made one wall per room (Separate walls in the wall panel), and shared again with one click. A door in it keeps a matching passage through the other wall.
- Exact corners: mark a corner whose angle you are sure of (Exact ° in the room's measurements) and the other corners and lengths take the closing gap, instead of every corner moving a little.
- Fixes: things on a wall that merges away move to the right wall, and a wall a few degrees off no longer loses its body at a junction.

## 0.6.1

- 3D preview: Updating… and other messages now sit over the bottom-left of the view, so the view no longer jumps.

## 0.6.0

- Editor 3D preview: see the thing you edit in 3D, in its room, before Apply. Colours, fabrics, options, windows, walls and materials show as you type; try lights on and off by day or night; the plan previews solids, materials and new things too.

## 0.5.13

- The Editor previews a form's changes on the plan before they are applied. A new model of a desk with its equipment, and a standard lamp icon. Still to measure items can be confirmed one at a time from the list. Blueprint values that do not apply to a variant are cleared on save, not reported as warnings.

## 0.5.12

- The add-on's commits are linked to your GitHub account (the publisher uses your noreply address).

## 0.5.11

- Still to measure: each item can be confirmed as measured, one at a time, from its row in the list. Padlock and door-lock fixes; blueprint values that do not apply to a variant are cleared on save, not reported as warnings.

## 0.5.10

- The open padlock on a door's lock is drawn as an open shackle, turned out of the housing as on a real padlock, in 3D and in the plan. The plan's padlock is drawn in the middle of the door.

## 0.5.9

- Doors: a lock from Home Assistant shows as a padlock in the plan and in 3D (green closed, red open). An open door shows its open or closed state as an outline. The exploded view moves the floors further sideways. Validation messages show the name of the thing beside its id. A lamp of a lit object is no longer reported as outside a room.

## 0.5.8

- Door lock padlocks on doors; window lamp light and lamp self-shadow fixes; card header dropdown; the add-on's Home Assistant connection can be named on its configuration page so houses made on a PC work unchanged, houses with a missing connection use the add-on's own, and the Settings page names its server and can rename connections

## 0.5.7

- the card shows library objects

## 0.5.6

- Stair winders: a moved pivot, an error for an empty wedge and a warning for very uneven treads

## 0.5.5

- **Faster Editor.** Applying a change, undoing, storing a drag, typing in a room and the overlap check are several times faster on a big house; the room names are kept instead of worked out on every draw; a pan only moves the view; a room or corner drag draws only that room; opening an editor draws the plan once; the Editor makes one request for all library objects instead of one each and no longer loads the 3D library or the model files.
- **Nicer dropdowns.** Every list is drawn like the page menu with icons, colour swatches for materials, grouped lists (also by room for corners) and a state dot for Home Assistant entities; the object type picker is grouped by kind.
- **Library:** a Miscellaneous group with a cat tree and a chest; all models can have their size typed in the Editor.
- **Lamps:** an unbound lamp can be clicked on and off as a preview in the colour and brightness set on it; a lamp deep in a window keeps its light on the room side of the window; lamp objects are clicked in 3D by their model.
- Internal: the Editor's code is split into modules, tests no longer wait for clocks.

## 0.5.4

- **Nicer dropdowns.** Every list is drawn like the page menu, with icons, colour swatches for materials, grouped lists and a state dot for Home Assistant entities. The phone pages use it for short choices (how a window or door opens) and keep the phone's own wheel for long lists.
- **Object library complete:** 14 more models (kitchen island, bathtub, towel rail, radiator, tile stove, wood stove, heat pump, rug, water heater, workbench, sauna heater, sideboard, hallway unit, tv), grouped by kind with icons in the object picker; the shower's glass and tray take the right materials; the older models can have their size typed in the Editor.
- **Lamp objects:** a lamp object is clicked in 3D on the object, has a faint ball round its light that is easy to hit, and its light shows in the 3D view as soon as the server has built the model. The 2D plan draws lamps as light bulbs.
- Fix: a lamp object in a window is drawn at the window's height in 3D, and the Editor no longer asks to apply unchanged values after Check the build.

## 0.5.3

- **Lamps are objects.** A table lamp, floor lamp, wall sconce or ceiling light from the library is one object that gives its own light: link it to a Home Assistant light in its panel. The light shows in the viewer and in the card.
- **Objects in windows.** A lamp or planter can stand on a window sill or hang from its head, placed from the opening's Add menu, the object's Placed choice or the Objects page. It follows its window; windows also get an inner sill and openings and objects can be shifted.
- **More library models:** appliance, sink, toilet, vanity, shower, mirror and tv; chandelier shades have a fixed size.
- Fix: the Editor no longer asks to apply unchanged values after Check the build, and a lamp object in a window is drawn at the window's height in 3D.
- Fix: the release checks no longer depend on timing, and a release is made with one command (the version lives in package.json alone). 0.5.2 was tagged without its version bump and was never published; this release replaces it.

## 0.5.1

- Fix: the release checks now wait for the git storage sync state to settle (a test sampled it too early on a busy machine). No change to the add-on itself.

## 0.5.0

- **Door sensors.** A door can be linked to a Home Assistant door sensor (`binary_sensor`). The viewer and the card draw an open door with its leaf swung out, and light passes an open door. A door with no sensor is shown open.
- **Faster first 3D view.** The 3D view draws once per change instead of once per lamp. A house with many lamps no longer freezes on the first open.
- **Lamp light stops at walls.** The 3D view masks each lamp's light at the walls its plan visibility hides, and the shadows go first to the lamps that would leak. A lamp's light reaches its radius, as the plan's glow does. The first switch of a lamp no longer stalls.
- **Card.** On a light dashboard the card's plan goes light. A *This floor / Below too / All floors* switch in 3D, arrows and swipes between floors, and a `shadows` option.
- **Plan on a touch screen.** Two fingers pinch to zoom and pan the 2D plan.
- **Stair handrails** can be round, on poles or on the wall.
- **Object library:** more models (sideboard, hallway unit, wall shelf, planter, chest of drawers, wardrobe, bookshelf).

## 0.4.3

- Fix: 0.4.1 still did not start. The library route's checks (in `object-designs/tools/`) were not picked up by the add-on snapshot, because the snapshot scan did not reach that folder. They are included now, and a test checks what the snapshot really takes.

## 0.4.1

- Fix: 0.4.0 did not start: the library files of the server (`tools/library/` and the shared checks) were missing from the add-on. They are included now, and a test checks that every file the server loads is in the add-on.

## 0.4.0

- **Colour bar on material choices.** Each material choice shows a wide bar in the colour that applies, with its name: the default, the whole object's material for a part, or the choice made. Part bars follow the whole object.
- **Object size checked against the model.** A blueprint object in the Editor shows the size its build has. A different size says why, and *Use the built size* or *Check the build* fixes or re-checks it. The Save list no longer warns about it.
- **Cut one of two overlapping walls.** The overlap warning offers *Cut one of them…*, which trims a hand-drawn wall to the face of the other. A cut that would lose something is refused with the reason.
- **Overlaps of room-bound walls fixed at the source.** Wall generation and joining no longer create the overlaps that two room-bound walls used to get.
- **Renaming a lamp moves its Home Assistant link.** The link in location.json follows the new id, in the same undo step and save.
- **Object library tools.** Library models are checked in a browser page, previewed (with a variant selector), compared with their schema and saved into the library from there.

## 0.3.0

- **Add menu in the Editor.** One *Add ▾* replaces the rows of buttons: in the house view (room, wall, stairs, solid, ceiling lamp, a box, and every blueprint of the library and your house), and in the wall, room and opening panels (door, window, passage, switch, lamps, LED strip, objects on that wall). An entry that cannot be used says why. *Import* is gone: the phone saves rooms into the house itself.
- **Place and change blueprints in the Editor.** Pick a blueprint from the Add menu and it stands in the middle of the selected room (or on the selected wall) with its default options. The object panel has the options form: change the shape, sizes and materials of each part there; the object is built again and takes the new size. Undo works as for anything else in the Editor.
- **Type a size, change the option.** On a blueprint object, typing a width, depth or height changes the option that sets it (a round table is as long as it is wide); values outside the option's range are refused with the range. Plantern checks the size of an object against a fresh build, with *Check the build*.
- **Copies keep the whole object.** *Duplicate* and *Copy from…* used to turn a blueprint object into a plain box. They now keep its blueprint, options and part materials, and *Copy from…* only offers objects it can copy.
- **Colours of objects.** An object made from a model or blueprint has no colour box; in the plan its footprint is the colour of its main part (the top of a table).
- **Fix:** renaming a lamp or switch in the Editor now moves its Home Assistant link in `location.json` too.
- **Old example model removed.** The shared example table in `assets/` is gone; the demo has the dining table blueprint.
- The same menu component and icons are used by the page menu.

## 0.2.0

- **Objects made from blueprints.** An object can now be a parametric model (a dining table in five shapes, for example) with its own sizes and materials. Open the Objects page from the page menu, pick a blueprint, set its options and *Place in house*; change the options of a placed object later as one undo step.
- **Blueprints of your own.** A house can keep its own blueprints in its `blueprints/` folder, as JSON, with no code. Plantern checks each one and says why it refuses one.
- **Built on the server, cached.** Plantern's server builds each object's 3D file and keeps it in its settings folder. *Clear cache* on the Storage page empties it; `glbCacheLimitMB` in `settings.json` limits its size.
- **Works without the server.** A browser keeps the 3D file of each placed object, so an object still shows when Plantern's server is off. An object with no file on hand shows as a marked box.
- **Page menu.** The pages are chosen from one menu at the top instead of a row of tabs, so new pages fit.
- **Resizable sidebar.** Drag the bar on the left of the sidebar on the Plan and Editor pages; the width is remembered.
- **Object catalog.** Errors show next to the field that has them, every number has a slider, and the preview is quicker.
- **Demo house.** The example table in the demo is now the dining table blueprint.

## 0.1.9

- Added stub for material library tool.

## 0.1.8

- The Editor has a *Place the house* section: where the house is (a position typed or pasted in any form, including a link from a maps app), which way plan north points (typed, or worked out from a wall and a compass bearing), and the height of the ground floor above sea level. It replaces *House orientation*.

## 0.1.7

- 0.1.6 (card messages as toasts) never reached Home Assistant because the release's test run failed on a timing problem; it is in this release.
- Fix: the sync state of a git storage could be left on "ok" instead of "pushed" when two refreshes overlapped.

## 0.1.6

- Messages and errors in the dashboard card are toasts floating over the plan (and fade out), so the plan no longer jumps when one appears.

## 0.1.5

- Fix: the card's version now also changes when only the way its files are published changes. 0.1.4 kept the same version as 0.1.3, so browsers kept running the old cached card and it stayed missing.

## 0.1.4

- Fix: after an update the dashboard card could fail with "Custom element doesn't exist: plantern-card", because the browser mixed the new card with old cached files. Every file of the card now carries the card's version.

## 0.1.3

- The dashboard card has a 2D / 3D switch, a background choice (dark, card colour, transparent) and fills the space the dashboard gives it.
- Floors in the card are pills instead of a dropdown. Choose which floors the card shows: one, several together, or a slideshow (seconds per floor).

## 0.1.2

- The add-on log now starts every line with a date and time.

## 0.1.1

- Fix: the dashboard card is now published to the right folder (/homeassistant/www/plantern in current Home Assistant), so it shows up under Add card.

## 0.1.0

- First release.
- The Plantern editor, wizard and viewer in the Home Assistant sidebar (ingress), no setup needed.
- Uses the add-on's own connection to Home Assistant for live lamps and switches.
- Houses are kept in a git repository, a network share or a folder, connected on the Storage page.
- A dashboard card (Add card, Plantern): the house plan with live lights, published to /config/www/plantern.

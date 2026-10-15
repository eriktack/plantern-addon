# Changelog

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

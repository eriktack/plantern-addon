# Changelog

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

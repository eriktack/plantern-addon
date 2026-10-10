# Changelog

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

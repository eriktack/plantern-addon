# Plantern

A data-driven floor plan of your house with your Home Assistant lights shown live, in 2D and 3D.

## First start

1. Start the add-on and open **Plantern** in the sidebar.
2. On the **Storage** page, connect where your houses are kept (a git repository, a network share
   or a folder). The demo house is there from the start.
3. No Home Assistant setup is needed: the add-on uses its own connection to Home Assistant.

## Phone

The add-on has an optional port 3000 (*Configuration → Network*). Set it to reach Plantern directly from a
phone on your home network while measuring rooms. Inside Home Assistant (the app or a browser) the sidebar
entry works without it.

## The dashboard card

The add-on copies the card and your houses to `/homeassistant/www/plantern/` (`/config` in older Home Assistant) (served as `/local/plantern/`) and adds the
card as a dashboard resource itself. In a dashboard choose **Add card, Plantern** and pick a house. If the
dashboard is in YAML mode, or Home Assistant refuses the automatic step, the add-on log tells you the resource to
add by hand (Settings, Dashboards, Resources: `/local/plantern/src/card/plantern-card.js`, JavaScript module).

The card has a **2D / 3D** switch in its header and fills the space the dashboard gives it (use a panel view or a
sized grid cell to make it big). In the card's editor, or in YAML:

```yaml
type: custom:plantern-card
location: /local/plantern/locations/<house>/location.json
view: 3d                # or 2d (default): what it opens on
levels: [ground, upper] # only these floors: one = just that floor; several = shown together (no picker)
cycle: 8                # with several floors: one at a time, this many seconds each (a slideshow)
background: transparent # dark (default), card (the theme's card colour) or transparent (the dashboard shows through)
height: 600             # the least height in pixels (default 420)
```

Files in `/local` are served without login, so anyone who can reach your Home Assistant's address sees the plans
of the houses listed in Plantern (not the Storage page, tokens or keys).

## Your data

Settings, connections to storages and their keys are kept in the add-on's own data folder and are included
in Home Assistant backups. Your houses are in the storage you connected, not in the add-on.

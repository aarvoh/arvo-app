# sotto — companion app

Phone companion app for the sotto smart glasses project (silent sEMG/EEG sub-vocal control glasses).

## What this is

A React + Vite Progressive Web App (PWA). Three real screens (Home, Maps, Settings) plus a slide-down overlay (Glass activity) that merges command events and AI assistant queries into one timeline.

## What's real vs. mocked

**Real:** all UI, all interactions (drag-to-open panel, modals, toggles, sliders, typed composer), PWA manifest/installability config.

**Mocked (not yet wired to anything live):** no real Instagram/WhatsApp/Spotify/Apple Music/Maps API connections, no real Claude API call, no real BLE connection to glasses hardware. Service badges and activity entries are illustrative fixed data, not live state.

## Running it

See HOW_TO_RUN.md.

## Structure

- `src/App.jsx` — root: tab routing, top drag handle for Glass activity
- `src/components/Home.jsx` — connect status, service badges, hero
- `src/components/Maps.jsx` — idle search + active navigation
- `src/components/Settings.jsx` — device, calibration, privacy/safety (locked confirm-before-post), glass behavior
- `src/components/GlassActivity.jsx` — unified timeline, publish-confirm modal, save/delete-confirm modal, composer
- `src/App.css` — design system (sage/brass/near-black palette, Space Grotesk/Inter/JetBrains Mono)

## Design rules that are load-bearing, not cosmetic

- Every social post requires explicit confirmation. This is permanent — never softened by a "trusted after N posts" rule.
- Declining to post ("Save, don't post") never deletes the file. It moves to a saved state in local storage; deletion is a separate, explicit second action.

See the project handbook for full rationale and the rest of the product spec (hardware, firmware, differentiators).

# ARVO — smart glasses companion app

Phone companion app for the ARVO smart glasses project. Phone = brain, glasses = display.

## What this is

A React + Vite Progressive Web App (PWA). Four screens (Home, Fitness, Maps, Settings) plus a slide-down Glass Activity overlay, a Glass HUD display at `/glass`, and a live AI brain at `/api/brain`.

## What's real vs. mocked

**Real:** all UI and interactions, camera PPG heart-rate sensing, step counter via DeviceMotion, live captions via Web Speech API, wake-word voice commands, BroadcastChannel phone↔glass sync, Spotify OAuth, Claude AI brain integration, PWA installability, localStorage settings persistence.

**Mocked:** no real BLE connection to glasses hardware; WhatsApp/Instagram/Apple Music feed data is illustrative.

## Running it

See HOW_TO_RUN.md.

## Structure

- `src/App.jsx` — root: tab routing (Home / Fitness / Maps / Settings), drag handle
- `src/components/Home.jsx` — connect status, quick actions, notification composer, send-to-glass
- `src/components/FitnessTracker.jsx` — camera PPG BPM, step counter, calorie calc, workout tracking
- `src/components/Maps.jsx` — idle search + active navigation
- `src/components/Settings.jsx` — device, calibration, privacy/safety, glass behavior
- `src/components/GlassActivity.jsx` — unified timeline, publish-confirm modal, composer
- `src/glass/GlassHUD.jsx` — 600×600 glass display: HUD, control panel, fitness overlay, captions
- `src/App.css` — phone design system
- `src/glass/GlassHUD.css` — glass display styles

## Design rules

- Every social post requires explicit confirmation — never softened.
- "Save, don't post" never deletes; deletion is a separate explicit action.
- ANTHROPIC_API_KEY lives only in `.env` (gitignored) — never committed.

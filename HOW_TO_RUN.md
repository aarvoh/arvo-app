# How to run ARVO

This is real React + Vite source code. To run locally:

1. Open this folder in a terminal
2. `npm install`
3. `npm run dev`
4. Open the printed `http://localhost:####` address in a browser

To test on your phone: run `npm run dev -- --host` and visit the Network address (e.g. `http://192.168.x.x:5173`) from a phone on the same WiFi.

## Screens

- `/` — Phone app (Home / Fitness / Maps / Settings tabs)
- `/glass` — 600×600 Glass HUD display (open in a second browser window/tab)

## Environment

Copy `.env.example` to `.env` and fill in your keys before running:

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_SPOTIFY_CLIENT_ID=...
VITE_SPOTIFY_REDIRECT_URI=http://localhost:5173
```

## Project structure

- `src/App.jsx` — root: tab routing, drag handle for Glass Activity overlay
- `src/components/Home.jsx` — connect status, quick actions, notification composer
- `src/components/FitnessTracker.jsx` — camera PPG heart rate, step counter, workout tracker
- `src/components/Maps.jsx` — idle search + active navigation
- `src/components/Settings.jsx` — device, calibration, privacy/safety, glass behavior
- `src/components/GlassActivity.jsx` — slide-down timeline, publish-confirm modal, composer
- `src/glass/GlassHUD.jsx` — 600×600 glass display with HUD, fitness overlay, live captions
- `src/App.css` — phone design system
- `src/glass/GlassHUD.css` — glass display styles

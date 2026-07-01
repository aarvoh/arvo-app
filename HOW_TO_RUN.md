# How to run sotto-app

This is real React + Vite source code, not a finished website. To see it, three commands are required, run once on a computer with Node.js installed (not on the phone):

1. Open this folder in a terminal
2. Run: npm install
3. Run: npm run dev
4. Open the printed http://localhost:#### address in a browser

To view on your phone instead of a computer browser: run `npm run dev -- --host` in step 3, then visit the "Network" address it prints (something like http://192.168.x.x:5173) from your phone, as long as the phone is on the same WiFi as the computer.

This project currently contains:
- src/App.jsx — root component, tab routing (Home / Maps / Settings), top drag handle
- src/components/Home.jsx — connect status screen
- src/components/Maps.jsx — idle search + active navigation
- src/components/Settings.jsx — device, calibration, privacy/safety, glass behavior
- src/components/GlassActivity.jsx — the slide-down panel: unified command/assistant timeline, publish-confirm modal, save/delete-confirm modal, phone-side composer
- src/App.css — all visual styling (sage/brass/near-black palette)
- src/index.css — global resets and font utility classes

Everything here is a frontend mockup with realistic interactions (state changes, fake timers standing in for network calls) — there is no real backend, no real Instagram/Maps/Spotify connection yet, and no Claude API call wired in. Those are separate, larger pieces of work.

# Pickleball Queue

A doubles queueing system with winners/losers brackets, single-line king-of-the-court mode, live court timers, undo, session archiving, and exports.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Build for production

```bash
npm run build
```

The static site goes to `dist/` — you can host it anywhere or open `dist/index.html` directly in a browser.

## Features

- Add players individually or in bulk
- Configurable number of courts
- Auto-detects W/L brackets vs single-line mode based on player/court ratio
- King-of-the-court rules in single-line mode (winners stay & split, out after 2-game streak)
- Live per-court timers; durations captured into history
- Undo (Cmd/Ctrl+Z) for every mutation
- Session name + date with live stats (players, played count, games, total play time)
- Leaderboard with W, L, GP, Win%, Best Streak — collapsible at the bottom
- End Session archives to `localStorage`; Past Sessions modal lets you view, re-export, or delete
- Auto-saves the live session to `localStorage` so a refresh doesn't lose state
- Export CSV, Markdown (clipboard), JSON, or print

## Tech

- React 18
- Vite
- Vanilla CSS (no UI library)
- React Context + useReducer for state
- `localStorage` for persistence

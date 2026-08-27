# Super-Badmin

Front-end-only badminton session scheduler. Please visit: https://davidyunus.github.io/super-badmin/ 

## Stack
- React + TypeScript
- Vite
- JSON roster
- localStorage for session/results
- No backend/database

## Run
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Player data
Edit `src/data/players.json`. Each player has only `name`, `rating`, and `gender`.

## Current MVP
- 23-player roster
- 3-court session generation
- MD / XD / WD only
- Configurable rounds/courts
- Exact team-rating matching when possible, max difference 1
- Partner/opponent repetition penalties
- Basic playing-load/rest balancing
- Score entry
- PDLUP-style W/L, point differential and points-for leaderboard
- localStorage persistence

The scheduler is intentionally isolated in `src/scheduler.ts` for later optimization.

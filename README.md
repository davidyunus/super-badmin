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
- 24-player roster
- 3-court session generation
- MD / XD / WD only
- Configurable rounds/courts
- Exact team-rating matching when possible, max difference 1
- Partner/opponent repetition penalties
- Basic playing-load/rest balancing
- Score entry
- PDLUP-style W/L, point differential and points-for leaderboard
- localStorage persistence

## Shared live sessions

The app supports shared rooms through the Cloudflare Worker backend. Enter the same room code on each device, then generate a session on the host device. Score changes are broadcast to every connected device.

For local development, run the Worker and frontend in separate terminals:

```bash
npm run worker:dev
npm run dev
```

The deployed frontend uses the live Worker automatically. To use another Worker URL, set `VITE_LIVE_API_URL` before building.

Worker commands:

```bash
npm run worker:typecheck
npm run worker:deploy
```

The scheduler is intentionally isolated in `src/scheduler.ts` for later optimization.

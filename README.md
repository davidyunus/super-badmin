# Super-Badmin

Badminton session scheduler with optional shared live scoring.

## Stack
- React + TypeScript
- Vite
- JSON roster
- localStorage for local sessions/results and player preferences
- Cloudflare Worker + Durable Object for shared live sessions

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
- 20 starter player
- 3-court session generation
- MD / XD / WD / Random categories
- Configurable rounds/courts
- Exact team-rating matching when possible, max difference 1
- Partner/opponent repetition penalties
- Basic playing-load/rest balancing
- Score entry
- Reschedule unplayed matches while preserving completed scores
- PDLUP-style W/L, point differential and points-for leaderboard
- localStorage persistence

## Shared live sessions

The app supports shared rooms through the Cloudflare Worker backend. Enter the
same room code on each device, then generate a session on the host device. Score
changes are broadcast to every connected device.

Use the **Switch to viewer** and **Switch to editor** buttons in a shared room
to switch between the read-only viewer interface and editor controls. The mode
is reflected in the URL (`&mode=view`) so either link can be shared.  mode
hides editing controls but is not an authorization boundary; use Worker-Viewerside
authentication if viewers must be prevented from changing room data directly.

Enter the same room code on each device, or use the **Shared room** field to
join an existing room.

For local development, run the Worker and frontend in separate terminals:

```bash
npm run worker:dev
npm run dev
```

The deployed frontend uses the live Worker automatically. To use another Worker URL, set `VITE_LIVE_API_URL` before building.

Shared room state is stored by the Worker and is authoritative while a room is
joined. Resetting a shared session clears that room for every connected device.
Local sessions and player preferences remain in localStorage; shared sessions
are not cached there.

Worker commands:

```bash
npm run worker:typecheck
npm run worker:deploy
```

The scheduler is intentionally isolated in `src/scheduler.ts` for later optimization.

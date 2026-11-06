# Performance scripts

Small Playwright scripts that measure the things docs/PERFORMANCE.md and docs/BUILD_METHOD.md set as budgets. They need `playwright-core` with its browsers installed (`PLAYWRIGHT_CORE`
points at the module), a production build served on port 3101 (`NEXT_DIST_DIR=.next-prod npx next build`, then `NEXT_DIST_DIR=.next-prod npx next start -p 3101`, which sits beside the dev
server) and the data server (`node scripts/data-server.mjs`). Measure Safari's engine (`webkit`) as well as Chromium: the freezes that made views pop only showed in WebKit.

| Script | What it answers |
|---|---|
| `open-views.cjs` | When does each view reveal, and are there slow frames while it opens? |
| `preload-reveal.cjs` | With the data preloaded, does a view open with its content and no loader? |
| `scroll-frames.cjs` | How smooth is scrolling across the tiles, and what writes to the page while it happens? |
| `cold-budget.cjs` | Cold visit at 60 ms and 20 Mbit: profile on screen, view reveal, first tile with content. |
| `next-tile-waits.cjs` | Does the tile beside the one in view stay unplayed until it is scrolled to? |
| `filter-change.cjs` | How long a filter change takes to update the first screen. |
| `root-budget.cjs` | The root pages' cold visit, warm visit and filter change against the budget, on a production build. |
| `root-pairs.cjs` | The filter pair check for the five root pages: every pair in both orders gives the same list. |
| `safari-root-pages.js` | The root pages in Safari: table, filter, Clear all, search, sticky header, hover menu, a Series row. Set the address first. |

Also: `snapshot-bowl.ts` (one folder up) writes what the whole-match loaders answer for 150 bowlers in every format, so a change to how they are worked out can be proved to give the same numbers.

| `safari-run.sh` | Runs one Safari script in the front tab (only when it is on localhost:3100) and prints its report: `safari-run.sh safari-matrix.js /players/v-kohli-ba607b88 "window.__matrix.done" "window.__matrix.report" 240`. Exits 1 on a FAILED line or no answer. |

## Other checks (not in `npm run verify`, run when the part they name changes)

| Script | What it answers |
|---|---|
| `points-blocked.cjs` | The Batting and Bowling tiles of ten players with the point files served against the same tiles with them blocked (the SQL fallback). |
| `menu-links.cjs` | A hover menu link to another address of the same section shows that page. |
| `empty-centred.cjs` | Every "nothing to show" message sits in the middle of its box. |
| `match-info-layout.cjs` | The Match info cards lay out for every case the data has. |
| `match-names.cjs` | Every player name on the Match page is a link. |
| `pin-gap.cjs` | Nothing shows through the gaps of the pinned parts of a Full stats table. |
| `profile-mat.cjs` | The profile's Mat against the playing XI lists. |
| `replay-transition.cjs` | The Replay moves between views as the other views do, frame by frame. |
| `rest-repro.cjs` | The hand scroll cases of `carousel-rest.cjs` for one pane in WebKit, run alone. |
| `tournament-smoke.cjs` | A first look at the Tournament page: every view and tile, console errors, NaN text. |
| `phone-sheet.cjs` | Contact sheets of pages on a phone sized window (PHONE_LAYOUT.md, "Tile audit"). |
| `../bench-points.ts`, `../match-sweep.ts` | Point file against SQL timing in Node, and every match bundle through the summary's rules. |


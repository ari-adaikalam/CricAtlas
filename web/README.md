# CricAtlas web app

The Next.js app behind <https://cricatlas.ariadaikalam.com>. It reads small Parquet and JSON files over HTTP and answers questions in the browser with DuckDB-WASM. How it is built, and why, is in [../docs/design_decisions.md](../docs/design_decisions.md).

## Run it

You need Node.js 24 and the data files (see "The data" below).

1. `npm ci`. The postinstall step copies the DuckDB files into `public/duckdb`.
2. `cp .env.example .env.local` and set `NEXT_PUBLIC_DATA_BASE_URL` to where the data files are served from.
3. `npm run data` serves `../data/export` on port 8788, with the headers a hosted bucket would send.
4. `npm run dev`, then open <http://localhost:3000>.

## Checks

```
npx next typegen
npm run typecheck
npm run lint
npm test
npm run build
```

CI runs the same steps. `npm test` needs no data. The scripts in `scripts/perf/` are Playwright checks for speed, layout and animation. They need `playwright-core` with its browsers, and `PLAYWRIGHT_CORE` pointing at the module.

## Environment variables

| Variable | Where | What it is |
|---|---|---|
| `NEXT_PUBLIC_DATA_BASE_URL` | build and browser | Where the data files are served from. Public. |
| `NEXT_PUBLIC_API_BASE_URL` | build and browser | Optional. Points the API page at another API host. Public. |
| `API_PROXY_ORIGIN`, `API_PROXY_TOKEN` | server only | Where `/api` is passed through to, and the credential that goes with it. Without both, `/api` answers 503. Never public. |

## The data

`../tools/export.py` writes the Parquet files and `manifest.json` from the dataset's final CSV files, which a separate pipeline builds from the Cricsheet archives. Those files are not in this repository. The other scripts in `../tools/` split the tables into per-player and per-match files, and `../tools/upload_data.sh` uploads them to a new version prefix in the bucket.

## Layout

- `src/domain/`: pure rules and types, such as wagon wheel geometry, filters, totals and slugs. Unit tested.
- `src/data/`: the browser data engine and the queries.
- `src/components/`: the pages, tiles and charts.
- `src/app/`: the routes.
- `src/proxy.ts`: the 404 lookup for addresses, and the pass-through to the API.
- `scripts/`: the build steps for profiles and recorded views, and the scripts that check the numbers against a second calculation.

#!/usr/bin/env bash
# Builds everything the browser reads, in order, into data/export:
#   1. the exported tables, the per-player files and the search list   (tools/export.py, which calls tools/player_files.py)
#   2. one profile bundle for each player                              (web/scripts/build-profiles.ts)
#   3. the recorded default-view answers for each player and view      (web/scripts/build-views.ts)
# About ten minutes in all. Then tools/upload_data.sh sends it to the bucket.
set -euo pipefail
cd "$(dirname "$0")/.."
../.venv/bin/python tools/export.py "$@"
cd web
npx vite-node --config vitest.config.ts scripts/build-profiles.ts
npx vite-node --config vitest.config.ts scripts/build-views.ts

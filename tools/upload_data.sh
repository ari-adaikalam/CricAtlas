#!/usr/bin/env bash
# Uploads the browser data to the R2 bucket under a version prefix, with a one-year immutable cache header.
#
#   tools/upload_data.sh <rclone-remote>:<bucket>        e.g.  tools/upload_data.sh r2:cricatlas-data
#
# The prefix is the export's build time (data/export/manifest.json), so every export is a new, immutable set of files: nothing is ever overwritten, nothing stale is ever served
# from a cache, and the app moves to the new data by changing one setting (NEXT_PUBLIC_DATA_BASE_URL=https://data.<your domain>/<prefix>).
# Only what the browser reads is sent: the per-player files, the bundles and views, the search list and the small shared tables. The three big ball files stay at home.
set -euo pipefail
cd "$(dirname "$0")/.."
target="${1:?usage: tools/upload_data.sh <rclone-remote>:<bucket>}"
src="data/export"
[ -f "$src/manifest.json" ] || { echo "no $src/manifest.json: run the export first" >&2; exit 1; }
for dir in p/profile p/view p/bat; do [ -d "$src/$dir" ] || { echo "missing $src/$dir: run the export, then web/scripts/build-profiles.ts and build-views.ts" >&2; exit 1; }; done
prefix="v$(python3 -c "import json,re;print(re.sub(r'[^0-9]','',json.load(open('$src/manifest.json'))['built'])[:12])")"
echo "uploading to $target/$prefix"
rclone copy "$src" "$target/$prefix" \
  --include "p/**" --include "r/**" --include "m/**" --include "t/**" --include "n/**" --include "search.json" --include "home.json" --include "mlist.json" --include "plist.json" \
  --include "players.parquet" --include "player_summary.parquet" --include "matches.parquet" --include "milestone_pace.parquet" --include "reviews.parquet" \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --transfers 64 --checkers 64 --s3-no-check-bucket --progress
echo
echo "done. Set, in the app's environment:"
echo "  NEXT_PUBLIC_DATA_BASE_URL=https://data.<your domain>/$prefix"

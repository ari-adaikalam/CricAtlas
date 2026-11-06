"""Write web/src/data/teamColours.json from data/team_colours.csv: team -> [primary, secondary, accent], and teamShorts.json: team -> the letters on its emblem.

Usage (from the repo root): .venv/bin/python cricatlas/tools/team_colours_json.py
The app bundles this small file, so a colour never waits on a network request.
"""
import csv, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
rows = list(csv.DictReader(open(ROOT / "data" / "team_colours.csv", newline="")))
out = {r["team"]: [r["c1"], r["c2"], r["c3"]] for r in rows}
(ROOT / "web" / "src" / "data" / "teamColours.json").write_text(json.dumps(out, indent=0, sort_keys=True) + "\n")
# The letters on an emblem come from team_shorts.csv (the usual abbreviations), not from the generated short column of team_colours.csv.
shorts = {r["team"]: r["short"] for r in csv.DictReader(open(ROOT / "data" / "team_shorts.csv", newline=""))}
(ROOT / "web" / "src" / "data" / "teamShorts.json").write_text(json.dumps(shorts, indent=0, sort_keys=True) + "\n")
print(len(out), "teams")

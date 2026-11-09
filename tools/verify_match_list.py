"""Checks mlist.json (the Matches page's list) against the tables.

Usage, from the dataset repo root:   .venv/bin/python cricatlas/tools/verify_match_list.py [--out cricatlas/data/export]

Every match is there once. The runs in the two scores of a match add up to the runs of its balls (a Super Over left out), counted again with a different query, and the winner agrees with `matches`.
"""
import argparse, json, re
from pathlib import Path
import duckdb

ap = argparse.ArgumentParser()
ap.add_argument("--out", default="cricatlas/data/export")
out = Path(ap.parse_args().out)
d = json.loads((out / "mlist.json").read_text())
con = duckdb.connect()
m = f"'{out}/matches.parquet'"
b = f"'{out}/balls_by_match.parquet'"
truth = {r[0]: (r[1], r[2]) for r in con.execute(f"select m.match_id, m.winner_id, coalesce(t.runs, 0) from {m} m left join (select match_id, sum(runs_off_bat + extras)::int as runs from {b} where not is_super_over group by 1) t using (match_id)").fetchall()}
bad = []
ids = [r[0] for r in d["rows"]]
if len(ids) != len(set(ids)) or set(ids) != set(truth):
    bad.append(("matches differ", len(ids), len(truth)))
def runs(score):
    return sum(int(part.strip().split("/")[0].rstrip("d")) for part in score.split("&")) if score else 0
for r in d["rows"]:
    mid, w = r[0], r[6]
    wid, total = truth[mid]
    if runs(r[7]) + runs(r[8]) != total:
        bad.append((mid, "runs", runs(r[7]) + runs(r[8]), total))
    team_ids = [d["teams"][r[4]][0], d["teams"][r[5]][0]]
    expected = -1 if wid is None else team_ids.index(wid) if wid in team_ids else -1
    if w != expected:
        bad.append((mid, "winner", w, expected))
print(f"{len(ids)} matches checked, {len(bad)} differences")
for x in bad[:10]:
    print(x)

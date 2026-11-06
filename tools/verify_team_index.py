"""Checks t/index.json (the Teams page's list) against the tables.

Usage, from the dataset repo root:   .venv/bin/python cricatlas/tools/verify_team_index.py [--out cricatlas/data/export]

Matches, wins, losses and no results are counted again from `matches` with a different query, and titles from the tournament files (n/b), which pick the champion of each edition on their own.
"""
import argparse, collections, glob, json
from pathlib import Path
import duckdb

ap = argparse.ArgumentParser()
ap.add_argument("--out", default="cricatlas/data/export")
out = Path(ap.parse_args().out)
idx = {r[0]: r for r in json.loads((out / "t" / "index.json").read_text())}
con = duckdb.connect()
m = f"'{out}/matches.parquet'"
rows = con.execute(f"""
  select t, count(*), sum((w = t)::int), sum((w is not null and w <> t)::int), sum(coalesce((o = 'no result')::int, 0)) from (
    select team_1_id as t, winner_id as w, outcome as o from {m} union all select team_2_id, winner_id, outcome from {m}) group by 1""").fetchall()
bad = []
for t, n, won, lost, nr in rows:
    r = idx.get(t)
    if r is None or (r[4], r[9], r[10], r[11]) != (n, won, lost, nr):
        bad.append((t, (n, won, lost, nr), None if r is None else (r[4], r[9], r[10], r[11])))
if set(idx) != {r[0] for r in rows}:
    bad.append(("teams differ", len(idx), len(rows)))
titles = collections.Counter()
for f in glob.glob(str(out / "n" / "b" / "*.json")):
    mc = json.loads(Path(f).read_text())["m"]["c"]
    by = collections.defaultdict(collections.Counter)
    for i in range(len(mc["match_id"])):
        if mc["stage_name"][i] == "Final" and mc["winner_id"][i]:
            by[mc["edition"][i]][mc["winner_id"][i]] += 1
    for c in by.values():
        top = c.most_common(2)
        if len(top) == 1 or top[0][1] > top[1][1]:
            titles[top[0][0]] += 1
for t, r in idx.items():
    if r[12] != titles.get(t, 0):
        bad.append((t, "titles", r[12], titles.get(t, 0)))
print(f"{len(idx)} teams checked, {len(bad)} differences")
for b in bad[:10]:
    print(b)

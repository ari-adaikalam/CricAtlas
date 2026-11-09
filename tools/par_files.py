"""The par score band for the first innings of a limited-overs match.

Called by tools/match_files.py. One small file for each such match, `m/par/<match id>.json`: the 25th, 50th and 75th percentile of the first-innings score after each over, over the first innings of
comparable matches. Comparable means the same tournament and gender, in the match's season and the two seasons before it, with the same scheduled length. With fewer than 30 such innings it widens
to the same format and gender (all tournaments and seasons). The match itself is left out. An innings that ended early keeps its final score for the overs it did not use.

  v      1                    n    how many innings the band is over        scope   "tournament" or "format"
  p25 p50 p75   the score after over 1, 2, ... N (sets of five balls in The Hundred), whole runs
"""
import json
from pathlib import Path

import numpy as np

MIN_INNINGS = 30


def write_par_files(con, exp: Path, out: Path, kind_of, mids: list[int]) -> int:
    ms = con.sql(f"""
      select match_id, season, gender, tournament_key, format, type, scheduled_overs
      from read_parquet('{exp / 'matches.parquet'}')
    """).fetchall()
    first = con.sql(f"""
      select match_id, "over"::int ov, sum(runs_off_bat + coalesce(extras, 0))::int r
      from read_parquet('{exp / 'balls_by_match.parquet'}') where innings = 1 and not is_super_over group by 1, 2 order by 1, 2
    """).fetchall()
    per: dict[int, dict[int, int]] = {}
    for mid, ov, r in first:
        per.setdefault(int(mid), {})[int(ov)] = int(r)
    info: dict[int, dict] = {}
    seasons: dict[tuple, set] = {}
    for (mid, season, gender, tkey, fmt, typ, sched) in ms:
        mid = int(mid)
        kind = kind_of(fmt, typ)
        if kind == "test" or mid not in per:
            continue
        overs = per[mid]
        length = 20 if kind == "hundred" else int(sched) if sched else max(overs) + 1
        cum, run = [], 0
        for k in range(length):
            run += overs.get(k, 0)
            cum.append(run)
        # an innings that ran past its scheduled length keeps counting, so the band's length is the scheduled one
        info[mid] = dict(kind=kind, gender=gender, tkey=tkey, season=str(season), length=length, cum=np.array(cum, dtype=float))
        if tkey:
            seasons.setdefault((tkey, gender), set()).add(str(season))
    order = {k: sorted(v) for k, v in seasons.items()}
    by_pool: dict[tuple, list[int]] = {}
    by_kind: dict[tuple, list[int]] = {}
    for mid, m in info.items():
        by_kind.setdefault((m["kind"], m["gender"], m["length"]), []).append(mid)
        if m["tkey"]:
            by_pool.setdefault((m["tkey"], m["gender"], m["length"]), []).append(mid)
    (out / "m" / "par").mkdir(parents=True, exist_ok=True)
    wanted = set(mids) if mids else None
    written = 0
    for mid, m in info.items():
        if wanted is not None and mid not in wanted:
            continue
        pool, scope = [], "format"
        if m["tkey"]:
            ss = order[(m["tkey"], m["gender"])]
            at = ss.index(m["season"])
            keep = set(ss[max(0, at - 2): at + 1])
            pool = [x for x in by_pool.get((m["tkey"], m["gender"], m["length"]), []) if x != mid and info[x]["season"] in keep]
            scope = "tournament"
        if len(pool) < MIN_INNINGS:
            pool = [x for x in by_kind.get((m["kind"], m["gender"], m["length"]), []) if x != mid]
            scope = "format"
        if len(pool) < MIN_INNINGS:
            continue
        mat = np.vstack([info[x]["cum"] for x in pool])
        p25, p50, p75 = (np.round(np.percentile(mat, q, axis=0)).astype(int).tolist() for q in (25, 50, 75))
        (out / "m" / "par" / f"{mid}.json").write_text(json.dumps(dict(v=1, n=len(pool), scope=scope, p25=p25, p50=p50, p75=p75), separators=(",", ":")))
        written += 1
    return written

"""Checks the match bundles (tools/match_files.py) against tables built another way.

Usage, from the CricAtlas repo root:   ../.venv/bin/python tools/verify_match_bundles.py [--data data/export] [--limit N]

  1. Every match and every innings in the data has a bundle and an innings entry.
  2. Inside each innings, the batters' runs plus the extras equal the innings total, and the extras parts add up.
  3. A batter's runs, balls, fours, sixes and out flag equal `bat_innings.parquet` (built from the player's own file).
  4. A bowler's balls, runs, wickets and maidens equal `bowl_innings.parquet`, and the dots equal a count from the bowler file (a legal delivery with nothing off the bat, byes included, as `bowl_innings.dots` counts them).
  5. The wickets of an innings equal the dismissals in `wickets.parquet` other than retirements.
Exits with a non-zero code when anything differs, and prints the first few differences of each check.
"""
import argparse, json, sys
from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parents[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(HERE / "data" / "export"))
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    root = Path(a.data)
    files = sorted((root / "m" / "bundle").glob("*.json"), key=lambda p: int(p.stem))
    if a.limit:
        files = files[: a.limit]
    inns, bats, bowls = [], [], []
    fows, stands, phs, flds, revs, awds, rets = [], [], [], [], [], [], []
    for f in files:
        b = json.loads(f.read_text())
        mid = b["match"]["id"]
        for pm in b["match"]["potm"]:
            if pm.get("award"):
                awds.append((mid, pm["name"], pm["award"]["n"]))
        for i in b["innings"]:
            e = i["extras"]
            inns.append((mid, i["n"], i["runs"], i["wkts"], e["wd"] + e["nb"] + e["b"] + e["lb"] + e["pen"], sum(x["runs"] for x in i["batters"]), i["balls"], i["super"]))
            for x in i["batters"]:
                bats.append((mid, i["n"], x["id"], x["runs"], x["balls"], x["fours"], x["sixes"], x["out"] is not None and x["out"]["type"] not in ("retired hurt", "retired not out")))
            for f in i.get("fow", []):
                fows.append((mid, i["n"], f["n"], f["runs"], f["id"], f["batRuns"], f["type"]))
            for f in i.get("retired", []):
                rets.append((mid, i["n"], f["n"], f["runs"]))
            for k, st in enumerate(i.get("partnerships", [])):
                stands.append((mid, i["n"], k, st["wkt"], st["runs"], st["balls"], st["a"]["id"], st["a"]["runs"], st["a"]["balls"], st["b"]["id"], st["b"]["runs"], st["b"]["balls"]))
            for ph in i.get("phases", []):
                e2 = ph["extras"]
                phs.append((mid, i["n"], ph["key"], ph["runs"], ph["balls"], ph["wkts"], ph["fours"], ph["sixes"], e2["wd"], e2["nb"], e2["b"], e2["lb"], e2["pen"]))
            for fl in i.get("fielding", []):
                flds.append((mid, i["n"], fl["c"], fl["st"], fl["ro"]))
            for rv in i.get("reviews", []):
                revs.append((mid, i["n"]))
            for x in i["bowlers"]:
                bowls.append((mid, i["n"], x["id"], x["balls"], x["runs"], x["wkts"], x["maidens"], x["dots"]))
    con = duckdb.connect()
    con.execute("create table bi(match_id bigint, innings int, runs int, wkts int, extras int, bat_runs int, balls int, sup boolean)")
    con.executemany("insert into bi values (?,?,?,?,?,?,?,?)", inns)
    con.execute("create table bb(match_id bigint, innings int, pid varchar, runs int, balls int, fours int, sixes int, is_out boolean)")
    con.executemany("insert into bb values (?,?,?,?,?,?,?,?)", bats)
    con.execute("create table bw(match_id bigint, innings int, pid varchar, balls int, runs int, wkts int, maidens int, dots int)")
    con.executemany("insert into bw values (?,?,?,?,?,?,?,?)", bowls)
    con.execute("create table bf(match_id bigint, innings int, n int, runs int, pid varchar, bat_runs int, wtype varchar)")
    con.executemany("insert into bf values (?,?,?,?,?,?,?)", fows)
    con.execute("create table brt(match_id bigint, innings int, n int, runs int)")
    con.executemany("insert into brt values (?,?,?,?)", rets)
    con.execute("create table bs(match_id bigint, innings int, k int, wkt int, runs int, balls int, a_id varchar, a_runs int, a_balls int, b_id varchar, b_runs int, b_balls int)")
    con.executemany("insert into bs values (?,?,?,?,?,?,?,?,?,?,?,?)", stands)
    con.execute("create table bp(match_id bigint, innings int, pk varchar, runs int, balls int, wkts int, fours int, sixes int, wd int, nb int, byes int, lb int, pen int)")
    con.executemany("insert into bp values (?,?,?,?,?,?,?,?,?,?,?,?,?)", phs)
    con.execute("create table bl(match_id bigint, innings int, c int, st int, ro int)")
    con.executemany("insert into bl values (?,?,?,?,?)", flds)
    con.execute("create table ba(match_id bigint, name varchar, n int)")
    con.executemany("insert into ba values (?,?,?)", awds)
    con.execute("create table br(match_id bigint, innings int)")
    con.executemany("insert into br values (?,?)", revs)
    ex = root
    failures = 0

    def report(name: str, sql: str) -> None:
        nonlocal failures
        rows = con.sql(sql).fetchall()
        if rows:
            failures += 1
            print(f"FAIL {name}: {len(rows)} differences, first few: {rows[:4]}")
        else:
            print(f"ok   {name}")

    ids = ",".join(str(int(p.stem)) for p in files)
    report("every match has a bundle", f"select match_id from '{ex / 'matches.parquet'}' where match_id in ({ids}) except select distinct match_id from bi") if a.limit == 0 else None
    report("every innings is present", f"select match_id, innings from '{ex / 'innings.parquet'}' where match_id in ({ids}) except select match_id, innings from bi")
    report("no extra innings", f"select match_id, innings from bi except select match_id, innings from '{ex / 'innings.parquet'}'")
    report("batters' runs plus extras equal the total", "select match_id, innings, runs, bat_runs, extras from bi where bat_runs + extras <> runs")
    report("wickets equal the dismissals other than retirements",
           f"select bi.match_id, bi.innings, bi.wkts, w.n from bi left join (select match_id, innings, count(*) n from '{ex / 'wickets.parquet'}' where wicket_type not in ('retired hurt', 'retired not out') group by 1, 2) w "
           f"on w.match_id = bi.match_id and w.innings = bi.innings where bi.wkts <> coalesce(w.n, 0)")
    report("batters equal bat_innings",
           f"select b.match_id, b.innings, b.pid, b.runs, i.runs, b.balls, i.balls, b.fours, i.fours, b.sixes, i.sixes, b.is_out, i.is_out from bb b join '{ex / 'bat_innings.parquet'}' i "
           f"on i.match_id = b.match_id and i.innings = b.innings and i.player_id = b.pid "
           f"where b.runs <> i.runs or b.balls <> i.balls or b.fours <> i.fours or b.sixes <> i.sixes or b.is_out <> i.is_out")
    report("bat_innings rows all appear in the bundle",
           f"select i.match_id, i.innings, i.player_id from '{ex / 'bat_innings.parquet'}' i where i.match_id in ({ids}) "
           f"and not exists (select 1 from bb b where b.match_id = i.match_id and b.innings = i.innings and b.pid = i.player_id)")
    report("bowlers equal bowl_innings",
           f"select b.match_id, b.innings, b.pid, b.balls, i.balls, b.runs, i.runs, b.wkts, i.wickets, b.maidens, i.maidens from bw b join '{ex / 'bowl_innings.parquet'}' i "
           f"on i.match_id = b.match_id and i.innings = b.innings and i.player_id = b.pid "
           f"where b.balls <> i.balls or b.runs <> i.runs or b.wkts <> i.wickets or b.maidens <> i.maidens")
    report("bowlers' dots equal the bowler file (a legal delivery with nothing off the bat)",
           f"select b.match_id, b.innings, b.pid, b.dots, f.dots from bw b join (select match_id, innings, bowler_id, count(*) filter (where is_legal_delivery and runs_off_bat = 0)::int dots "
           f"from '{ex / 'balls_by_bowler.parquet'}' group by 1, 2, 3) f on f.match_id = b.match_id and f.innings = b.innings and f.bowler_id = b.pid where b.dots <> f.dots")
    report("bowl_innings rows all appear in the bundle",
           f"select i.match_id, i.innings, i.player_id from '{ex / 'bowl_innings.parquet'}' i where i.match_id in ({ids}) "
           f"and not exists (select 1 from bw b where b.match_id = i.match_id and b.innings = i.innings and b.pid = i.player_id)")
    report("the retirements listed equal the retired hurt and not out rows, each numbered as the next wicket",
           f"select coalesce(r.match_id, w.match_id) m, coalesce(r.innings, w.innings) i, r.n, w.n from (select match_id, innings, count(*) n from brt group by 1, 2) r "
           f"full join (select w.match_id, w.innings, count(*) n from '{ex / 'wickets.parquet'}' w join bi on bi.match_id = w.match_id and bi.innings = w.innings and not bi.sup "
           f"where w.wicket_type in ('retired hurt', 'retired not out') group by 1, 2) w on w.match_id = r.match_id and w.innings = r.innings where coalesce(r.n, 0) <> coalesce(w.n, 0) "
           f"union all select match_id, innings, n, wkts from (select r.match_id, r.innings, r.n, bi.wkts from brt r join bi using (match_id, innings) where r.n > bi.wkts + 1)")
    nb = "('retired hurt', 'retired not out')"
    report("the fall of wickets lists every wicket, in order, with the score rising",
           f"select bi.match_id, bi.innings, bi.wkts, count(bf.n) c from bi left join bf using (match_id, innings) where not bi.sup group by 1, 2, 3, bi.runs having count(bf.n) <> bi.wkts "
           f"union all select match_id, innings, n, runs from (select *, lag(runs) over (partition by match_id, innings order by n) prev from bf) where prev is not null and runs < prev")
    report("the fall of wickets ends no higher than the innings total",
           "select bf.match_id, bf.innings, max(bf.runs), any_value(bi.runs) from bf join bi using (match_id, innings) group by 1, 2 having max(bf.runs) > any_value(bi.runs)")
    report("a dismissed batter's score at the fall equals their card",
           "select f.match_id, f.innings, f.pid, f.bat_runs, b.runs from bf f join bb b on b.match_id = f.match_id and b.innings = f.innings and b.pid = f.pid where f.bat_runs is not null and f.bat_runs <> b.runs")
    report("the partnerships add up to the innings runs",
           "select s.match_id, s.innings, sum(s.runs) r, any_value(bi.runs) t from bs s join bi using (match_id, innings) group by 1, 2 having sum(s.runs) <> any_value(bi.runs)")
    report("the partnerships add up to the batters' balls, and each batter's runs to their card",
           "select s.match_id, s.innings, sum(s.balls), any_value(bi.balls_faced) from bs s join (select match_id, innings, sum(balls) balls_faced from bb group by 1, 2) bi using (match_id, innings) group by 1, 2 having sum(s.balls) <> any_value(bi.balls_faced) "
           "union all select m.match_id, m.innings, m.r, b.runs from (select match_id, innings, pid, sum(r) r from (select match_id, innings, a_id pid, a_runs r from bs union all select match_id, innings, b_id, b_runs from bs) where pid is not null group by 1, 2, 3) m join bb b on b.match_id = m.match_id and b.innings = m.innings and b.pid = m.pid where m.r <> b.runs")
    report("the phases add up to the innings runs, balls, wickets, boundaries and extras",
           "select p.match_id, p.innings, sum(p.runs) r, any_value(bi.runs) t, sum(p.balls) b, any_value(bi.balls) tb, sum(p.wkts) w, any_value(bi.wkts) tw from bp p join bi using (match_id, innings) group by 1, 2 "
           "having sum(p.runs) <> any_value(bi.runs) or sum(p.balls) <> any_value(bi.balls) or sum(p.wkts) <> any_value(bi.wkts) "
           "union all select b.match_id, b.innings, sum(b.fours), sum(b.sixes), 0, 0, 0, 0 from (select p.match_id, p.innings, sum(p.fours) fours, sum(p.sixes) sixes from bp p group by 1, 2) b join (select match_id, innings, sum(fours) f, sum(sixes) s from bb group by 1, 2) c using (match_id, innings) group by b.match_id, b.innings, c.f, c.s having sum(b.fours) <> c.f or sum(b.sixes) <> c.s")
    report("the fielding counts equal the catches and stumpings that name a fielder, and the bowler's catches",
           f"with w as (select w.match_id, w.innings, count(*) filter (where w.wicket_type = 'caught and bowled' or (w.wicket_type = 'caught' and exists (select 1 from '{ex / 'wicket_fielders.parquet'}' f where f.match_id = w.match_id and f.innings = w.innings and f.delivery_number = w.delivery_number and f.wicket_number = w.wicket_number))) c, "
           f"count(*) filter (where w.wicket_type = 'stumped' and exists (select 1 from '{ex / 'wicket_fielders.parquet'}' f where f.match_id = w.match_id and f.innings = w.innings and f.delivery_number = w.delivery_number and f.wicket_number = w.wicket_number)) st "
           f"from '{ex / 'wickets.parquet'}' w where w.match_id in ({ids}) group by 1, 2), "
           "f as (select match_id, innings, sum(c) c, sum(st) st from bl group by 1, 2) select w.match_id, w.innings, w.c, f.c, w.st, f.st from w join bi using (match_id, innings) left join f using (match_id, innings) where not bi.sup and (w.c <> coalesce(f.c, 0) or w.st <> coalesce(f.st, 0))")
    report("the reviews of a match equal the review rows of its innings",
           f"select r.match_id, count(*) n, coalesce(any_value(x.n), 0) b from '{ex / 'reviews.parquet'}' r join bi on bi.match_id = r.match_id and bi.innings = r.innings and not bi.sup left join (select match_id, count(*) n from br group by 1) x on x.match_id = r.match_id "
           f"where r.match_id in ({ids}) group by 1 having count(*) <> coalesce(any_value(x.n), 0)")
    report("the award counts equal a running count over the matches of the same edition or series",
           f"with m as (select match_id, start_date, coalesce(edition, 'series|' || coalesce(event, '') || '|' || season) as sc, player_of_match as nm from '{ex / 'matches.parquet'}' union all "
           f"select match_id, start_date, coalesce(edition, 'series|' || coalesce(event, '') || '|' || season), player_of_match_2 from '{ex / 'matches.parquet'}'), "
           "d as (select distinct * from m where nm is not null), r as (select match_id, nm as name, count(*) over (partition by sc, nm order by start_date, match_id rows unbounded preceding) n from d) "
           "select ba.match_id, ba.name, ba.n, r.n from ba join r using (match_id, name) where ba.n <> r.n")
    # --- the ball files (tools/ball_files.py): one for every innings, equal to the bundle ---
    bad_balls: list = []
    for f in files:
        b = json.loads(f.read_text())
        mid = b["match"]["id"]
        for inn in b["innings"]:
            bp = root / "m" / "balls" / f"{mid}_{inn['n']}.json"
            if not bp.exists():
                bad_balls.append((mid, inn["n"], "missing"))
                continue
            bf_ = json.loads(bp.read_text())
            n = len(bf_["d"])
            runs = sum(bf_["rb"]) + sum(bf_["wd"]) + sum(bf_["nb"]) + sum(bf_["by"]) + sum(bf_["lb"]) + sum(bf_["pe"])
            lens = {len(bf_[k]) for k in ("ov", "sb", "lg", "st", "bo", "rb", "wd", "nb", "by", "lb", "pe", "w", "sh", "ln", "le", "ct", "wp")}
            if n != inn["deliveries"] or runs != inn["runs"] or lens != {n} or sum(bf_["lg"]) != inn["balls"]:
                bad_balls.append((mid, inn["n"], f"deliveries {n}/{inn['deliveries']} runs {runs}/{inn['runs']} legal {sum(bf_['lg'])}/{inn['balls']} lens {sorted(lens)}"))
            elif not inn["super"] and sum(bf_["w"]) != inn["wkts"]:
                bad_balls.append((mid, inn["n"], f"wickets {sum(bf_['w'])}/{inn['wkts']}"))
            elif any(v > 100 or v < -1 for v in bf_["wp"]) or any(v >= len(bf_["pl"]) for v in bf_["st"] + bf_["bo"]):
                bad_balls.append((mid, inn["n"], "a value outside its list or range"))
    if bad_balls:
        failures += 1
        print(f"FAIL ball files: {len(bad_balls)} differences, first few: {bad_balls[:4]}")
    else:
        print("ok   the ball files hold every delivery, the runs, the legal balls and the wickets of each innings, and every index is inside its list")
    print("batter rows", len(bats), "bowler rows", len(bowls), "innings", len(inns))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

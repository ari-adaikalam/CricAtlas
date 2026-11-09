"""The numbers the root pages and the Team page should show, worked out from the exported tables with SQL of their own, for web/scripts/perf/ui-vs-sql.cjs to compare with the browser.

Usage, from the CricAtlas repo root:   ../.venv/bin/python tools/verify_ui_expected.py --json <file> [--out data/export]

Teams: every team's matches, wins and losses from `matches`. Tournaments: matches, editions and teams for each key. Players: a sample (the 15 with most balls, 15 chosen by a fixed seed, 8 women and 8 with
one to three matches) with matches played (the playing XI lists, `match_people`), runs off the bat and wickets credited to the bowler, Super Overs left out. Matches: the count under single filters and pairs.
Team page: national teams (the busiest 25 and 8 women's sides) with matches, won and lost in Tests, ODIs and T20Is.
"""
import argparse, json
from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parents[1]
NOT_BOWLER = "('run out','retired hurt','retired out','obstructing the field','retired not out','timed out','handled the ball','hit the ball twice')"


def main(out: Path, dest: Path) -> None:
    con = duckdb.connect()
    p = lambda n: f"'{out / (n + '.parquet')}'"
    M = p("matches")
    res: dict = {}
    # Teams: both slots of a match, one row for each team.
    con.execute(f"""create table tm as
      select team_1_id as tid, winner_id, 1 as one from {M} where team_1_id is not null
      union all select team_2_id, winner_id, 1 from {M} where team_2_id is not null""")
    res["teams"] = {r[0]: {"played": r[1], "won": r[2], "lost": r[3]} for r in con.execute(
        "select tid, count(*), sum(case when winner_id = tid then 1 else 0 end), sum(case when winner_id is not null and winner_id <> tid then 1 else 0 end) from tm group by 1").fetchall()}
    res["tournaments"] = {r[0]: {"matches": r[1], "editions": r[2], "teams": r[3]} for r in con.execute(f"""
      select tournament_key, count(*), count(distinct edition), (select count(distinct t) from (select team_1_id t from {M} x where x.tournament_key = m.tournament_key union select team_2_id from {M} y where y.tournament_key = m.tournament_key))
      from {M} m where tournament_key is not null group by 1""").fetchall()}
    # Players
    con.execute(f"""create table pl as select striker_id as pid, match_id, runs_off_bat as r, 0 as w from {p('balls_by_match')} where striker_id is not null and not is_super_over""")
    con.execute(f"""create table pb as select bowler_id as pid, match_id, 0 as r, case when wicket = 1 and wicket_type not in {NOT_BOWLER} then 1 else 0 end as w from {p('balls_by_match')} where bowler_id is not null and not is_super_over""")
    con.execute("create table pa as select pid, match_id, r, w from pl union all select pid, match_id, r, w from pb")
    con.execute("create table pstat as select pid, count(distinct match_id) m, sum(r)::bigint runs, sum(w)::bigint wk, count(*) balls from pa group by 1")
    # Matches played as the playing XI lists them (match_people, what the Players page and the nav search show since 2026-10-25), and as the profile's career tables count them (on a batting or bowling card).
    card = {r[0]: r[1] for r in con.execute(f"select pid, count(distinct match_id) from (select player_id pid, match_id from {p('bat_innings')} union all select player_id, match_id from {p('bowl_innings')}) group by 1").fetchall()}
    xi = {r[0]: r[1] for r in con.execute(f"select person_id, count(distinct match_id) from {p('match_people')} where role = 'player' group by 1").fetchall()}
    # The rows of the profile's career table that are a count of matches played, as the playing XI lists them (Ari, 2026-10-25: Mat is matches played everywhere). The profile's T20s row includes The Hundred, which also has a row of its own (Ari, 2026-10-25).
    rows_sql = {"International": "(m.format in ('TEST', 'ODI') or (m.format = 'T20' and m.type = 'Intl'))", "Tests": "m.format = 'TEST'", "ODIs": "m.format = 'ODI'", "T20Is": "(m.format = 'T20' and m.type = 'Intl')",
                "T20s": "m.format = 'T20'", "The Hundred": "m.type = 'Fran(Hundred)'"}
    xi_rows = {}
    for label, w in rows_sql.items():
        for pid, n in con.execute(f"select mp.person_id, count(distinct mp.match_id) from {p('match_people')} mp join {M} m on m.match_id = mp.match_id where mp.role = 'player' and {w} group by 1").fetchall():
            xi_rows.setdefault(pid, {})[label] = n
    names = {r[0]: (r[1], r[2]) for r in con.execute(f"select player_id, name, gender from {p('players')}").fetchall()}
    pick = [r[0] for r in con.execute("select pid from pstat order by balls desc limit 15").fetchall()]
    pick += [r[0] for r in con.execute("select pid from pstat where pid not in (select pid from pstat order by balls desc limit 15) using sample 15 rows (reservoir, 7)").fetchall()]
    pick += [r[0] for r in con.execute(f"select pid from pstat join {p('players')} p on p.player_id = pstat.pid where p.gender = 'female' order by balls desc limit 8").fetchall()]
    pick += [r[0] for r in con.execute("select pid from pstat where m between 1 and 3 using sample 8 rows (reservoir, 11)").fetchall()]
    stat = {r[0]: r for r in con.execute("select pid, m, runs, wk from pstat").fetchall()}
    res["players"] = {pid: {"name": names[pid][0], "matches": xi.get(pid, 0), "card": card.get(pid, 0), "xi_rows": xi_rows.get(pid, {}), "balls_matches": stat[pid][1], "runs": int(stat[pid][2] or 0), "wickets": int(stat[pid][3] or 0)} for pid in dict.fromkeys(pick) if pid in names}
    # Matches page counts
    fmt = {"Tests": "format = 'TEST'", "ODIs": "format = 'ODI'", "T20s": "format = 'T20' and coalesce(type, '') <> 'Fran(Hundred)'", "The Hundred": "type = 'Fran(Hundred)'"}
    gen = {"Men": "gender = 'male'", "Women": "gender = 'female'"}
    cnt = lambda w: con.execute(f"select count(*) from {M} where {w}").fetchone()[0]
    res["matches"] = {"total": cnt("true"), "format": {k: cnt(v) for k, v in fmt.items()}, "gender": {k: cnt(v) for k, v in gen.items()}, "pair": {f"{a}|{b}": cnt(f"({fa}) and ({gb})") for a, fa in fmt.items() for b, gb in gen.items()}}
    # Team page: national teams, three formats
    nat = [r[0] for r in con.execute(f"select tid from tm where tid like '%|intl|%' group by 1 order by count(*) desc limit 25").fetchall()]
    nat += [r[0] for r in con.execute(f"select tid from tm where tid like '%|intl|female' group by 1 order by count(*) desc limit 8").fetchall()]
    tfmt = {"Tests": "format = 'TEST'", "ODIs": "format = 'ODI'", "T20Is": "format = 'T20' and type = 'Intl'"}
    page = {}
    for tid in dict.fromkeys(nat):
        page[tid] = {}
        for k, w in tfmt.items():
            r = con.execute(f"select count(*), sum(case when winner_id = ? then 1 else 0 end), sum(case when winner_id is not null and winner_id <> ? then 1 else 0 end) from {M} where (team_1_id = ? or team_2_id = ?) and {w}", [tid, tid, tid, tid]).fetchone()
            page[tid][k] = {"played": r[0], "won": int(r[1] or 0), "lost": int(r[2] or 0)}
    res["team_page"] = page
    dest.write_text(json.dumps(res))
    print(f"{len(res['teams'])} teams, {len(res['tournaments'])} tournaments, {len(res['players'])} players, {len(page)} team pages in {dest}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "data" / "export"))
    ap.add_argument("--json", required=True)
    a = ap.parse_args()
    main(Path(a.out), Path(a.json))

"""The Matches page's list, mlist.json: one short row for each match, with lookup lists for the names that repeat.

Usage, from the dataset repo root:   .venv/bin/python cricatlas/tools/match_list.py [--out cricatlas/data/export]

A row holds small numbers and indexes into the lists. Columns (also in the file's own `columns`): id, date (YYYYMMDD), kind (0 Test, 1 ODI, 2 T20, 3 The Hundred), female (0 or 1), team 1, team 2 (indexes into `teams`, each [team id, name]),
winner (0 or 1 for team 1 or 2, -1 for none), score of team 1, score of team 2 (text such as 187/6, or 245 & 180/4d in a Test; empty when the match has no ball data), margin (an index into `margins`: the result as the
match page words it), competition (an index into `competitions`: the tournament or event name), tournament key (an index into `keys`, -1 when the competition has none), season, stage, venue, country (indexes into `seasons`,
`stages`, `venues`, `countries`, -1 when missing), player of the match (an index into `potm`, each [player id, name], -1 when none), toss winner (0 or 1, -1), toss decision (1 bat, 2 field, 0 none), team batting first (0 or 1, -1), international (1 for a match between national teams).

A score counts runs off the bat and extras, with the Super Over left out. A chase won by wickets says the balls left (a full quota is the match's overs times the balls in an over, or the revised overs of a shortened chase).
"""
import argparse, json
from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parents[1]


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main(out: Path) -> int:
    con = duckdb.connect()
    p = lambda name: q(out / f"{name}.parquet")
    con.execute(f"""create table inn as
      select b.match_id, b.innings, b.batting_team_id as tid, b.batting_team as team,
             sum(b.runs_off_bat + b.extras)::int as runs,
             sum(case when b.wicket = 1 and b.wicket_type not in ('retired hurt', 'retired not out') then 1 else 0 end)::int as wkts,
             sum(case when b.is_legal_delivery then 1 else 0 end)::int as balls
      from {p('balls_by_match')} b where not b.is_super_over group by 1, 2, 3, 4""")
    con.execute(f"""create table inn_x as
      select i.*, coalesce(d.declared, false) as declared, d.target_overs
      from inn i left join (select match_id, innings, bool_or(coalesce(declared, false)) as declared, max(target_overs) as target_overs from {p('innings')} where not is_super_over group by 1, 2) d
        on d.match_id = i.match_id and d.innings = i.innings""")
    # The player of the match is recorded by name: matched to a player who was in the match (as the tournament and team files do).
    con.execute(f"""create table potm as
      select m.match_id, min(pl.player_id) as pid, min(pl.name) as name
      from {p('matches')} m join {p('match_people')} mp on mp.match_id = m.match_id and mp.role = 'player' join {p('players')} pl on pl.player_id = mp.person_id
      where pl.name = m.player_of_match or pl.name = m.player_of_match_2 group by 1""")
    rows = con.execute(f"""
      select m.match_id, m.start_date, m.format, m."type", m.gender, m.team_1_id, m.team_1, m.team_2_id, m.team_2, m.winner_id, m.winner_runs, m.winner_wickets, m.won_by_innings, m.outcome, m.result_method,
             m.scheduled_overs, m.balls_per_over, coalesce(m.tournament_name, m.event), m.tournament_key, m.tournament_kind, m.season, m.stage_name, m.venue, m.venue_country,
             pt.pid, pt.name, m.toss_winner, m.toss_decision
      from {p('matches')} m left join potm pt on pt.match_id = m.match_id order by m.start_date desc, m.match_id desc""").fetchall()
    inns = {}
    for mid, n, tid, team, runs, wk, balls, declared, tover in con.execute("select match_id, innings, tid, team, runs, wkts, balls, declared, target_overs from inn_x order by match_id, innings").fetchall():
        inns.setdefault(mid, []).append(dict(n=n, tid=tid, team=team, runs=runs, wkts=wk, balls=balls, declared=declared, over=tover))

    look = {k: {} for k in ("teams", "margins", "competitions", "keys", "seasons", "stages", "venues", "countries", "potm")}

    def ix(kind, v):
        if v is None or v == "":
            return -1
        d = look[kind]
        if v not in d:
            d[v] = len(d)
        return d[v]

    def score(mid, tid):
        parts = [f"{i['runs']}{'' if i['wkts'] >= 10 else '/' + str(i['wkts'])}{'d' if i['declared'] else ''}" for i in inns.get(mid, []) if i["tid"] == tid]
        return " & ".join(parts)

    def margin(m, winner_id, wruns, wwk, by_inn, outcome, method, overs, bpo, fmt):
        if outcome == "draw":
            return "drawn"
        if outcome == "no result":
            return "no result"
        if winner_id is None:
            return "tied" if outcome == "tie" else "no result"
        tie = " (Super Over)" if outcome == "tie" else ""
        dls = " (DLS)" if method else ""
        if by_inn and wruns is not None:
            return f"by an innings and {int(wruns)} runs{tie}{dls}"
        if wruns is not None:
            n = int(wruns)
            return f"by {n} {'run' if n == 1 else 'runs'}{tie}{dls}"
        if wwk is not None:
            n = int(wwk)
            left = 0
            chase = [i for i in inns.get(m, []) if i["n"] == 2]
            if chase and fmt != "TEST":
                quota = round(float(chase[0]["over"] or overs or 0) * (bpo or 6))
                left = max(0, quota - chase[0]["balls"])
            return f"by {n} {'wicket' if n == 1 else 'wickets'}{f' ({left} balls left)' if left > 0 else ''}{tie}{dls}"
        return "tied (Super Over)" if tie else ""

    out_rows = []
    for (mid, date, fmt, mtype, gender, t1id, t1, t2id, t2, wid, wruns, wwk, by_inn, outcome, method, overs, bpo, comp, tkey, tkind, season, stage, venue, country, pid, pname, toss_w, toss_d) in rows:
        kind = 3 if mtype == "Fran(Hundred)" else {"TEST": 0, "ODI": 1}.get(fmt, 2)
        w = 0 if wid == t1id and wid else 1 if wid == t2id and wid else -1
        first = inns.get(mid, [None])[0]
        bat_first = -1 if not first else 0 if first["tid"] == t1id else 1 if first["tid"] == t2id else -1
        tw = 0 if toss_w == t1 else 1 if toss_w == t2 else -1
        out_rows.append([
            mid, int(str(date)[:10].replace("-", "")), kind, 1 if gender == "female" else 0, ix("teams", (t1id, t1)), ix("teams", (t2id, t2)), w, score(mid, t1id), score(mid, t2id),
            ix("margins", margin(mid, wid, wruns, wwk, by_inn, outcome, method, overs, bpo, fmt)), ix("competitions", comp), ix("keys", tkey if tkind in ("tournament", "league") else None),
            ix("seasons", str(season) if season is not None else None), ix("stages", stage), ix("venues", venue), ix("countries", country), ix("potm", (pid, pname) if pid else None),
            tw, {"bat": 1, "field": 2}.get(toss_d, 0), bat_first, 1 if mtype == "Intl" else 0,
        ])
    payload = dict(v=1, columns=["id", "date", "kind", "female", "team1", "team2", "winner", "score1", "score2", "margin", "competition", "key", "season", "stage", "venue", "country", "potm", "tossWinner", "tossDecision", "batFirst", "international"],
                   **{k: [list(x) if isinstance(x, tuple) else x for x in d] for k, d in look.items()}, rows=out_rows)
    (out / "mlist.json").write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))
    return len(out_rows)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "data" / "export"))
    a = ap.parse_args()
    print(main(Path(a.out)), "matches in mlist.json")

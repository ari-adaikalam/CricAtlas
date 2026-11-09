"""Match bundles and the match search list, for the Match page.

Usage, from the CricAtlas repo root:   ../.venv/bin/python tools/match_files.py [--out data/export] [--only <match id> ...]

Writes, under the output folder:
  m/bundle/<match id>.json   everything the page shows before any other file arrives: the match header, each innings (score, overs, extras, target), every batter's card and every bowler's
                             figures. The summary screen and the scorecard parts of Match details read only this file.
  m/search.json              one short row for each match, for the type-ahead that changes the match.

The numbers are worked out here once. The page does not repeat them, and web/scripts/verify-match-bundles.ts checks them against tables built another way (the innings totals, the player
innings tables). Definitions follow the player page:
  batter balls     deliveries that were not wides (a no-ball is faced). Wides are never a ball faced.
  runs conceded    runs off the bat plus wides plus no-balls. Byes and leg byes are not charged to the bowler.
  bowler wickets   bowled, caught, caught and bowled, lbw, stumped, hit wicket.
  dot ball         a legal delivery with nothing off the bat (a bye counts as a dot, as on the player page and in `bowl_innings.dots`).
  six              six runs off the bat, as `bat_innings.sixes` counts them. A four is not a boundary when `non_boundary` is set.
  maiden           a completed over of legal deliveries with no runs conceded (none in The Hundred).
  team wickets     dismissals other than retired hurt and retired not out.
"""
import argparse, json, sys, time
from pathlib import Path
import duckdb
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ball_files
import par_files
import match_details as details

HERE = Path(__file__).resolve().parents[1]
BOWLER_WICKETS = ("bowled", "caught", "caught and bowled", "lbw", "stumped", "hit wicket")
NOT_WICKETS = ("retired hurt", "retired not out")


def kind_of(fmt: str, type_: str) -> str:
    """The shape of the match for the page: test, odi, t20 or hundred."""
    if type_ == "Fran(Hundred)":
        return "hundred"
    return {"TEST": "test", "ODI": "odi"}.get(fmt, "t20")


def overs_text(balls: int, per_over: int) -> str:
    return f"{balls // per_over}.{balls % per_over}" if per_over == 6 else str(balls)


def nn(v):
    """None for a missing value, a plain Python number or string otherwise (pandas gives NaN and numpy types)."""
    if v is None or v is pd.NA or v is pd.NaT:
        return None
    try:
        if v != v:
            return None
    except Exception:
        pass
    if hasattr(v, "item"):
        v = v.item()
    return v


def build(out: Path, only: list[int] | None = None) -> None:
    exp = HERE / "data" / "export"
    con = duckdb.connect()
    t0 = time.time()
    flt = f"where match_id in ({','.join(map(str, only))})" if only else ""
    con.sql(f"create view balls as select * from '{exp / 'balls_by_match.parquet'}' {flt}")
    con.sql(f"create view matches as select * from '{exp / 'matches.parquet'}' {flt}")
    con.sql(f"create view innings as select * from '{exp / 'innings.parquet'}' {flt}")
    con.sql(f"create view wickets as select * from '{exp / 'wickets.parquet'}' {flt}")
    con.sql(f"create view fielders as select * from '{exp / 'wicket_fielders.parquet'}' {flt}")
    con.sql("create view wicket_fielders as select * from fielders")
    con.sql(f"create view matches_all as select * from '{exp / 'matches.parquet'}'")
    con.sql(f"create view people as select * from '{exp / 'match_people.parquet'}' {flt}")

    # --- innings ---
    inn = con.sql(f"""
      select b.match_id, b.innings, any_value(b.batting_team) team, any_value(b.batting_team_id) team_id,
             sum(b.runs_off_bat + b.extras)::int runs, count(*) filter (where b.is_legal_delivery)::int balls, count(*)::int deliveries,
             coalesce(sum(b.wides), 0)::int wd, coalesce(sum(b.noballs), 0)::int nb, coalesce(sum(b.byes), 0)::int bye, coalesce(sum(b.legbyes), 0)::int lb, coalesce(sum(b.penalty), 0)::int pen,
             (select count(*) from wickets w where w.match_id = b.match_id and w.innings = b.innings and w.wicket_type not in {NOT_WICKETS})::int wkts,
             any_value(i.is_super_over) super, any_value(i.declared) declared, any_value(i.target_runs) target_runs, any_value(i.target_overs) target_overs,
             any_value(i.penalty_runs_pre) pen_pre, any_value(i.penalty_runs_post) pen_post
      from balls b join innings i using (match_id, innings) group by b.match_id, b.innings order by 1, 2
    """).fetchall()
    innings_by: dict[int, list[dict]] = {}
    for r in inn:
        (mid, n, team, team_id, runs, balls, deliveries, wd, nb, bye, lb, pen, wkts, sup, dec, tr, to, ppre, ppost) = r
        innings_by.setdefault(mid, []).append(dict(
            n=n, team=team, teamId=team_id, runs=runs, wkts=wkts, balls=balls, deliveries=deliveries, super=bool(sup), declared=bool(dec),
            extras=dict(wd=wd, nb=nb, b=bye, lb=lb, pen=pen), targetRuns=nn(tr), targetOvers=nn(to), penaltyPre=int(ppre or 0), penaltyPost=int(ppost or 0)))

    # --- batters: one row for each batter who came to the crease, in the order they arrived ---
    bat = con.sql(f"""
      with ppl as (select match_id, person, any_value(person_id) pid from people where role = 'player' group by 1, 2),
      s as (
        select match_id, innings, coalesce(striker_id, 'n:' || striker) pk, striker_id as id, striker as name,
               sum(runs_off_bat)::int runs, count(*) filter (where coalesce(wides, 0) = 0)::int balls,
               count(*) filter (where runs_off_bat = 4 and not coalesce(non_boundary, false))::int fours,
               count(*) filter (where runs_off_bat = 6)::int sixes,
               min(delivery_number) arrive, 0 slot
        from balls where striker is not null group by 1, 2, 3, 4, 5
      ), n as (
        select b.match_id, b.innings, coalesce(p.pid, 'n:' || b.non_striker) pk, p.pid as id, b.non_striker as name,
               0 runs, 0 balls, 0 fours, 0 sixes, min(b.delivery_number) arrive, 1 slot
        from balls b left join ppl p on p.match_id = b.match_id and p.person = b.non_striker
        where b.non_striker is not null group by 1, 2, 3, 4, 5
      ), d as (
        select w.match_id, w.innings, coalesce(w.player_dismissed_id, 'n:' || w.player_dismissed) pk, w.player_dismissed_id as id, w.player_dismissed as name,
               0 runs, 0 balls, 0 fours, 0 sixes, min(w.delivery_number) arrive, 2 slot
        from wickets w where w.player_dismissed is not null group by 1, 2, 3, 4, 5
      ), u as (select * from s union all select * from n union all select * from d)
      select match_id, innings, pk, any_value(id) as id, any_value(name) as name, sum(runs)::int runs, sum(balls)::int balls, sum(fours)::int fours, sum(sixes)::int sixes,
             min(arrive * 3 + slot)::int pos
      from u group by 1, 2, 3 order by 1, 2, pos
    """).fetchall()

    # --- how each batter got out ---
    outs = con.sql(f"""
      select w.match_id, w.innings, coalesce(w.player_dismissed_id, 'n:' || w.player_dismissed) pk, w.wicket_type, w.delivery_number, w.wicket_number,
             b.bowler, b.bowler_id, b."over", b.ball_in_over, b.scorecard_ball,
             (select list(coalesce(f.fielder || case when f.substitute then ' (sub)' else '' end, 'Substitute fielder') order by f.fielder_number) from fielders f
              where f.match_id = w.match_id and f.innings = w.innings and f.delivery_number = w.delivery_number and f.wicket_number = w.wicket_number) fielders
      from wickets w join balls b on b.match_id = w.match_id and b.innings = w.innings and b.delivery_number = w.delivery_number
      order by 1, 2, w.delivery_number, w.wicket_number
    """).fetchall()
    out_by: dict[tuple, dict] = {}
    for (mid, n, pk, wt, dn, wn, bowler, bowler_id, over, bio, sb, fielders) in outs:
        credited = wt in BOWLER_WICKETS
        out_by[(mid, n, pk)] = dict(type=wt, bowler=bowler if credited else None, bowlerId=bowler_id if credited else None, fielders=list(fielders or []),
                                     delivery=dn, wicketNumber=wn, over=int(over), ball=int(bio), ballText=sb)

    # --- bowlers ---
    bowl = con.sql(f"""
      with o as (
        select match_id, innings, coalesce(bowler_id, 'n:' || bowler) pk, "over",
               count(*) filter (where is_legal_delivery) legal,
               sum(runs_off_bat + coalesce(wides, 0) + coalesce(noballs, 0)) conceded
        from balls where bowler is not null group by 1, 2, 3, 4
      ), mdn as (
        select o.match_id, o.innings, o.pk, count(*) filter (where legal >= m.balls_per_over and conceded = 0 and m.type <> 'Fran(Hundred)')::int maidens
        from o join matches m using (match_id) group by 1, 2, 3
      )
      select b.match_id, b.innings, coalesce(b.bowler_id, 'n:' || b.bowler) pk, any_value(b.bowler_id) as id, any_value(b.bowler) as name,
             count(*) filter (where b.is_legal_delivery)::int balls,
             sum(b.runs_off_bat + coalesce(b.wides, 0) + coalesce(b.noballs, 0))::int runs,
             count(*) filter (where b.wicket_type in {BOWLER_WICKETS} and b.player_dismissed is not null)::int wkts,
             count(*) filter (where b.is_legal_delivery and b.runs_off_bat = 0)::int dots,
             coalesce(sum(b.wides), 0)::int wd, coalesce(sum(b.noballs), 0)::int nb,
             any_value(mdn.maidens)::int maidens, min(b.delivery_number)::int first_d
      from balls b join mdn on mdn.match_id = b.match_id and mdn.innings = b.innings and mdn.pk = coalesce(b.bowler_id, 'n:' || b.bowler)
      where b.bowler is not null group by 1, 2, 3 order by 1, 2, first_d
    """).fetchall()

    # --- the players listed for each side, for "did not bat" ---
    listed = con.sql("select match_id, team, person, any_value(person_id) from people where role = 'player' group by 1, 2, 3 order by 1, 2, 3").fetchall()
    squad: dict[tuple, list[tuple]] = {}
    for mid, team, person, pid in listed:
        squad.setdefault((mid, team), []).append((pid, person))

    team_of = {(mid, pid): team for (mid, team), players in squad.items() for pid, _ in players if pid}

    # --- coverage of the tracking fields in the match (the page decides what to draw from it) ---
    cov = {r[0]: r[1:] for r in con.sql("""
      select match_id, count(*)::int n, count(win_probability)::int wp, count(predicted_score)::int ps,
             count(*) filter (where ball_line is not null or ball_length is not null or shot_played is not null or wagon_x is not null)::int tracked,
             count(*) filter (where wagon_x is not null)::int positioned,
             count(*) filter (where ball_line is not null and ball_length is not null)::int pitched
      from balls where not is_super_over group by 1""").fetchall()}
    reviews = {r[0]: r[1] for r in con.sql(f"select match_id, count(*)::int from '{exp / 'reviews.parquet'}' group by 1").fetchall()}
    repl: dict[int, list[dict]] = {}
    for (mid, inn_n, dn, kind, team, role, p_in, p_in_id, p_out, p_out_id, reason, ball_text, over_i) in con.sql(
            f"select r.match_id, r.innings, r.delivery_number, r.kind, r.team, r.role, r.player_in, r.player_in_id, r.player_out, r.player_out_id, r.reason, b.scorecard_ball, b.\"over\"::int "
            f"from '{exp / 'match_replacements.parquet'}' r left join balls b on b.match_id = r.match_id and b.innings = r.innings and b.delivery_number = r.delivery_number order by 1, 2, 3, r.replacement_number").fetchall():
        repl.setdefault(mid, []).append(dict(kind=kind, reason=reason, team=nn(team), role=nn(role), innings=nn(inn_n), delivery=nn(dn), playerIn=p_in, playerInId=nn(p_in_id), playerOut=p_out, playerOutId=nn(p_out_id), ballText=nn(ball_text), over=nn(over_i)))
    umps = {}
    for mid, role, person in con.sql("select match_id, role, person from people where role in ('umpire', 'tv_umpire', 'match_referee', 'reserve_umpire') order by match_id, role, person_number").fetchall():
        umps.setdefault(mid, {}).setdefault(role, []).append(person)
    people_id = {(mid, person): pid for mid, person, pid in con.sql("select match_id, person, any_value(person_id) from people where role = 'player' group by 1, 2").fetchall()}

    # --- the parts of Match details that need the ball file ---
    fow, retired, stands, phase_rows, fields, review_rows, award = details.fall_of_wickets(con), details.retirements(con), details.partnerships(con), details.phases(con), details.fielding(con), details.reviews(con, exp), details.awards(con)

    # --- assemble ---
    bat_by: dict[tuple, list[dict]] = {}
    for (mid, n, pk, pid, name, runs, balls, fours, sixes, pos) in bat:
        o = out_by.get((mid, n, pk))
        bat_by.setdefault((mid, n), []).append(dict(id=pid, name=name, runs=runs, balls=balls, fours=fours, sixes=sixes, out=o))
    bowl_by: dict[tuple, list[dict]] = {}
    for (mid, n, pk, pid, name, balls, runs, wkts, dots, wd, nb, maidens, first_d) in bowl:
        bowl_by.setdefault((mid, n), []).append(dict(id=pid, name=name, balls=balls, maidens=maidens, runs=runs, wkts=wkts, dots=dots, wd=wd, nb=nb))

    ms = con.sql("select * from matches order by match_id").df()
    (out / "m" / "bundle").mkdir(parents=True, exist_ok=True)
    search_rows = []
    written = 0
    for m in ms.itertuples(index=False):
        mid = int(m.match_id)
        per_over = int(m.balls_per_over) if nn(m.balls_per_over) else 6
        kind = kind_of(m.format, m.type)
        inns = innings_by.get(mid, [])
        for i in inns:
            i["overs"] = overs_text(i["balls"], per_over)
            if not i["super"]:
                i["fow"] = fow.get((mid, i["n"]), [])
                i["retired"] = retired.get((mid, i["n"]), [])
                i["partnerships"] = stands.get((mid, i["n"]), [])
                i["phases"] = phase_rows.get((mid, i["n"]), [])
                i["fielding"] = fields.get((mid, i["n"]), [])
                i["reviews"] = review_rows.get((mid, i["n"]), [])
            i["batters"] = bat_by.get((mid, i["n"]), [])
            i["bowlers"] = bowl_by.get((mid, i["n"]), [])
            seen = {b["name"] for b in i["batters"]}
            i["didNotBat"] = [dict(id=pid, name=p) for pid, p in squad.get((mid, i["team"]), []) if p not in seen] if not i["super"] else []
        potm = [dict(name=n_, id=people_id.get((mid, n_)), team=team_of.get((mid, people_id.get((mid, n_)))), award=award.get((mid, n_))) for n_ in (nn(m.player_of_match), nn(m.player_of_match_2)) if n_]
        c = cov.get(mid, (0, 0, 0, 0, 0))
        bundle = dict(
            v=1,
            match=dict(
                id=mid, date=str(m.start_date)[:10], endDate=str(m.end_date)[:10] if nn(m.end_date) is not None and str(m.end_date) != "NaT" else None,
                season=nn(m.season), gender=m.gender, format=m.format, type=m.type, kind=kind,
                tournament=dict(key=nn(m.tournament_key), name=nn(m.tournament_name), kind=nn(m.tournament_kind)),
                stage=dict(name=nn(m.stage_name), cls=nn(m.stage_class), group=nn(m.event_group)),
                number=nn(m.match_number), venue=nn(m.venue), city=nn(m.city), country=nn(m.venue_country),
                ballsPerOver=per_over, scheduledOvers=nn(m.scheduled_overs),
                teams=[dict(name=m.team_1, id=m.team_1_id), dict(name=m.team_2, id=m.team_2_id)],
                toss=dict(winner=nn(m.toss_winner), decision=nn(m.toss_decision)),
                result=dict(winner=nn(m.winner), winnerId=nn(m.winner_id), runs=nn(m.winner_runs), wickets=nn(m.winner_wickets), outcome=nn(m.outcome),
                            method=nn(m.result_method), eliminator=nn(m.eliminator), byInnings=bool(m.won_by_innings)),
                potm=potm, officials=umps.get(mid, {}),
            ),
            innings=inns,
            coverage=dict(balls=c[0], winProb=c[1], projected=c[2], tracked=c[3], positioned=c[4], pitched=c[5], reviews=reviews.get(mid, 0)),
            replacements=repl.get(mid, []),
        )
        (out / "m" / "bundle" / f"{mid}.json").write_text(json.dumps(bundle, separators=(",", ":"), default=str))
        written += 1
        search_rows.append((mid, str(m.start_date)[:10], m.team_1, m.team_2, nn(m.tournament_name) or nn(m.event) or "", str(nn(m.season) or ""), nn(m.venue) or "", nn(m.city) or "",
                            nn(m.winner), nn(m.winner_runs), nn(m.winner_wickets), nn(m.outcome) or "", kind, m.gender, nn(m.event_stage) or "", m.type == "Intl"))
    write_search(out, search_rows)
    ball_count = ball_files.write_ball_files(con, exp, out, only or [])
    par_count = par_files.write_par_files(con, exp, out, kind_of, only or [])
    print(f"{written} bundles, {ball_count} ball files, {par_count} par files and the search list in {time.time() - t0:.0f} s")


def write_search(out: Path, rows: list[tuple]) -> None:
    """A list the box searches in the browser. Names repeat across thousands of matches, so they sit in lookup lists and a row holds small numbers."""
    look: dict[str, dict[str, int]] = {k: {} for k in ("team", "tour", "season", "venue", "city", "outcome", "stage")}

    def ix(kind: str, v: str) -> int:
        d = look[kind]
        if v not in d:
            d[v] = len(d)
        return d[v]

    cols = []
    for (mid, date, t1, t2, tour, season, venue, city, winner, wruns, wwk, outcome, kind, gender, stage, intl) in sorted(rows, key=lambda r: (r[1], r[0]), reverse=True):
        w = -1 if winner is None else (0 if winner == t1 else 1 if winner == t2 else -1)
        cols.append([mid, int(date.replace("-", "")), ix("team", t1), ix("team", t2), ix("tour", tour), ix("season", season), ix("venue", venue), ix("city", city), w,
                     -1 if wruns is None else int(wruns), -1 if wwk is None else int(wwk), ix("outcome", outcome), ["test", "odi", "t20", "hundred"].index(kind), 1 if gender == "female" else 0,
                     ix("stage", stage), 1 if intl else 0])
    payload = dict(v=1, columns=["id", "date", "team1", "team2", "tournament", "season", "venue", "city", "winner", "runs", "wickets", "outcome", "kind", "female", "stage", "international"],
                   lists={k: list(d) for k, d in look.items()}, rows=cols)
    (out / "m").mkdir(parents=True, exist_ok=True)
    (out / "m" / "search.json").write_text(json.dumps(payload, separators=(",", ":")))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "data" / "export"))
    ap.add_argument("--only", type=int, nargs="*")
    a = ap.parse_args()
    build(Path(a.out), a.only)

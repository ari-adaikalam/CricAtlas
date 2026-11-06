"""Write the files the CricAtlas app reads (Parquet), from the dataset's final CSVs.

Usage, from the CricAtlas repo root:
    ../.venv/bin/python tools/export.py [--no-cricinfo] [--out data/export]

Reads ../data/output/*.csv and the reference tables in data/ (team_identity, tournaments, stages,
season_merges). Writes Parquet into --out and a manifest.json. Fails (exit 1) when a check fails.

Three copies of the ball file, each sorted by the key a page filters on, so the browser reads only the
row groups it needs: by batter, by bowler and by match.
--no-cricinfo drops the tracking columns and the source player fields (the takedown build).
"""
import argparse, hashlib, json, sys, time
from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parents[1]
SRC = HERE.parent / "data" / "output"
REF = HERE / "data"
ROW_GROUP = 100_000
TRACKING = ["ball_line", "ball_length", "shot_played", "shot_control", "wagon_x", "wagon_y", "wagon_zone",
            "wagon_angle", "wagon_distance", "wagon_in_ring", "shot_direction", "win_probability",
            "predicted_score", "ball_events"]          # ball_timestamp is not used by the app
INTL = "('tests','odis','t20s')"
# The bowler is credited only with bowled, caught, lbw, stumped and hit wicket (the Laws). 'handled the ball' and 'hit the ball twice' were counted before 2026-10-18.
NOT_BOWLER_WICKET = "('run out','retired hurt','retired out','obstructing the field','retired not out','timed out','handled the ball','hit the ball twice')"


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "data" / "export"))
    ap.add_argument("--no-cricinfo", action="store_true")
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    t0 = time.time(); con = duckdb.connect(); con.execute("PRAGMA threads=8")
    csv = lambda name: f"read_csv({q(SRC / (name + '.csv'))}, sample_size=-1)"
    ref = lambda name: f"read_csv({q(REF / (name + '.csv'))}, sample_size=-1)"
    problems = []

    # ---- reference checks: nothing is filed silently ----
    bad_events = con.execute(f"select distinct event from {csv('matches')} where event is not null and event not in (select event from {ref('tournaments')})").fetchall()
    bad_stages = con.execute(f"select distinct event_stage from {csv('matches')} where event_stage is not null and event_stage not in (select stage_value from {ref('stages')})").fetchall()
    if bad_events: problems.append(f"events not in tournaments.csv: {[r[0] for r in bad_events][:10]}")
    if bad_stages: problems.append(f"stages not in stages.csv: {[r[0] for r in bad_stages][:10]}")
    bad_venues = con.execute(f"select distinct venue, city from {csv('matches')} where venue is not null and (venue, coalesce(nullif(trim(city), ''), '')) not in (select venue, coalesce(city, '') from {ref('venues')})").fetchall()
    if bad_venues: problems.append(f"venues not in venues.csv (run tools/venues.py): {[r[0] + ' / ' + str(r[1]) for r in bad_venues][:10]}")
    if problems:
        print("FAILED reference checks:\n  " + "\n  ".join(problems)); return 1

    # ---- match level reference columns ----
    con.execute(f"""create table matches as
      select m.* replace (coalesce(i1.display_name, m.team_1) as team_1, coalesce(i2.display_name, m.team_2) as team_2,
                          coalesce(iw.display_name, m.winner) as winner, coalesce(it.display_name, m.toss_winner) as toss_winner, coalesce(ie.display_name, m.eliminator) as eliminator, vg.ground as venue),
             m.venue as venue_raw,
             t.tournament_key, t.display_name as tournament_name, t.kind as tournament_kind, t.section as filter_section,
             st.class as stage_class, st.display_name as stage_name, vg.country as venue_country, vg.continent as venue_continent,
             case when t.tournament_key is null then null
                  else t.tournament_key || '|' || coalesce(cast(sm.edition_season as varchar), m.season) || '|' || m.gender end as edition,
             {team_id('m.team_1')} as team_1_id, {team_id('m.team_2')} as team_2_id, {team_id('m.winner')} as winner_id
      from {csv('matches')} m
      left join {ref('tournaments')} t on t.event = m.event
      left join {ref('stages')} st on st.stage_value = m.event_stage
      left join {ref('venues')} vg on vg.venue = m.venue and coalesce(vg.city, '') = coalesce(nullif(trim(m.city), ''), '')
      left join {ref('season_merges')} sm on sm.tournament_key = t.tournament_key and sm.season = m.season
      left join {ref('team_identity')} i1 on i1.collection = m.collection and i1.name_in_data = m.team_1
      left join {ref('team_identity')} i2 on i2.collection = m.collection and i2.name_in_data = m.team_2
      left join {ref('team_identity')} iw on iw.collection = m.collection and iw.name_in_data = m.winner
      left join {ref('team_identity')} it on it.collection = m.collection and it.name_in_data = m.toss_winner
      left join {ref('team_identity')} ie on ie.collection = m.collection and ie.name_in_data = m.eliminator""")

    # ---- ball table with tracking and reference columns ----
    track = "" if a.no_cricinfo else ", " + ", ".join(f"k.{c}" for c in TRACKING)
    tjoin = "" if a.no_cricinfo else f"left join {csv('cricinfo_tracking')} k on k.match_id=b.match_id and k.innings=b.innings and k.delivery_number=b.delivery_number"
    # The first mandatory powerplay of each innings, from powerplays.csv. A match without one falls back to the fixed overs below.
    # Newer ODIs list three mandatory spells (overs 1 to 10, 11 to 40 and 41 to 50), so the first and last over across all of them would cover the whole innings.
    con.execute(f"""create table pp as
      select match_id, innings, arg_min(start_over, powerplay_number) first_over, arg_min(end_over, powerplay_number) last_over
      from {csv('powerplays')} where type = 'mandatory' group by 1, 2""")
    # Phase: Powerplay, Middle and Death for T20 and ODI, Powerplay and Rest of innings for The Hundred, none for Tests and Super Overs.
    # Death is the last 5 overs of a T20 and the last 10 of an ODI, counted from the scheduled overs so a shortened match still has one.
    phase = """case
        when b.format = 'TEST' or coalesce(si.is_super_over, false) then null
        when pp.first_over is not null and b."over" between pp.first_over and pp.last_over then 'powerplay'
        when pp.first_over is null and b."over" < (case when b.format = 'ODI' then 10 when m.balls_per_over = 5 then 5 else 6 end) then 'powerplay'
        when m.balls_per_over = 5 then 'rest'
        when b."over" >= coalesce(m.scheduled_overs, case when b.format = 'ODI' then 50 else 20 end) - (case when b.format = 'ODI' then 10 else 5 end) then 'death'
        else 'middle' end"""
    con.execute(f"""create table balls as
      select b.* replace (coalesce(bi.display_name, b.batting_team) as batting_team, coalesce(wi.display_name, b.bowling_team) as bowling_team),
             m.tournament_key, m.edition, m.stage_class, m.stage_name,
             {phase} as phase, coalesce(si.is_super_over, false) as is_super_over, m.winner_id as match_winner_id, m.outcome as match_outcome,
             {team_id('b.batting_team', 'bi', 'b')} as batting_team_id, {team_id('b.bowling_team', 'wi', 'b')} as bowling_team_id,
             coalesce(sum(b.wicket) over (partition by b.match_id, b.innings order by b.delivery_number rows between unbounded preceding and 1 preceding), 0) as team_wickets_fallen
             {track}
      from {csv('ball_by_ball_data')} b
      join matches m on m.match_id = b.match_id
      left join pp on pp.match_id = b.match_id and pp.innings = b.innings
      left join {csv('innings')} si on si.match_id = b.match_id and si.innings = b.innings
      left join {ref('team_identity')} bi on bi.collection = m.collection and bi.name_in_data = b.batting_team
      left join {ref('team_identity')} wi on wi.collection = m.collection and wi.name_in_data = b.bowling_team
      {tjoin}""")
    n_src = con.execute(f"select count(*) from {csv('ball_by_ball_data')}").fetchone()[0]
    n_out = con.execute("select count(*) from balls").fetchone()[0]
    if n_src != n_out: problems.append(f"ball rows changed: {n_src} to {n_out}")

    # Every name column from here on is the display name from team_identity.csv: the names in the four CSV tables that carry a team (people, replacements, innings, reviews) are renamed the same way as matches and balls,
    # so a join on a team name still matches. The team ids above were made from the names in the data, before the rename.
    ident = lambda alias, col: f"left join {ref('team_identity')} {alias} on {alias}.collection = m.collection and {alias}.name_in_data = {col}"
    con.execute(f"""create table mp_d as select x.* replace (coalesce(i.display_name, x.team) as team) from {csv('match_people')} x
                    join matches m on m.match_id = x.match_id {ident('i', 'x.team')}""")
    con.execute(f"""create table mr_d as select x.* replace (coalesce(i.display_name, x.team) as team) from {csv('match_replacements')} x
                    join matches m on m.match_id = x.match_id {ident('i', 'x.team')}""")
    con.execute(f"""create table rv_d as select x.* replace (coalesce(i.display_name, x.review_by) as review_by) from {csv('reviews')} x
                    join matches m on m.match_id = x.match_id {ident('i', 'x.review_by')}""")
    con.execute(f"""create table inn_d as select x.* replace (coalesce(i.display_name, x.batting_team) as batting_team) from {csv('innings')} x
                    join matches m on m.match_id = x.match_id {ident('i', 'x.batting_team')}""")
    for t, n in (("mp_d", "match_people"), ("mr_d", "match_replacements"), ("inn_d", "innings"), ("rv_d", "reviews")):
        if con.execute(f"select count(*) from {t}").fetchone()[0] != con.execute(f"select count(*) from {csv(n)}").fetchone()[0]:
            problems.append(f"{n}: rows changed when the display names were applied")
    _csv = csv
    csv = lambda name: {"match_people": "mp_d", "match_replacements": "mr_d", "innings": "inn_d", "reviews": "rv_d"}.get(name) or _csv(name)

    def write(sql, name, order=""):
        f = out / f"{name}.parquet"
        con.execute(f"copy ({sql} {order}) to {q(f)} (format parquet, compression zstd, row_group_size {ROW_GROUP})")
        return f

    files = {}
    files["balls_by_batter"] = write("select * from balls", "balls_by_batter", "order by striker_id, match_id, innings, delivery_number")
    files["balls_by_bowler"] = write("select * from balls", "balls_by_bowler", "order by bowler_id, match_id, innings, delivery_number")
    files["balls_by_match"] = write("select * from balls", "balls_by_match", "order by match_id, innings, delivery_number")
    # Every dismissal of a batter (as the summary counts them), with the ball's context columns, sorted by the dismissed batter. A run out of the non-striker sits on a ball
    # whose striker is someone else, so it is not in balls_by_batter, and it can be an innings in which the batter never faced a ball. Retirements are not dismissals.
    files["dismissals_by_batter"] = write(f"""select b.* replace (w.wicket_type as wicket_type), w.player_dismissed_id as batter_id, (w.player_dismissed_id = b.striker_id) as on_strike
      from balls b join {csv('wickets')} w on w.match_id = b.match_id and w.innings = b.innings and w.delivery_number = b.delivery_number
      where w.player_dismissed_id is not null and w.wicket_type not in ('retired hurt', 'retired not out')
        """, "dismissals_by_batter", "order by batter_id, match_id, innings, delivery_number")
    files["matches"] = write("select * from matches", "matches", "order by match_id")
    pl = f"select * from {csv('players')}" if not a.no_cricinfo else f"select * replace (null::bigint as cricinfo_id, null::varchar as \"image url\") from {csv('players')}"
    files["players"] = write(pl, "players", "order by player_id")
    for name in ["innings", "wickets", "wicket_fielders", "powerplays", "reviews", "match_people", "match_replacements"]:
        files[name] = write(f"select * from {csv(name)}", name, "order by match_id")

    # ---- player summary: one row per player, format, competition and season ----
    # Super Overs are left out of every career figure, as in career records (Ari, 2026-10-18). A ball file still has them, and the tiles have a Super Overs filter.
    con.execute(f"""create table bat_inn_faced as
      select striker_id as player_id, match_id, innings, any_value(format) format, any_value(tournament_key) tournament_key, any_value(season) season,
             any_value(gender) gender, sum(runs_off_bat) runs, count(*) filter (where coalesce(wides,0) = 0) balls,
             count(*) filter (where runs_off_bat = 4 and not coalesce(non_boundary,false)) fours, count(*) filter (where runs_off_bat = 6) sixes
      from balls where striker_id is not null and not is_super_over group by striker_id, match_id, innings""")
    # An innings is counted when the batter came to the crease, as scorecards and statistics sites count it, even if no ball was faced (Ari, 2026-10-18). That is a batter who was
    # only ever the non-striker (not out, or run out, which is a diamond duck) and a batter dismissed without taking guard (timed out). They have no balls, so they are not in
    # the ball files, but they are in the summary, in the Records tables and in the dismissals file. The non-striker's id comes from the match's players, since the ball file has the name.
    con.execute(f"""create table bat_zero as
      with ns as (
        select distinct mp.person_id player_id, b.match_id, b.innings
        from balls b join {csv('match_people')} mp on mp.match_id = b.match_id and mp.role = 'player' and mp.person = b.non_striker and mp.team = b.batting_team
        where not b.is_super_over and b.non_striker is not null),
      dis as (
        select w.player_dismissed_id player_id, w.match_id, w.innings
        from {csv('wickets')} w left join {csv('innings')} wi on wi.match_id = w.match_id and wi.innings = w.innings
        where w.wicket_type not in ('retired hurt','retired not out') and w.player_dismissed_id is not null and not coalesce(wi.is_super_over, false)),
      every as (select * from ns union select * from dis),
      g as (select match_id, innings, any_value(format) format, any_value(tournament_key) tournament_key, any_value(season) season, any_value(gender) gender
            from balls where not is_super_over group by 1, 2)
      select x.player_id, x.match_id, x.innings, g.format, g.tournament_key, g.season, g.gender, 0::bigint runs, 0::bigint balls, 0::bigint fours, 0::bigint sixes
      from every x join g on g.match_id = x.match_id and g.innings = x.innings
      where not exists (select 1 from bat_inn_faced f where f.player_id = x.player_id and f.match_id = x.match_id and f.innings = x.innings)""")
    con.execute("create table bat_inn as select * from bat_inn_faced union all select * from bat_zero")
    con.execute(f"""create table bat_out as
      select w.player_dismissed_id player_id, w.match_id, w.innings, count(*) outs
      from {csv('wickets')} w left join {csv('innings')} wi on wi.match_id = w.match_id and wi.innings = w.innings
      where w.wicket_type not in ('retired hurt','retired not out') and w.player_dismissed_id is not null and not coalesce(wi.is_super_over, false) group by 1,2,3""")
    con.execute("""create table bat_sum as
      select i.player_id, i.format, i.tournament_key, i.season, i.gender,
             count(distinct i.match_id) matches, count(*) innings, sum(i.runs) runs, sum(i.balls) balls_faced, sum(i.fours) fours, sum(i.sixes) sixes,
             count(*) filter (where i.runs >= 50 and i.runs < 100) fifties, count(*) filter (where i.runs >= 100) hundreds,
             count(*) filter (where i.runs = 0 and o.outs > 0) ducks, coalesce(sum(o.outs),0) dismissals, max(i.runs) high_score
      from bat_inn i left join bat_out o using (player_id, match_id, innings) group by all""")
    con.execute(f"""create table bowl_sum as
      select bowler_id player_id, any_value(format) format, tournament_key, season, any_value(gender) gender,
             count(distinct match_id) bowling_matches, count(*) filter (where is_legal_delivery) balls_bowled,
             sum(runs_off_bat + coalesce(wides,0) + coalesce(noballs,0)) runs_conceded,
             count(*) filter (where wicket = 1 and wicket_type not in {NOT_BOWLER_WICKET}) wickets,
             count(*) filter (where is_legal_delivery and runs_off_bat = 0) dot_balls
      from balls where bowler_id is not null and not is_super_over group by bowler_id, format, tournament_key, season""")
    # Matches played, as the playing XI lists them (match_people), for each format, competition and season. A player who was in the XI and neither batted nor bowled has no row above for it, so those
    # combinations get a row of their own with only `appearances` filled in (Ari, 2026-10-25: Mat is matches played everywhere, MS Dhoni 789 and not the 692 batting or bowling cards gave).
    con.execute(f"""create table app_sum as
      select mp.person_id player_id, m.format, m.tournament_key, m.season, any_value(m.gender) gender, count(distinct m.match_id) appearances
      from {csv('match_people')} mp join matches m on m.match_id = mp.match_id where mp.role = 'player' and mp.person_id is not null group by mp.person_id, m.format, m.tournament_key, m.season""")
    files["player_summary"] = write("""select x.*, tn.tournament_name, tn.filter_section from (
          select coalesce(s.player_id, a.player_id) player_id, coalesce(s.format, a.format) format, coalesce(s.tournament_key, a.tournament_key) tournament_key, coalesce(s.season, a.season) season,
                 coalesce(s.gender, a.gender) gender, s.* exclude (player_id, format, tournament_key, season, gender), a.appearances
          from (select coalesce(b.player_id, w.player_id) player_id, coalesce(b.format, w.format) format,
                  coalesce(b.tournament_key, w.tournament_key) tournament_key, coalesce(b.season, w.season) season, coalesce(b.gender, w.gender) gender, b.* exclude (player_id, format, tournament_key, season, gender), w.* exclude (player_id, format, tournament_key, season, gender)
                from bat_sum b full join bowl_sum w on b.player_id = w.player_id and b.format = w.format and b.tournament_key is not distinct from w.tournament_key and b.season = w.season) s
          full join app_sum a on a.player_id = s.player_id and a.format = s.format and a.tournament_key is not distinct from s.tournament_key and a.season = s.season) x
        left join (select tournament_key, any_value(tournament_name) tournament_name, any_value(filter_section) filter_section from matches group by 1) tn on tn.tournament_key = x.tournament_key""",
        "player_summary", "order by 1, 2, 3, 4")

    # ---- innings tables for Records: one row per player and innings, sorted by player so the browser reads one player's rows ----
    # Super Overs are left out, as in the summary. Format, type, tournament and season are kept so the page scopes them the way it scopes the ball files.
    # A batter's balls faced leave wides out. The bowler is credited with the wickets the Laws allow (NOT_BOWLER_WICKET), and conceded runs are the bat runs, wides and no-balls.
    con.execute(f"""create table bat_ball as
      select striker_id player_id, match_id, innings, delivery_number,
             sum(runs_off_bat) over w cum_runs, count(*) filter (where coalesce(wides,0) = 0) over w cum_balls
      from balls where striker_id is not null and not is_super_over
      window w as (partition by striker_id, match_id, innings order by delivery_number rows between unbounded preceding and current row)""")
    con.execute(f"""create table bat_to as
      select player_id, match_id, innings, min(cum_balls) filter (where cum_runs >= 50) balls_to_50, min(cum_balls) filter (where cum_runs >= 100) balls_to_100
      from bat_ball group by 1,2,3""")
    con.execute("""create table bat_team as select match_id, innings, any_value(batting_team) team, any_value(bowling_team) opponent
      from balls where not is_super_over group by 1,2""")

    # ---- match context for the Full stats splits: where, toss, result, batting first, the innings number, home or away ----
    # Toss, from the team's side: won_bat, won_field, lost_bat (the other side chose to field, so the team batted) or lost_field. Result: the winner if there is one, else tie, draw or no result.
    # Home or away: in an international the venue country is the team's (home), the opponent's (away) or neither (neutral); in a franchise or domestic match it is the player's own country (home) or not (away).
    con.execute("create table home_extra as select * from (values ('West Indies','Antigua and Barbuda'),('West Indies','Barbados'),('West Indies','Dominica'),('West Indies','Grenada'),('West Indies','Guyana'),('West Indies','Jamaica'),"
                "('West Indies','Saint Kitts and Nevis'),('West Indies','Saint Lucia'),('West Indies','Saint Vincent and the Grenadines'),('West Indies','Trinidad and Tobago'),('England','Wales'),('Ireland','Northern Ireland')) t(team, country)")
    con.execute("""create table mt_ctx as
      select m.match_id, t.team, case when t.team = m.team_1 then m.team_2 else m.team_1 end as opponent,
             case when m.toss_winner is null or m.toss_decision is null then null
                  when m.toss_winner = t.team then 'won_' || lower(m.toss_decision)
                  else 'lost_' || (case when lower(m.toss_decision) = 'field' then 'bat' else 'field' end) end as toss,
             case when m.winner is not null then (case when m.winner = t.team then 'won' else 'lost' end)
                  when m.outcome in ('tie', 'draw', 'no result') then m.outcome else 'no result' end as result,
             t.team = f.team as team_bat_first
      from matches m
      cross join unnest([m.team_1, m.team_2]) as t(team)
      left join (select match_id, any_value(team) team from bat_team where innings = 1 group by 1) f on f.match_id = m.match_id""")
    con.execute("""create table team_inn_no as
      select match_id, innings, team, row_number() over (partition by match_id, team order by innings) team_innings from bat_team""")
    con.execute("""create table field_inn_no as
      select match_id, innings, opponent as team, row_number() over (partition by match_id, opponent order by innings) team_innings from bat_team""")
    con.execute("""create table inn_pos as
      select b.match_id, b.innings, b.striker_id as player_id, any_value(bp.position)::int as position
      from (select distinct match_id, innings, striker_id, striker from balls where striker_id is not null and not is_super_over) b
      join (select match_id, innings, name, row_number() over (partition by match_id, innings order by first, struck desc, name) as position from (
              select match_id, innings, name, min(delivery_number) as first, max(on_strike) as struck from (
                select match_id, innings, delivery_number, striker as name, 1 as on_strike from balls where not is_super_over
                union all select match_id, innings, delivery_number, non_striker as name, 0 as on_strike from balls where not is_super_over) where name is not null group by 1, 2, 3)) bp
        on bp.match_id = b.match_id and bp.innings = b.innings and bp.name = b.striker
      group by 1, 2, 3""")
    # Host of a franchise match: at a ground in an edition (one season of a league) the host is the team that plays there at least 1.8 times as often as any other team, with at least three
    # matches at the ground. A visiting team plays a ground once or twice a season, the home team most of its matches, so the rule finds a team's home ground without a table of them and
    # leaves a bubble season, a central-venue league, a final or a one-off ground without a host (neutral). A match is home for the host, away for the other team, neutral if the host is not in it.
    con.execute("""create table match_host as
      with t as (select m.edition, m.venue, x.team from matches m cross join unnest([m.team_1, m.team_2]) as x(team) where m."type" <> 'Intl' and m.venue is not null),
           c as (select edition, venue, team, count(*) n from t group by 1, 2, 3),
           r as (select edition, venue, team, n, row_number() over (partition by edition, venue order by n desc, team) rk from c),
           v as (select edition, venue, count(*) matches from matches where "type" <> 'Intl' and venue is not null group by 1, 2)
      select r1.edition, r1.venue, r1.team host
      from r r1 left join r r2 on r2.edition = r1.edition and r2.venue = r1.venue and r2.rk = 2
      join v on v.edition = r1.edition and v.venue = r1.venue
      where r1.rk = 1 and v.matches >= 3 and r1.n >= 1.8 * coalesce(r2.n, 0)""")
    split_cols = """m.venue_country, m.venue_continent, m.match_number::int as match_number, m.stage_class, m.stage_name, m.tournament_kind, m.filter_section,
             c.toss, c.result, c.team_bat_first"""
    def home_away(team, opponent):
        return f"""case when m.venue_country is null then null
             when m."type" = 'Intl' then (case when {team} = m.venue_country or he1.team is not null then 'home'
                                              when {opponent} = m.venue_country or he2.team is not null then 'away' else 'neutral' end)
             else (case when mh.host is null or mh.host not in (m.team_1, m.team_2) then 'neutral' when mh.host = {team} then 'home' else 'away' end) end as home_away"""
    def home_joins(team, opponent):
        return f"""left join home_extra he1 on he1.team = {team} and he1.country = m.venue_country
      left join home_extra he2 on he2.team = {opponent} and he2.country = m.venue_country
      left join match_host mh on mh.edition = m.edition and mh.venue = m.venue"""
    con.execute(f"""create table bat_innings as
      select i.player_id, i.match_id, i.innings, i.format, m.type as "type", i.tournament_key, i.season, i.gender, m.start_date, m.venue,
             bt.team, bt.opponent, i.runs, i.balls, i.fours, i.sixes, coalesce(o.outs, 0) > 0 as is_out,
             t.balls_to_50, t.balls_to_100,
             coalesce(wi.target_runs is not null or (i.format = 'TEST' and i.innings = 4), false) as chasing,
             {split_cols}, {home_away('bt.team', 'bt.opponent')}, ti.team_innings, ip.position
      from bat_inn i
      join bat_team bt on bt.match_id = i.match_id and bt.innings = i.innings
      join matches m on m.match_id = i.match_id
      left join bat_out o on o.player_id = i.player_id and o.match_id = i.match_id and o.innings = i.innings
      left join bat_to t on t.player_id = i.player_id and t.match_id = i.match_id and t.innings = i.innings
      left join {csv('innings')} wi on wi.match_id = i.match_id and wi.innings = i.innings
      left join mt_ctx c on c.match_id = i.match_id and c.team = bt.team
      left join team_inn_no ti on ti.match_id = i.match_id and ti.innings = i.innings and ti.team = bt.team
      left join inn_pos ip on ip.match_id = i.match_id and ip.innings = i.innings and ip.player_id = i.player_id
      {home_joins('bt.team', 'bt.opponent')}""")
    files["bat_innings"] = write("select * from bat_innings", "bat_innings", "order by player_id, start_date, match_id, innings")
    con.execute(f"""create table bowl_ball as
      select bowler_id player_id, match_id, innings, delivery_number, "over", is_legal_delivery,
             runs_off_bat + coalesce(wides,0) + coalesce(noballs,0) conceded, coalesce(wicket = 1 and wicket_type not in {NOT_BOWLER_WICKET}, false) w
      from balls where bowler_id is not null and not is_super_over""")
    # A hat-trick is three bowler wickets on his three consecutive legal deliveries inside an innings. Four in a row counts once.
    con.execute("""create table bowl_hat as
      select player_id, match_id, innings, count(*) filter (where w and l1 and l2 and not coalesce(l3, false)) hat_tricks
      from (select *, lag(w, 1) over x l1, lag(w, 2) over x l2, lag(w, 3) over x l3 from bowl_ball where is_legal_delivery
            window x as (partition by player_id, match_id, innings order by delivery_number))
      group by 1,2,3""")
    # A maiden is a completed over (every ball legal, the match's balls per over) that conceded no runs. The Hundred has no overs, so it has none.
    con.execute("""create table bowl_maidens as
      select b.player_id, b.match_id, b.innings, count(*) filter (where o.legal >= m.balls_per_over and o.conc = 0 and m.tournament_key is distinct from 'hnd') maidens
      from (select player_id, match_id, innings, "over", count(*) filter (where is_legal_delivery) legal, sum(conceded) conc from bowl_ball group by 1,2,3,4) o
      join (select distinct player_id, match_id, innings from bowl_ball) b using (player_id, match_id, innings)
      join matches m on m.match_id = b.match_id
      where o.player_id = b.player_id and o.match_id = b.match_id and o.innings = b.innings
      group by 1,2,3""")
    con.execute("""create table bowl_agg as
      select bb.player_id, bb.match_id, bb.innings, any_value(x.format) format, any_value(x.tournament_key) tournament_key, any_value(x.season) season, any_value(x.gender) gender,
             any_value(x.bowling_team) team, any_value(x.batting_team) opponent,
             count(*) filter (where bb.is_legal_delivery) balls, sum(bb.conceded) runs, count(*) filter (where bb.w) wickets,
             count(*) filter (where bb.is_legal_delivery and bb.conceded = 0) dots
      from bowl_ball bb join balls x on x.match_id = bb.match_id and x.innings = bb.innings and x.delivery_number = bb.delivery_number
      group by 1,2,3""")
    con.execute(f"""create table bowl_innings as
      select w.player_id, w.match_id, w.innings, w.format, m.type as "type", w.tournament_key, w.season, w.gender, m.start_date, m.venue, w.team, w.opponent,
             w.balls, w.runs, w.wickets, coalesce(h.hat_tricks, 0) hat_tricks, coalesce(mi.maidens, 0) maidens, w.dots,
             w.balls >= case when w.tournament_key = 'hnd' then 10 when w.format = 'TEST' then 60 when w.format = 'ODI' then 30 else 24 end as economy_counts,
             {split_cols}, {home_away('w.team', 'w.opponent')}, fi.team_innings
      from bowl_agg w
      join matches m on m.match_id = w.match_id
      left join bowl_hat h on h.player_id = w.player_id and h.match_id = w.match_id and h.innings = w.innings
      left join bowl_maidens mi on mi.player_id = w.player_id and mi.match_id = w.match_id and mi.innings = w.innings
      left join mt_ctx c on c.match_id = w.match_id and c.team = w.team
      left join field_inn_no fi on fi.match_id = w.match_id and fi.innings = w.innings and fi.team = w.team
      {home_joins('w.team', 'w.opponent').replace('i.player_id', 'w.player_id')}""")
    files["bowl_innings"] = write("select * from bowl_innings", "bowl_innings", "order by player_id, start_date, match_id, innings")

    # ---- partnerships: a pair of batters at the wicket between two wickets, one row for each batter of the pair so a player's rows sit together ----
    # Runs are every run the team scored while the pair was in, extras included (as the scorecard counts them, penalty runs too), balls are the pair's balls faced (wides left out).
    # A retired batter or a new batter starts a new pair, so a partnership is the pair plus the wickets fallen when it began. The non-striker's id comes from the match's players.
    con.execute(f"""create table pship as
      select b.match_id, b.innings, b.team_wickets_fallen + 1 as wicket_number, least(b.striker_id, ns.person_id) player_1, greatest(b.striker_id, ns.person_id) player_2,
             any_value(b.batting_team) team, any_value(b.bowling_team) opponent, any_value(b.format) format, any_value(m.type) as "type", any_value(b.tournament_key) tournament_key, any_value(b.season) season,
             any_value(b.gender) gender, any_value(m.start_date) start_date, any_value(m.venue) venue,
             sum(b.runs_off_bat + coalesce(b.extras, 0)) runs, count(*) filter (where coalesce(b.wides, 0) = 0) balls, sum(b.runs_off_bat) filter (where b.striker_id = least(b.striker_id, ns.person_id)) player_1_runs,
             sum(b.runs_off_bat) filter (where b.striker_id = greatest(b.striker_id, ns.person_id)) player_2_runs,
             bool_or(b.wicket = 1 and b.wicket_type not in ('retired hurt', 'retired not out')) ended
      from balls b
      join matches m on m.match_id = b.match_id
      join {csv('match_people')} ns on ns.match_id = b.match_id and ns.role = 'player' and ns.person = b.non_striker and ns.team = b.batting_team
      where b.striker_id is not null and not b.is_super_over
      group by b.match_id, b.innings, b.team_wickets_fallen, least(b.striker_id, ns.person_id), greatest(b.striker_id, ns.person_id)""")
    files["partnerships_by_player"] = write("""select player_id, partner_id, * exclude (player_1, player_2, player_1_runs, player_2_runs), mine_runs, partner_runs from (
        select player_1 player_id, player_2 partner_id, *, coalesce(player_1_runs, 0) mine_runs, coalesce(player_2_runs, 0) partner_runs from pship
        union all by name
        select player_2 player_id, player_1 partner_id, *, coalesce(player_2_runs, 0) mine_runs, coalesce(player_1_runs, 0) partner_runs from pship)""",
        "partnerships_by_player", "order by player_id, start_date, match_id, innings, wicket_number")

    # ---- bowling partnerships (tandems): two bowlers bowling in turn from opposite ends, in one innings ----
    # A turn is a run of consecutive balls by one bowler: an over in cricket, a set of 5 or 10 balls in The Hundred. A partnership is a run of turns in which each bowler's turn
    # is followed by the other's and then by his own again (A, B, A, B, ...), so it needs at least three turns. A turn split by an injury is still one turn for the bowler who
    # bowled it. Runs are the bowlers' own (bat runs, wides, no-balls), wickets are the ones the bowler is credited with. It counts when the two bowl together for at least
    # 10 overs in Tests, 8 in ODIs, 4 in T20 and 20 balls in The Hundred (Ari, 2026-10-18, the Hundred figure is the same share of an innings as T20's). One row for each bowler of a pair.
    con.execute(f"""create table tn_balls as
      select match_id, innings, delivery_number, bowler_id, is_legal_delivery, runs_off_bat + coalesce(wides,0) + coalesce(noballs,0) conceded,
             coalesce(wicket = 1 and wicket_type not in {NOT_BOWLER_WICKET}, false) w, batting_team, bowling_team
      from balls where bowler_id is not null and not is_super_over""")
    con.execute("""create table tn_turn as
      select *, sum(nt) over (partition by match_id, innings order by delivery_number) turn
      from (select *, case when bowler_id is not distinct from lag(bowler_id) over o then 0 else 1 end nt from tn_balls window o as (partition by match_id, innings order by delivery_number))""")
    con.execute("""create table tn_turns as
      select match_id, innings, turn, any_value(bowler_id) bowler_id, count(*) filter (where is_legal_delivery) balls, sum(conceded) conceded, sum(w::int) w,
             any_value(batting_team) opponent, any_value(bowling_team) team
      from tn_turn group by 1, 2, 3""")
    con.execute("""create table tn_blocks as
      select match_id, innings, min(turn) a, max(turn) + 2 e
      from (select *, turn - row_number() over (partition by match_id, innings order by turn) g
            from (select *, bowler_id = lead(bowler_id, 2) over o and bowler_id <> lead(bowler_id, 1) over o as isalt
                  from tn_turns window o as (partition by match_id, innings order by turn)) where isalt)
      group by match_id, innings, g""")
    con.execute("""create table tn_side as
      select b.match_id, b.innings, b.a, b.e, t.bowler_id, sum(t.balls) balls, sum(t.conceded) conceded, sum(t.w) w, count(*) turns, any_value(t.opponent) opponent, any_value(t.team) team
      from tn_blocks b join tn_turns t on t.match_id = b.match_id and t.innings = b.innings and t.turn between b.a and b.e
      group by b.match_id, b.innings, b.a, b.e, t.bowler_id""")
    con.execute("""create table tandems as
      select x.bowler_id player_id, y.bowler_id partner_id, x.match_id, x.innings, x.a, m.format, m."type" as "type", m.tournament_key, m.season, m.gender, m.start_date, m.venue, x.team, x.opponent,
             x.balls + y.balls balls, x.conceded + y.conceded runs, x.w + y.w wickets, x.w mine_wickets, y.w partner_wickets, x.balls mine_balls, y.balls partner_balls, x.turns + y.turns turns
      from tn_side x join tn_side y on y.match_id = x.match_id and y.innings = x.innings and y.a = x.a and y.bowler_id <> x.bowler_id
      join matches m on m.match_id = x.match_id
      where x.balls + y.balls >= case when m.tournament_key = 'hnd' then 20 when m.format = 'TEST' then 60 when m.format = 'ODI' then 48 else 24 end""")
    files["tandems_by_player"] = write("select * from tandems", "tandems_by_player", "order by player_id, start_date, match_id, innings, a")

    # ---- two small tables that stand in for reading the whole-match ball file in the browser (the Bowling Key numbers and Batters tiles used to read it over HTTP, piece by piece) ----
    # letoff_by_bowler: each ball a bowler bowled that a batter was dropped off (not out on it), with the runs that batter scored from the later balls of that innings (from every bowler).
    # The loader takes the first such ball of a batter's innings under the filters and adds the runs after it, so the numbers are what the old query gave.
    con.execute("""create table letoff_by_bowler as
      with ev as (select bowler_id as player_id, match_id, innings, striker_id, delivery_number from balls
                  where bowler_id is not null and striker_id is not null and player_dismissed is null and coalesce(regexp_matches(ball_events, 'dropped catch'), false))
      select ev.player_id, ev.match_id, ev.innings, ev.striker_id, ev.delivery_number,
             coalesce(sum(x.runs_off_bat) filter (where x.delivery_number > ev.delivery_number), 0)::int as runs_after
      from ev join balls x on x.match_id = ev.match_id and x.innings = ev.innings and x.striker_id = ev.striker_id
      group by all""")
    files["letoff_by_bowler"] = write("select * from letoff_by_bowler", "letoff_by_bowler", "order by player_id, match_id, innings, delivery_number")
    # positions_by_bowler: the batting order of every innings a bowler bowled in. A batter's position is the order batters first appear in the innings, as striker or non-striker, among
    # their team's batters; two batters who first appear on the same ball are the openers, and the striker is first.
    con.execute("""create table bat_pos as
      select match_id, innings, name, row_number() over (partition by match_id, innings order by first, struck desc, name) as position from (
        select match_id, innings, name, min(delivery_number) as first, max(on_strike) as struck from (
          select match_id, innings, delivery_number, striker as name, 1 as on_strike from balls
          union all
          select match_id, innings, delivery_number, non_striker as name, 0 as on_strike from balls) where name is not null group by 1, 2, 3)""")
    files["positions_by_bowler"] = write("""select bm.player_id, bp.match_id, bp.innings, bp.name, bp.position::int as position
      from (select distinct bowler_id as player_id, match_id, innings from balls where bowler_id is not null) bm join bat_pos bp on bp.match_id = bm.match_id and bp.innings = bm.innings""",
      "positions_by_bowler", "order by player_id, match_id, innings, position")


    # ---- fielding credits for Full stats: one row for each catch, stumping and run out a player was credited with (substitutes do not count; Super Overs are left out) ----
    # A caught and bowled is the bowler's catch. A run out with one fielder is a direct hit, with more it is shared. The data does not say which catches were taken by the wicketkeeper.
    con.execute(f"""create table fielding_by_player as
      select f.fielder_id as player_id, w.match_id, w.innings, w.delivery_number,
             case when w.wicket_type = 'caught' then 'catch' when w.wicket_type = 'stumped' then 'stumping'
                  when n.n = 1 then 'run_out_direct' else 'run_out_shared' end as kind,
             m.format, m."type" as "type", m.tournament_key, m.season, m.start_date
      from {csv('wickets')} w
      join {csv('wicket_fielders')} f on f.match_id = w.match_id and f.innings = w.innings and f.delivery_number = w.delivery_number and f.wicket_number = w.wicket_number
      join (select match_id, innings, delivery_number, wicket_number, count(*) n from {csv('wicket_fielders')} where not substitute group by 1,2,3,4) n
        on n.match_id = w.match_id and n.innings = w.innings and n.delivery_number = w.delivery_number and n.wicket_number = w.wicket_number
      join matches m on m.match_id = w.match_id
      join {csv('innings')} i on i.match_id = w.match_id and i.innings = w.innings
      where not f.substitute and f.fielder_id is not null and w.wicket_type in ('caught', 'stumped', 'run out') and not coalesce(i.is_super_over, false)
      union all
      select b.bowler_id, b.match_id, b.innings, b.delivery_number, 'caught_and_bowled', b.format, b."type", b.tournament_key, b.season, b.start_date
      from balls b where b.wicket_type = 'caught and bowled' and b.bowler_id is not null and not b.is_super_over""")
    files["fielding_by_player"] = write("select * from fielding_by_player", "fielding_by_player", "order by player_id, start_date, match_id, innings, delivery_number")

    # ---- trophies: the champion of each edition of a major tournament or league, and every player who played for the champion (or the losing finalist) ----
    # Only tournaments of kind 'tournament' and 'league' count (Ari, 2026-10-18); small events and qualifiers stay on their own pages. An edition is keyed by tournament, season and
    # gender (the PSL 2020 edition is merged across two data seasons, and the Women's Championship is keyed by cycle, see data/edition_overrides.csv). The champion is the winner of the
    # match tagged Final: with more than one Final (a best of three) the team with most wins, with a tied or no result Final and no named winner nobody. An edition with no Final has no
    # champion and counts as played only, unless the overrides name one (each with a source). A player's trophy is any edition where he played a match for the champion.
    con.execute(f"create table ovr as select * from read_csv({q(REF / 'edition_overrides.csv')}, sample_size=-1, all_varchar=true)")
    con.execute("""create table tro_matches as
      select m.match_id, m.tournament_key, m.tournament_name, m.gender, m.format, m."type" as "type", m.season, m.start_date, m.winner, m.team_1, m.team_2, m.stage_name,
             case when m.tournament_key = 'women-championship-female' then m.tournament_key || '|' ||
                    case when cast(substr(m.season, 1, 4) as int) between 2014 and 2016 then '2014-16' when cast(substr(m.season, 1, 4) as int) between 2017 and 2020 then '2017-20'
                         when cast(substr(m.season, 1, 4) as int) between 2022 and 2025 then '2022-25' else m.season end || '|' || m.gender
                  else m.edition end as ed
      from matches m where m.tournament_kind in ('tournament', 'league') and m.edition is not null""")
    con.execute("""create table tro_wins as select ed, winner team, count(*) wins from tro_matches where stage_name = 'Final' and winner is not null group by 1, 2""")
    con.execute("""create table tro_champ as
      select ed, team champion from (select ed, team, rank() over (partition by ed order by wins desc) r, count(*) over (partition by ed, wins) same from tro_wins) where r = 1 and same = 1""")
    con.execute("""create table tro_runner as
      select ed, arg_max(opponent, n) runner_up
      from (select f.ed, case when f.team_1 = c.champion then f.team_2 else f.team_1 end opponent, count(*) n
            from tro_matches f join tro_champ c on c.ed = f.ed where f.stage_name = 'Final' and (f.team_1 = c.champion or f.team_2 = c.champion) group by 1, 2) group by ed""")
    con.execute("""create table tro_editions as
      select e.ed, e.tournament_key, e.tournament_name, e.gender, e.format, e."type" as "type", split_part(e.ed, '|', 2) season_label,
             case when o.tournament_key is not null and o.edition = 'all' then null else coalesce(nullif(o.champion, ''), c.champion) end champion,
             case when o.tournament_key is not null and o.edition = 'all' then null else coalesce(nullif(o.runner_up, ''), r.runner_up) end runner_up
      from (select ed, any_value(tournament_key) tournament_key, any_value(tournament_name) tournament_name, any_value(gender) gender, any_value(format) format, any_value("type") "type" from tro_matches group by ed) e
      left join tro_champ c on c.ed = e.ed left join tro_runner r on r.ed = e.ed
      left join ovr o on o.tournament_key = e.tournament_key and (o.edition = split_part(e.ed, '|', 2) or o.edition = 'all')""")
    con.execute(f"""create table trophies as
      select mp.person_id player_id, e.tournament_key, e.tournament_name, e.ed edition, e.season_label, e.gender, e.format, e."type" as "type", mp.team, count(distinct tm.match_id) matches,
             string_agg(distinct tm.season, '|') seasons, min(tm.start_date) first_date, e.champion, e.runner_up,
             case when e.champion is not null and mp.team = e.champion then 'champion' when e.runner_up is not null and mp.team = e.runner_up then 'runner-up' else 'played' end result,
             e.champion is not null decided
      from {csv('match_people')} mp join tro_matches tm on tm.match_id = mp.match_id join tro_editions e on e.ed = tm.ed
      where mp.role = 'player' and mp.person_id is not null group by all""")
    files["trophies_by_player"] = write("select * from trophies", "trophies_by_player", "order by player_id, first_date, edition")

    # ---- pace to milestones: for every scope the page can show (a format choice, with all competitions or one), every player's first innings at or past each landmark ----
    # The app ranks a player against everyone of the same gender in the same scope by fewest innings (then balls, then the earlier date). A scope is the page's own Format and Competition,
    # worked out with the same conditions the app writes for the ball files. Season is not a scope: milestones are career figures.
    scopes = {"INTERNATIONAL": "type = 'Intl'", "TEST": "format = 'TEST'", "ODI": "format = 'ODI'", "T20I": "format = 'T20' and type = 'Intl'", "T20S": "format = 'T20'", "LEAGUE": "type <> 'Intl'"}
    con.execute("create table lm_runs as select * from (values (500), (1000), (2500), (5000), (10000), (15000), (20000), (25000), (30000), (35000)) t(v)")
    con.execute("create table lm_wkts as select * from (values (1), (25), (50), (100), (200), (300), (400), (500), (600), (800), (1000)) t(v)")
    def scoped(table, cols):
        return " union all ".join(
            f"select '{f}' scope_format, {tk} tournament_key, {cols} from {table} where {pred}" + ("" if tk == "''" else " and tournament_key is not null")
            for f, pred in scopes.items() for tk in ("''", "tournament_key"))
    con.execute(f"""create table bat_cum as
      select scope_format, tournament_key, player_id, gender, start_date, balls, row_number() over w innings_n, sum(runs) over w cum, coalesce(sum(runs) over w - runs, 0) prev, sum(balls) over w cum_balls
      from ({scoped('bat_innings', 'player_id, gender, start_date, match_id, innings, runs, balls')})
      window w as (partition by scope_format, tournament_key, player_id order by start_date, match_id, innings)""")
    con.execute(f"""create table bowl_cum as
      select scope_format, tournament_key, player_id, gender, start_date, balls, row_number() over w innings_n, sum(wickets) over w cum, coalesce(sum(wickets) over w - wickets, 0) prev, sum(balls) over w cum_balls
      from ({scoped('bowl_innings', 'player_id, gender, start_date, match_id, innings, wickets, balls')})
      window w as (partition by scope_format, tournament_key, player_id order by start_date, match_id, innings)""")
    files["milestone_pace"] = write("""
      select scope_format, tournament_key, 'bat' side, player_id, gender, l.v landmark, c.innings_n, c.cum_balls balls, c.start_date
      from bat_cum c join lm_runs l on c.prev < l.v and c.cum >= l.v
      union all
      select scope_format, tournament_key, 'bowl', player_id, gender, l.v, c.innings_n, c.cum_balls, c.start_date
      from bowl_cum c join lm_wkts l on c.prev < l.v and c.cum >= l.v""", "milestone_pace", "order by scope_format, tournament_key, side, gender, landmark, innings_n, balls, start_date")

    # ---- verification against the source ----
    def one(sql): return con.execute(sql).fetchone()[0]
    p = lambda n: f"{q(out / (n + '.parquet'))}"
    chk = {
        "runs_off_bat": (one(f"select sum(runs_off_bat) from {csv('ball_by_ball_data')}"), one(f"select sum(runs_off_bat) from {p('balls_by_batter')}")),
        "balls_by_bowler rows": (n_src, one(f"select count(*) from {p('balls_by_bowler')}")),
        "balls_by_match rows": (n_src, one(f"select count(*) from {p('balls_by_match')}")),
        "match rows": (one(f"select count(*) from {csv('matches')}"), one(f"select count(*) from {p('matches')}")),
        "summary runs (balls with a batter id)": (one("select sum(runs_off_bat) from balls where striker_id is not null and not is_super_over"), one(f"select sum(runs) from {p('player_summary')}")),
        "summary wickets (balls with a bowler id)": (one(f"select count(*) from balls where wicket=1 and wicket_type not in {NOT_BOWLER_WICKET} and bowler_id is not null and not is_super_over"), one(f"select sum(wickets) from {p('player_summary')}")),
    }
    chk["summary balls faced"] = (one("select count(*) from balls where striker_id is not null and coalesce(wides,0) = 0 and not is_super_over"), one(f"select sum(balls_faced) from {p('player_summary')}"))
    chk["summary balls bowled"] = (one("select count(*) from balls where bowler_id is not null and is_legal_delivery and not is_super_over"), one(f"select sum(balls_bowled) from {p('player_summary')}"))
    chk["summary runs conceded"] = (one("select sum(runs_off_bat + coalesce(wides,0) + coalesce(noballs,0)) from balls where bowler_id is not null and not is_super_over"), one(f"select sum(runs_conceded) from {p('player_summary')}"))
    chk["summary fours"] = (one("select count(*) from balls where striker_id is not null and runs_off_bat = 4 and not coalesce(non_boundary,false) and not is_super_over"), one(f"select sum(fours) from {p('player_summary')}"))
    # Counted a second way, from the balls, the match's players and the wickets: a batter who faced a ball, was the non-striker, or was dismissed.
    chk["summary innings"] = (one(f"""select count(*) from (
        select striker_id pid, match_id, innings from balls where striker_id is not null and not is_super_over
        union select mp.person_id, b.match_id, b.innings from balls b join {csv('match_people')} mp on mp.match_id = b.match_id and mp.role = 'player' and mp.person = b.non_striker and mp.team = b.batting_team where not b.is_super_over and b.non_striker is not null
        union select w.player_dismissed_id, w.match_id, w.innings from {csv('wickets')} w where w.player_dismissed_id is not null and w.wicket_type not in ('retired hurt','retired not out')
          and exists (select 1 from balls z where z.match_id = w.match_id and z.innings = w.innings and not z.is_super_over))"""), one(f"select sum(innings) from {p('player_summary')}"))
    chk["dismissals file vs summary"] = (one(f"select count(*) from {p('dismissals_by_batter')} where not is_super_over"), one(f"select sum(dismissals) from {p('player_summary')}"))
    chk["bat_innings runs vs summary"] = (one(f"select sum(runs) from {p('player_summary')}"), one(f"select sum(runs) from {p('bat_innings')}"))
    chk["bat_innings rows vs summary innings"] = (one(f"select sum(innings) from {p('player_summary')}"), one(f"select count(*) from {p('bat_innings')}"))
    chk["bowl_innings wickets vs summary"] = (one(f"select sum(wickets) from {p('player_summary')}"), one(f"select sum(wickets) from {p('bowl_innings')}"))
    chk["bowl_innings balls vs summary"] = (one(f"select sum(balls_bowled) from {p('player_summary')}"), one(f"select sum(balls) from {p('bowl_innings')}"))
    chk["bowl_innings runs vs summary"] = (one(f"select sum(runs_conceded) from {p('player_summary')}"), one(f"select sum(runs) from {p('bowl_innings')}"))
    chk["partnership runs vs balls"] = (one("select sum(runs_off_bat + coalesce(extras, 0)) from balls b join " + csv('match_people') + " ns on ns.match_id = b.match_id and ns.role = 'player' and ns.person = b.non_striker and ns.team = b.batting_team where b.striker_id is not null and not b.is_super_over"), one(f"select sum(runs) from (select distinct match_id, innings, wicket_number, player_id, partner_id, runs from {p('partnerships_by_player')} where player_id < partner_id)"))
    chk["milestone runs, international"] = (one(f"select count(*) from (select player_id, sum(runs) r from {p('bat_innings')} where type = 'Intl' group by 1) t join lm_runs l on t.r >= l.v"), one(f"select count(*) from {p('milestone_pace')} where scope_format = 'INTERNATIONAL' and tournament_key = '' and side = 'bat'"))
    chk["milestone wickets, league"] = (one(f"select count(*) from (select player_id, sum(wickets) r from {p('bowl_innings')} where type <> 'Intl' group by 1) t join lm_wkts l on t.r >= l.v"), one(f"select count(*) from {p('milestone_pace')} where scope_format = 'LEAGUE' and tournament_key = '' and side = 'bowl'"))
    if not a.no_cricinfo:
        chk["tracked balls"] = (one(f"select count(*) from {csv('cricinfo_tracking')} where " + " or ".join(f"{c} is not null" for c in TRACKING)), one(f"select count(*) from {p('balls_by_batter')} where " + " or ".join(f"{c} is not null" for c in TRACKING)))
    for k, (x, y) in chk.items():
        if x != y: problems.append(f"{k}: source {x}, export {y}")
    unkeyed = one(f"select count(*) from {p('matches')} where event is not null and tournament_kind <> 'bilateral' and (tournament_key is null or edition is null)")
    noid = con.execute(f"select count(*), coalesce(sum(runs_off_bat),0) from {csv('ball_by_ball_data')} where striker_id is null").fetchone()
    print(f"note: {noid[0]} balls ({noid[1]} runs) have no batter id in the source, so they are in the ball files but not in player_summary")
    if unkeyed: problems.append(f"{unkeyed} matches with an event but no tournament key")
    # Per-player files and the search list for the browser (tools/player_files.py), derived from the tables written above.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import player_files
    pf = player_files.build(out)
    print("player files:", pf["players_with_files"], f"in {pf['seconds']} s")
    manifest = {"built": time.strftime("%Y-%m-%d %H:%M:%S"), "no_cricinfo": a.no_cricinfo, "seconds": round(time.time() - t0),
                "files": {n: {"bytes": f.stat().st_size, "rows": one(f"select count(*) from {q(f)}"), "sha256": hashlib.sha256(f.read_bytes()).hexdigest()[:16]} for n, f in files.items()},
                "checks": {k: {"source": x, "export": y} for k, (x, y) in chk.items()}, "player_files": pf, "problems": problems}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1, default=str))
    for n, v in manifest["files"].items(): print(f"{n:20} {v['rows']:>9} rows {v['bytes']/1e6:8.1f} MB")
    print("checks:", {k: ("ok" if x == y else "MISMATCH") for k, (x, y) in chk.items()})
    if problems: print("PROBLEMS:\n  " + "\n  ".join(problems)); return 1
    print("export ok in", manifest["seconds"], "s"); return 0


def team_id(col, ident="", src=None):
    """Team id: identity key (or a slug of the name) plus the league group and gender, so the same name in two leagues is two teams."""
    ident = ident or {"m.team_1": "i1", "m.team_2": "i2", "m.winner": "iw"}[col]
    coll = "m.collection"
    slug = f"regexp_replace(lower({col}), '[^a-z0-9]+', '-', 'g')"
    gender = "m.gender"
    return (f"case when {col} is null then null else coalesce({ident}.team_key, {slug}) || '|' || "
            f"(case when {coll} in {INTL} then 'intl' else {coll} end) || '|' || {gender} end")


if __name__ == "__main__":
    sys.exit(main())

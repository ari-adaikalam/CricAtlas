"""The tables record lists read and, for each, every column a list can show (the reference site column names, mapped to SQL over the scope tables built in records_files.py).

A source has `frm` (the FROM clause), `cols` (column name -> (kind, SQL)), an optional `sub` (the line under the first cell, `(kind, SQL)`) and `hl` (the column stressed when a list does not say).
A column name the reference site repeats in one table is addressed as `Name#2`. The reference site columns the data cannot fill (minutes, ages, debut dates, captains) are not in `cols` and are left out of a list.
"""

BAT_CAREER = {
    'Player': ('player', 'n.name, c.player_id'), 'Span': ('text', 'c.span'), 'Mat': ('num', 'c.mat'), 'Inns': ('num', 'c.inns'), 'NO': ('num', 'c.nout'), 'Runs': ('num', 'c.runs'),
    'HS': ('score', "c.hs::int || case when c.hs_no then '*' else '' end"), 'Ave': ('dec2', 'c.ave'), 'BF': ('num', 'c.bf'), 'SR': ('dec2', 'c.sr'), '100': ('num', 'c.h100'), '50': ('num', 'c.h50'),
    '50+': ('num', 'c.h50 + c.h100'), '0': ('num', 'c.ducks'), '4s': ('num', 'c.fours'), '6s': ('num', 'c.sixes'), '200s': ('num', 'c.h200'), '300s': ('num', 'c.h300'), '90s': ('num', 'c.h90'),
    'Pairs': ('num', 'c.pairs'), '0/Inns': ('dec2', 'c.ducks * 1.0 / c.inns'),
}


def bat_group(a='b'):
    """Batting by series, year, ground or opposition: the same columns as a career."""
    return {
        'Player': ('player', f'n.name, {a}.player_id'), 'Span': ('text', f'{a}.span'), 'Year': ('text', f'{a}.grp'), 'Mat': ('num', f'{a}.mat'), 'Inns': ('num', f'{a}.inns'), 'NO': ('num', f'{a}.nout'),
        'Runs': ('num', f'{a}.runs::int'), 'HS': ('score', f"({a}.hsx // 2)::int || case when {a}.hsx % 2 = 1 then '*' else '' end"),
        'Ave': ('dec2', f'case when {a}.inns - {a}.nout > 0 then 1.0 * {a}.runs / ({a}.inns - {a}.nout) end'), 'BF': ('num', f'{a}.balls'),
        'SR': ('dec2', f'case when {a}.balls > 0 then 100.0 * {a}.runs / {a}.balls end'), '100': ('num', f'{a}.h100'), '50': ('num', f'{a}.h50'), '50+': ('num', f'{a}.h50 + {a}.h100'),
        '0': ('num', f'{a}.ducks'), '4s': ('num', f'{a}.fours'), '6s': ('num', f'{a}.sixes'), '200s': ('num', f'{a}.h200'), 'Opposition': ('text', f"'v ' || {a}.grp"),
    }


BAT_INN = {
    'Player': ('player', 'n.name, b.player_id'), 'Batter': ('player', 'n.name, b.player_id'), 'Runs': ('score', 'b.runs_s'), 'Runs scored in an inns': ('score', 'b.runs_s'), 'HS': ('score', 'b.runs_s'),
    'Score': ('score', 'b.runs_s'), 'Balls': ('num', 'b.balls'), 'Balls faced': ('num', 'b.balls'), 'BF': ('num', 'b.balls'), '4s': ('num', 'b.fours'), '6s': ('num', 'b.sixes'),
    'SR': ('dec2', 'case when b.balls > 0 then 100.0 * b.runs / b.balls end'), 'Team': ('team', 'b.team, b.team_id'), 'Opposition': ('team', 'b.opponent, b.opp_id'), 'Ground': ('text', 'b.venue'),
    'Match Date': ('date', 'b.start_date'), 'Date': ('date', 'b.start_date'), 'Scorecard': ('match', "b.match_id, 'Scorecard'"), 'Match': ('matchname', 'b.match_id, b.mtext'), 'Location': ('text', 'b.city'),
    'Venue': ('text', 'b.venue'), 'Season': ('text', 'b.season'), 'Year': ('text', 'b.yr::varchar'), 'Innings in match': ('num', 'b.innings'), 'Inns': ('num', 'b.innings'),
    '4+6': ('num', '4 * b.fours + 6 * b.sixes'), 'Total': ('num', 'b.team_runs'), '%': ('dec2', 'b.share'),
}
BAT_MATCH = {
    'Player': ('player', 'n.name, b.player_id'), 'Runs': ('num', 'b.runs::int'), '1st': ('text', 'b.i1'), '2nd': ('text', 'b.i2'), 'Innings in match': ('num', 'b.inns'), 'Team': ('team', 'b.team, b.team_id'),
    'Opposition': ('team', 'b.opponent, b.opp_id'), 'Ground': ('text', 'b.venue'), 'Match Date': ('date', 'b.start_date'), 'Scorecard': ('match', "b.match_id, 'Scorecard'"), 'Balls': ('num', 'b.balls'),
    '4s': ('num', 'b.fours'), '6s': ('num', 'b.sixes'), 'Match': ('matchname', 'b.match_id, b.mtext'), 'Venue': ('text', 'b.venue'), 'Season': ('text', 'b.season'), 'Location': ('text', 'b.city'), 'Mat': ('num', 'b.inns'),
}
STREAK = {
    'Player': ('player', 'n.name, b.player_id'), '100s': ('num', 'b.n'), '50s': ('num', 'b.n'), 'Ducks': ('num', 'b.n'), 'Runs': ('num', 'b.runs::int'), 'Inns': ('num', 'b.n'), 'Team': ('team', 'b.team, b.team_id'),
    'Opposition': ('team', 'b.opponent, b.opp_id'), 'Ground': ('text', 'b.venue'), 'Match Date': ('date', 'b.d_last'), 'Scorecard': ('match', "b.match_id, 'Scorecard'"), 'From': ('date', 'b.d1'), 'Until': ('date', 'b.d2'),
    'Until:': ('date', 'b.d2'),
}

BOWL_INN = {
    'Player': ('player', 'n.name, w.player_id'), 'Bowler': ('player', 'n.name, w.player_id'), 'Overs': ('overs', 'w.balls'), 'Mdns': ('num', 'w.maidens'), 'Runs': ('num', 'w.runs::int'), 'Wkts': ('num', 'w.wickets'),
    'Econ': ('dec2', 'case when w.balls > 0 then 6.0 * w.runs / w.balls end'), 'SR': ('dec2', 'case when w.wickets > 0 then 1.0 * w.balls / w.wickets end'), 'Team': ('team', 'w.team, w.team_id'),
    'Opposition': ('team', 'w.opponent, w.opp_id'), 'Ground': ('text', 'w.venue'), 'Match Date': ('date', 'w.start_date'), 'Scorecard': ('match', "w.match_id, 'Scorecard'"), 'Inns': ('num', 'w.innings'),
    'Result': ('text', 'w.result'), 'Balls': ('num', 'w.balls'), 'Balls bowled in an inns': ('num', 'w.balls'), 'Match': ('matchname', 'w.match_id, w.mtext'), 'Venue': ('text', 'w.venue'), 'Season': ('text', 'w.season'),
    'Location': ('text', 'w.city'), 'Year': ('text', 'w.yr::varchar'), 'Date': ('date', 'w.start_date'),
}
BOWL_MATCH = {
    'Player': ('player', 'n.name, w.player_id'), 'Overs': ('overs', 'w.balls'), 'Mdns': ('num', 'w.maidens'), 'Runs': ('num', 'w.runs::int'), 'Wkts': ('num', 'w.wickets'),
    'Econ': ('dec2', 'case when w.balls > 0 then 6.0 * w.runs / w.balls end'), 'Team': ('team', 'w.team, w.team_id'), 'Opposition': ('team', 'w.opponent, w.opp_id'), 'Ground': ('text', 'w.venue'),
    'Match Date': ('date', 'w.start_date'), 'Scorecard': ('match', "w.match_id, 'Scorecard'"), 'Balls': ('num', 'w.balls'),
}
BOWL_CAREER = {
    'Player': ('player', 'n.name, c.player_id'), 'Span': ('text', 'c.span'), 'Mat': ('num', 'c.mat'), 'Inns': ('num', 'c.inns'), 'Balls': ('num', 'c.balls'), 'Overs': ('overs', 'c.balls'), 'Mdns': ('num', 'c.maidens'),
    'Runs': ('num', 'c.runs'), 'Wkts': ('num', 'c.wkts'), 'BBI': ('text', "c.bb_w || '/' || c.bb_r"), 'Ave': ('dec2', 'c.ave'), 'Econ': ('dec2', 'c.econ'), 'SR': ('dec2', 'c.sr'), '4': ('num', 'c.h4'),
    '5': ('num', 'c.h5'), '10': ('num', 'c.h10'), '4+': ('num', 'c.h4 + c.h5'),
}


def bowl_group(a='w'):
    return {
        'Player': ('player', f'n.name, {a}.player_id'), 'Span': ('text', f'{a}.span'), 'Year': ('text', f'{a}.grp'), 'Mat': ('num', f'{a}.mat'), 'Inns': ('num', f'{a}.inns'), 'Balls': ('num', f'{a}.balls'),
        'Overs': ('overs', f'{a}.balls'), 'Mdns': ('num', f'{a}.maidens'), 'Runs': ('num', f'{a}.runs::int'), 'Wkts': ('num', f'{a}.wickets'), 'BBI': ('text', f"{a}.bb.w || '/' || (-{a}.bb.r)::int"),
        'Ave': ('dec2', f'case when {a}.wickets > 0 then 1.0 * {a}.runs / {a}.wickets end'), 'Econ': ('dec2', f'case when {a}.balls > 0 then 6.0 * {a}.runs / {a}.balls end'),
        'SR': ('dec2', f'case when {a}.wickets > 0 then 1.0 * {a}.balls / {a}.wickets end'), '4': ('num', f'{a}.h4'), '5': ('num', f'{a}.h5'), '10': ('num', f'{a}.h10'), 'Opposition': ('text', f"'v ' || {a}.grp"),
    }


BOWL_WAY = {
    'Player': ('player', 'n.name, w.player_id'), 'Span': ('text', 'c.span'), 'Mat': ('num', 'c.mat'), 'Balls': ('num', 'c.balls'), 'Runs': ('num', 'c.runs'), 'Wkts': ('num', 'c.wkts'),
    'BBI': ('text', "c.bb_w || '/' || c.bb_r"), 'Ave': ('dec2', 'c.ave'), '5': ('num', 'c.h5'), 'WAY': ('num', 'w.wickets'), '% Wkts': ('dec2', '100.0 * w.wickets / c.wkts'),
}

FIELD = {
    'Player': ('player', 'n.name, c.player_id'), 'Span': ('text', 'c.span'), 'Year': ('text', 'c.yr'), 'Mat': ('num', 'c.mat'), 'Inns': ('num', 'c.inns'), 'Ct': ('num', 'c.ct'), 'Dismissed': ('num', 'c.n'),
    'Max': ('num', 'c.mx'), 'Ct/Inn': ('dec2', 'c.per'), 'St': ('num', 'c.st'), 'RO': ('num', 'c.ro'),
}
FIELD_INN = {
    'Player': ('player', 'n.name, c.player_id'), 'Ct Fi': ('num', 'c.ct'), 'Ct': ('num', 'c.ct'), 'Inns': ('num', 'c.innings'), 'Team': ('team', 'c.team, c.team_id'), 'Opposition': ('team', 'c.opponent, c.opp_id'),
    'Ground': ('text', 'c.venue'), 'Match Date': ('date', 'c.d'), 'Scorecard': ('match', "c.match_id, 'Scorecard'"),
}
FIELD_MATCH = {k: v for k, v in FIELD_INN.items() if k != 'Inns'}

TEAM_INN = {
    'Team': ('team', 'i.team, i.team_id'), 'Score': ('text', "i.runs || '/' || i.wickets || case when i.declared then 'd' else '' end"), 'Overs': ('overs', 'i.balls'), 'Balls': ('num', 'i.balls'),
    'RR': ('dec2', 'case when i.balls > 0 then 6.0 * i.runs / i.balls end'), 'Inns': ('num', 'i.innings'), 'Result': ('text', 'i.res'), 'Opposition': ('team', 'i.opponent, i.opp_id'), 'Ground': ('text', 'i.venue'),
    'Match Date': ('date', 'i.start_date'), 'Scorecard': ('match', "i.match_id, 'Scorecard'"), 'Ext': ('num', 'i.extras'), 'b': ('num', 'i.byes'), 'lb': ('num', 'i.legbyes'), 'w': ('num', 'i.wides'),
    'nb': ('num', 'i.noballs'), '4s': ('num', 'i.fours'), '6s': ('num', 'i.sixes'), 'Runs': ('num', '4 * i.fours + 6 * i.sixes'), '100s': ('num', 'i.h100'), 'Ducks': ('num', 'i.ducks'), 'Target': ('num', 'i.target'),
    'Rem': ('num', 'i.rem'), 'Wkts': ('num', 'i.wickets'), 'Num': ('num', 'i.runs'), 'Tot': ('num', 'i.runs'), 'Season': ('text', 'i.season'), 'Venue': ('text', 'i.venue'),
}
TEAM_MATCH = {
    'Team 1': ('team', 'm.t1, m.t1_id'), 'Team 2': ('team', 'm.t2, m.t2_id'), 'Team': ('team', 'm.t1, m.t1_id'), 'Opposition': ('team', 'm.t2, m.t2_id'), 'Winner': ('team', 'coalesce(m.wname, m.outcome), m.winner_id'),
    'Margin': ('text', 'm.mg'), 'Target': ('num', 'm.tgt'), 'Overs': ('overs', 'm.tgt_balls'), 'Team runs': ('num', 'm.agg'), 'Team wickets': ('num', 'm.wk'), 'RR': ('dec2', 'case when m.ob > 0 then 6.0 * m.agg / m.ob end'),
    'Extras': ('num', 'm.ex'), 'b': ('num', 'm.by'), 'lb': ('num', 'm.lb'), 'w': ('num', 'm.wd'), 'nb': ('num', 'm.nb'), '4s': ('num', 'm.f4'), '6s': ('num', 'm.s6'), 'Runs': ('num', '4 * m.f4 + 6 * m.s6'),
    '100s': ('num', 'm.h100'), 'Ducks': ('num', 'm.dk'), 'Days': ('num', 'm.days'), 'Balls': ('num', 'm.ob'), 'Ground': ('text', 'm.venue'), 'Match Date': ('date', 'm.start_date'),
    'Scorecard': ('match', "m.match_id, 'Scorecard'"), 'Result': ('text', 'm.res'), 'Wkts': ('num', 'm.winner_wkts_lost'), 'Num': ('num', 'm.agg'),
}
TEAM_AGG = {
    'Team': ('team', 'c.team, c.team_id'), 'Opposition': ('team', 'c.opponent, c.opp_id'), 'Span': ('text', 'c.span'), 'Mat': ('num', 'c.mat'), 'Won': ('num', 'c.won'), 'Lost': ('num', 'c.lost'), 'Draw': ('num', 'c.draw'),
    'Tied': ('num', 'c.tied'), 'Tie+W': ('num', 'c.tie_w'), 'Tie+L': ('num', 'c.tie_l'), 'NR': ('num', 'c.nr'), 'W/L': ('dec2', 'c.won * 1.0 / nullif(c.lost, 0)'), '%W': ('dec2', '100.0 * c.won / c.mat'),
    '%L': ('dec2', '100.0 * c.lost / c.mat'), '%D': ('dec2', '100.0 * c.draw / c.mat'), '%': ('dec2', '100.0 * (c.won + 0.5 * (c.tied + c.draw)) / c.mat'),
}
TEAM_STREAK = {
    'Team': ('team', 'c.team, c.team_id'), 'Mat': ('num', 'c.n'), 'Margin': ('text', 'x.mg'), 'Result': ('text', "case when x.winner_id = c.team_id then 'won' when x.winner_id is not null then 'lost' else coalesce(x.outcome, 'no result') end"),
    'Opposition': ('team', 'o.opponent, o.opp_id'), 'Ground': ('text', 'x.venue'), 'Match Date': ('date', 'x.start_date'), 'Scorecard': ('match', "x.match_id, 'Scorecard'"),
}
GROUND = {'Ground': ('text', 'c.venue'), 'Span': ('text', 'c.span'), 'Mat': ('num', 'c.n')}

PAIR_INN = {
    'Partners': ('players', 'p.n1, p.id1, p.n2, p.id2'), 'Runs': ('text', "p.runs::int || case when p.ended then '' else '*' end"), 'Wickets': ('num', 'p.wkt'), 'Wkt': ('num', 'p.wkt'), 'Inns': ('num', 'p.innings'),
    'Team': ('team', 'p.team, p.team_id'), 'Opposition': ('team', 'p.opponent, p.opp_id'), 'Ground': ('text', 'p.venue'), 'Match Date': ('date', 'p.start_date'), 'Scorecard': ('match', "p.match_id, 'Scorecard'"),
    'Balls': ('num', 'p.balls'),
}
PAIR_AGG = {
    'Partners': ('players', 'p.n1, p.id1, p.n2, p.id2'), 'Span': ('text', 'p.span'), 'Inns': ('num', 'p.inns'), 'NO': ('num', 'p.nobr'), 'Runs': ('num', 'p.runs::int'), 'Runs#2': ('num', 'p.hi::int'),
    'Ave': ('dec2', 'p.ave'), '100': ('num', 'p.h100'), '50': ('num', 'p.h50'),
}

PCAR = {
    'Player': ('player', 'n.name, c.player_id'), 'Span': ('text', 'c.span'), 'Mat': ('num', 'c.mat'), 'Inns': ('num', 'c.inns_b'), 'Runs': ('num', 'c.runs'),
    'HS': ('score', "c.hs::int || case when c.hs_no then '*' else '' end"), 'Ave': ('dec2', 'c.ave'), '100': ('num', 'c.h100'), 'Wkts': ('num', 'coalesce(c.wkts, 0)'), 'BBI': ('text', "c.bb_w || '/' || c.bb_r"),
    'Ave#2': ('dec2', 'c.wave'), '5': ('num', 'c.h5'), 'Ct': ('num', 'c.ct'), 'St': ('num', 'c.st'), 'Dismissed': ('num', 'c.dis'),
}
ARM = {
    'Player': ('player', 'n.name, c.player_id'), 'Runs': ('num', 'c.runs::int'), 'Wkts': ('num', 'c.wkts'), 'Bat1': ('text', 'c.i1'), 'Bat2': ('text', 'c.i2'), 'Bowl1': ('text', 'c.f1'), 'Bowl2': ('text', 'c.f2'),
    'Bat': ('text', 'c.best_bat'), 'Bowl': ('text', 'c.best_bowl'), 'Team': ('team', 'c.team, c.team_id'), 'Opposition': ('team', 'c.opponent, c.opp_id'), 'Ground': ('text', 'c.venue'),
    'Match Date': ('date', 'c.start_date'), 'Scorecard': ('match', "c.match_id, 'Scorecard'"),
}
OVR = {
    'Runs': ('num', 'o.runs'), 'Player': ('player', 'n.name, o.striker_id'), 'Batter': ('player', 'n.name, o.striker_id'), 'Players': ('player', 'n.name, o.striker_id'), 'Bowler': ('player', 'n2.name, o.bowler_id'),
    'Match': ('matchname', 'o.match_id, o.mtext'), 'Location': ('text', 'o.city'), 'Venue': ('text', 'o.venue'), 'Season': ('text', 'o.season'), 'Date': ('date', 'o.start_date'),
}
SEQ = {
    'Sixes': ('num', 'o.n'), 'Fours': ('num', 'o.n'), 'Number': ('num', 'o.n'), 'Batter': ('player', 'n.name, o.striker_id'), 'Players': ('player', 'n.name, o.striker_id'), 'Bowler': ('player', 'n2.name, o.bowler_id'),
    'Match': ('matchname', 'o.match_id, o.mtext'), 'Venue': ('text', 'o.venue'), 'Location': ('text', 'o.city'), 'Season': ('text', 'o.season'), 'Date': ('date', 'o.start_date'),
}
FAST = {
    'Balls': ('num', 'f.balls'), 'Balls faced': ('num', 'f.balls'), 'Player': ('player', 'n.name, f.player_id'), 'Match': ('matchname', 'f.match_id, f.mtext'), 'Location': ('text', 'f.city'), 'Year': ('text', 'f.yr::varchar'),
    'Season': ('text', 'f.season'),
}
UNUSUAL = {
    'Player': ('player', 'n.name, u.player_id'), 'Dismissal': ('text', 'u.way'), 'Runs scored in an inns': ('score', 'u.runs_s'), 'Runs': ('score', 'u.runs_s'), 'Team': ('team', 'u.team, u.team_id'),
    'Opposition': ('team', 'u.opponent, u.opp_id'), 'Ground': ('text', 'u.venue'), 'Match Date': ('date', 'u.start_date'), 'Scorecard': ('match', "u.match_id, 'Scorecard'"),
}
KING = {'Batter': ('player', 'n.name, k.player_id'), 'Match': ('matchname', 'k.match_id, k.mtext'), 'Venue': ('text', 'k.venue'), 'Year': ('text', 'k.yr::varchar')}
MSTREAK = {
    'Player': ('player', 'n.name, s.player_id'), 'Mat': ('num', 's.n'), '1st': ('text', 's.i1'), '2nd': ('text', 's.i2'), 'Team': ('team', 's.team, s.team_id'), 'Opposition': ('team', 's.opponent, s.opp_id'),
    'Ground': ('text', 's.venue'), 'Match Date': ('date', 's.d_last'), 'Scorecard': ('match', "s.match_id, 'Scorecard'"),
}
WSTREAK = {
    'Player': ('player', 'n.name, s.player_id'), '5wi': ('num', 's.n'), '4wi': ('num', 's.n'), 'Bowl': ('text', 's.fig'), 'Inns': ('num', 's.innings'), 'Team': ('team', 's.team, s.team_id'),
    'Opposition': ('team', 's.opponent, s.opp_id'), 'Ground': ('text', 's.venue'), 'Match Date': ('date', 's.d_last'), 'Scorecard': ('match', "s.match_id, 'Scorecard'"),
}
BBC = {
    'Bowler': ('player', 'n.name, c.bowler_id'), 'Batter': ('player', 'n2.name, c.striker_id'), 'Span': ('text', 'c.span'), 'Mat': ('num', 'c.mat'), 'Wkts': ('num', 'c.wkts'), 'Ave': ('dec2', 'c.ave'),
    'Ducks': ('num', 'c.ducks'),
}
SERIES = {
    'Team': ('team', 'c.team, c.team_id'), 'Opposition': ('text', "'v ' || c.opponent"), 'Mat': ('num', 'c.n'), 'Won': ('num', 'c.won'), 'Lost': ('num', 'c.lost'), 'Draw': ('num', 'c.drawn'),
    'Tied': ('num', '0'), 'NR': ('num', '0'), 'Players': ('num', 'c.players'), 'Results': ('text', 'c.results'), 'Series': ('text', 'c.series'), '100s': ('num', 'c.h100'),
}
SERIES_LIST = {'Series/Tournament': ('text', 'c.series'), 'Season': ('text', 'c.season'), 'Winner': ('text', 'c.winner'), 'Margin': ('text', 'c.margin')}
SERIES_STREAK = {
    'Team': ('team', 'c.team, c.team_id'), 'Series': ('num', 'c.n'), 'Series#2': ('text', 'c.period'), 'Mat': ('num', 'c.mat'),
    'Won': ('num', 'c.won'), 'Lost': ('num', 'c.lost'),
}
PEOPLE = {
    'Player': ('player', 'n.name, c.player_id'), 'Span': ('text', 'c.span'), 'Mat': ('num', 'c.n'), 'Awards': ('num', 'c.n'), 'Matches': ('num', 'c.n'), 'Umpire': ('text', 'c.name'),
}

TEAM_MATCH.update({
    'Balls Rem': ('num', 'm.balls_rem'), 'Max': ('overs', 'm.sched_balls'), 'Pairs': ('num', 'm.pairs'), 'Tot': ('num', 'm.twk'),
})
TEAM_INN.update({
    'Tot': ('num', 'i.twk'), 'Diff': ('num', 'i.rem'),
})
T400 = {'Team': ('team', 'c.team, c.team_id'), '400s': ('num', 'c.n'), 'Score': ('text', 'c.score'), 'Inns': ('num', 'c.innings'), 'Opposition': ('team', 'c.opponent, c.opp_id'), 'Ground': ('text', 'c.venue'),
        'Match Date': ('date', 'c.d_last'), 'Scorecard': ('match', "c.match_id, 'Scorecard'")}
T12 = {'Team': ('team', 'c.team, c.team_id'), 'Score': ('text', 'c.s1'), 'Score#2': ('text', 'c.s2'), 'Diff': ('num', 'c.diff'), 'Opposition': ('team', 'c.opponent, c.opp_id'), 'Ground': ('text', 'c.venue'),
       'Match Date': ('date', 'c.start_date'), 'Scorecard': ('match', "c.match_id, 'Scorecard'")}

ARSX = {
    'Player': ('player', 'n.name, c.player_id'), 'Span': ('text', 'c.span'), 'Mat': ('num', 'c.mat'), 'Inns': ('num', 'c.inns'), 'Runs': ('num', 'c.runs'), 'HS': ('score', "(c.hsx // 2)::int || case when c.hsx % 2 = 1 then '*' else '' end"),
    'Ave': ('dec2', 'case when c.inns - c.nout > 0 then 1.0 * c.runs / (c.inns - c.nout) end'), '100': ('num', 'c.h100'), 'Wkts': ('num', 'c.wkts'), 'BBI': ('text', "c.bb.w || '/' || (-c.bb.r)::int"),
    'Ave#2': ('dec2', 'case when c.wkts > 0 then 1.0 * c.wruns / c.wkts end'), '5': ('num', 'c.h5'), 'Ct': ('num', 'c.ct'), 'St': ('num', 'c.st'),
}
PTM = {
    'Partners': ('players', 'p.n1, p.id1, p.n2, p.id2'), 'Runs': ('num', 'p.runs'), '1st': ('num', 'p.r1'), '2nd': ('num', 'p.r2'), 'Team': ('team', 'p.team, p.team_id'), 'Opposition': ('team', 'p.opponent, p.opp_id'),
    'Ground': ('text', 'p.venue'), 'Match Date': ('date', 'p.start_date'), 'Scorecard': ('match', "p.match_id, 'Scorecard'"),
}
POTM = {'Player': ('player', 'n.name, c.player_id'), 'Span': ('text', 'c.span'), 'Mat': ('num', 'c.mat'), 'Awards': ('num', 'c.n')}
OFFICIAL = {'Umpire': ('text', 'c.name'), 'Umpire#2': ('num', 'c.n'), 'Player': ('text', 'c.name'), 'Span': ('text', 'c.span'), 'Matches': ('num', 'c.n')}
TEAM_INN['Ave'] = ('dec2', 'i.runs * 1.0 / nullif(i.wickets, 0)')
TEAM_STREAK_DRAW = TEAM_STREAK

WWIN = {
    'Bowler(Sequence)': ('player', 'n.name, o.bowler_id'), 'Bowler': ('player', 'n.name, o.bowler_id'), 'Match': ('matchname', 'o.match_id, o.mtext'), 'Location': ('text', 'o.city'), 'Year': ('text', 'o.yr::varchar'),
}
FW = {
    'Team': ('team', 'o.team, o.team_id'), 'Fall': ('num', 'o.score'), 'Total': ('text', 'o.total'), 'Inns': ('num', 'o.innings'), 'Wkt': ('num', 'o.wk'), 'Opposition': ('team', 'o.opponent, o.opp_id'),
    'Ground': ('text', 'o.venue'), 'Match Date': ('date', 'o.start_date'), 'Scorecard': ('match', "o.match_id, 'Scorecard'"),
}
FBD = {
    'Bowler': ('player', 'n.name, o.bowler_id'), 'Batter': ('player', 'n2.name, o.striker_id'), 'Batsman': ('player', 'n2.name, o.striker_id'), 'Player': ('player', 'n.name, o.bowler_id'),
    'Match': ('matchname', 'o.match_id, o.mtext'), 'Location': ('text', 'o.city'), 'Venue': ('text', 'o.venue'), 'City': ('text', 'o.city'), 'Season': ('text', 'o.season'), 'Date': ('date', 'o.start_date'),
}
AGE = {
    'Player': ('player', 'n.name, a.player_id'), 'Age': ('num', 'a.age'), 'Team': ('team', 'a.team, a.team_id'), 'Opposition': ('team', 'a.opponent, a.opp_id'), 'Ground': ('text', 'a.venue'),
    'Match Date': ('date', 'a.start_date'), 'Scorecard': ('match', "a.match_id, 'Scorecard'"),
}
CAREERS = {
    'Player': ('player', 'n.name, f.player_id'), 'From': ('date', 'f.d1'), 'To': ('date', 'f.d2'),
    'Span': ('text', "date_sub('year', f.d1, f.d2) || 'y ' || date_diff('day', f.d1 + to_years(date_sub('year', f.d1, f.d2)), f.d2) || 'd'"), 'Mat': ('num', 'f.mat'),
}
GAPS = {
    'Player': ('player', 'n.name, g.player_id'), 'Span': ('text', 'g.span'), 'Mat': ('num', 'g.mat'), 'Team': ('team', 'g.team, g.team_id'), 'From': ('date', 'g.d1'), 'To': ('date', 'g.d2'),
    'Missed Span': ('text', "(g.days // 365) || 'y ' || (g.days % 365) || 'd'"), 'Missed': ('num', 'g.missed'),
}
PSTR = {'Player': ('player', 'n.name, g.player_id'), 'Team': ('team', 'g.team, g.team_id'), 'Mat': ('num', 'g.n'), 'From': ('date', 'g.d1'), 'Until': ('date', 'g.d2')}
PTEAM = {
    'Player': ('player', 'n.name, c.player_id'), 'Team': ('team', 'c.team, c.team_id'), 'Span': ('text', 'c.span'), 'Mat': ('num', 'c.mat'), 'Runs': ('num', 'c.runs'),
    'HS': ('score', "(c.hsx // 2)::int || case when c.hsx % 2 = 1 then '*' else '' end"), 'Ave': ('dec2', 'case when c.inns - c.nout > 0 then 1.0 * c.runs / (c.inns - c.nout) end'), '100': ('num', 'c.h100'),
    'Wkts': ('num', 'c.wkts'), 'BBI': ('text', "c.bb.w || '/' || (-c.bb.r)::int"), 'Ave#2': ('dec2', 'case when c.wkts > 0 then 1.0 * c.wruns / c.wkts end'), '5': ('num', 'c.h5'), 'Ct': ('num', 'c.ct'), 'St': ('num', 'c.st'),
}
BAT_INN_AGE = dict(BAT_INN, Age=('num', 'b.age'))
BOWL_INN_AGE = dict(BOWL_INN, Age=('num', 'w.age'), Bowl=('text', "w.wickets || '/' || w.runs::int"))
BOWL_MATCH_AGE = dict(BOWL_MATCH, Age=('num', 'a.age'), Bowl=('text', "w.wickets || '/' || w.runs::int"))
BOWL_INN['Bowl'] = ('text', "w.wickets || '/' || w.runs::int")

FASTEST = {
    'Player': ('player', 'n.name, c.player_id'), 'Opposition': ('team', 'c.opponent, c.opp_id'), 'Ground': ('text', 'c.venue'), 'Match Date': ('date', 'c.start_date'), 'Debut': ('date', 'c.d1'),
    'Time': ('text', "date_sub('year', c.d1, c.start_date) || 'y ' || date_diff('day', c.d1 + to_years(date_sub('year', c.d1, c.start_date)), c.start_date) || 'd'"), 'Mat': ('num', 'c.mat_n'), 'Inns': ('num', 'c.inn_n'), 'Scorecard': ('match', "c.match_id, 'Scorecard'"),
}

HAT = {
    'Player': ('player', 'n.name, o.bowler_id'), 'Match': ('matchname', 'o.match_id, o.mtext'), 'Venue': ('text', 'o.venue'), 'Date': ('date', 'o.start_date'), 'Year': ('text', 'o.yr::varchar'),
    'Season': ('text', 'o.season'), 'Victims': ('text', 'o.victims'),
}
BUC = {
    'Bowler': ('player', 'n.name, o.id1'), 'Bowl': ('text', 'o.f1'), 'Bowler#2': ('player', 'n2.name, o.id2'), 'Bowl#2': ('text', 'o.f2'), 'Inns': ('num', 'o.innings'), 'Team': ('team', 'o.team, o.team_id'),
    'Opposition': ('team', 'o.opponent, o.opp_id'), 'Ground': ('text', 'o.venue'), 'Match Date': ('date', 'o.start_date'), 'Scorecard': ('match', "o.match_id, 'Scorecard'"),
}
WMSTREAK = {
    'Player': ('player', 'n.name, s.player_id'), '10wm': ('num', 's.n'), 'Bowl': ('text', 's.fig'), 'Team': ('team', 's.team, s.team_id'), 'Opposition': ('team', 's.opponent, s.opp_id'), 'Ground': ('text', 's.venue'),
    'Match Date': ('date', 's.d_last'), 'Scorecard': ('match', "s.match_id, 'Scorecard'"),
}
TEAM_MATCH.update({'Score': ('text', 'm.wscore'), 'Score#2': ('text', 'm.oscore')})

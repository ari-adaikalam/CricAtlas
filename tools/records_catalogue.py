"""The record lists: for each, where its rows come from, how they are ordered, and which the reference site columns it shows.

A list's columns are the reference site columns of the list of the same name (tools/cricinfo_columns.json, one set per format), looked up in the source's `cols` (records_sources.py). A the reference site column the data
cannot fill is left out. Lists the reference site does not have take the columns of the nearest list (`ci`).
"""
import json
import re
from pathlib import Path

import records_sources as S

HERE = Path(__file__).resolve().parent
CI = json.loads((HERE / 'cricinfo_columns.json').read_text())

PN = ' join pn n using (player_id)'
SRC = {
    'bc': dict(frm='bc c' + PN, cols=S.BAT_CAREER, hl='Runs'),
    'bi': dict(frm='bi b' + PN, cols=S.BAT_INN, hl='Runs'),
    'bm': dict(frm='bm b' + PN, cols=S.BAT_MATCH, hl='Runs'),
    'bs': dict(frm='bs b' + PN, cols=S.bat_group('b'), hl='Runs', sub="b.teams || ', ' || b.grp"),
    'byr': dict(frm='byr b' + PN, cols=S.bat_group('b'), hl='Runs', sub='b.teams'),
    'bg': dict(frm='bg b' + PN, cols=S.bat_group('b'), hl='Runs', sub="b.teams || ', at ' || b.grp"),
    'bo': dict(frm='bo_ b' + PN, cols=S.bat_group('b'), hl='Runs', sub='b.teams'),
    'streak': dict(frm='streaks b' + PN, cols=S.STREAK, hl='Inns'),
    'wc': dict(frm='wc c' + PN, cols=S.BOWL_CAREER, hl='Wkts'),
    'bw': dict(frm='bw w' + PN, cols=S.BOWL_INN, hl='Wkts'),
    'wm': dict(frm='wm w' + PN, cols=S.BOWL_MATCH, hl='Wkts'),
    'ws': dict(frm='ws w' + PN, cols=S.bowl_group('w'), hl='Wkts', sub="w.teams || ', ' || w.grp"),
    'wy': dict(frm='wy w' + PN, cols=S.bowl_group('w'), hl='Wkts', sub='w.teams'),
    'wg': dict(frm='wg w' + PN, cols=S.bowl_group('w'), hl='Wkts', sub="w.teams || ', at ' || w.grp"),
    'wo': dict(frm='wo w' + PN, cols=S.bowl_group('w'), hl='Wkts', sub="w.teams || ', against ' || w.grp"),
    'wt': dict(frm='wt w' + PN + ' join wc c using (player_id)', cols=S.BOWL_WAY, hl='WAY'),
    'fc': dict(frm="fc c" + PN + " where c.k = 'all'", cols=S.FIELD, hl='Ct'),
    'fcs': dict(frm='fcs c' + PN, cols=S.FIELD, hl='Ct', sub="c.ser"),
    'fcy': dict(frm='fcy c' + PN, cols=S.FIELD, hl='Ct', sub='c.yr'),
    'fgi': dict(frm='fgi c' + PN, cols=S.FIELD_INN, hl='Ct Fi'),
    'fgm': dict(frm='fgm c' + PN, cols=S.FIELD_MATCH, hl='Ct Fi'),
    'subc': dict(frm='subc c' + PN, cols=S.FIELD_INN, hl='Ct'),
    'subm': dict(frm='subm c' + PN, cols=S.FIELD_MATCH, hl='Ct'),
    'ti': dict(frm='ti i', cols=S.TEAM_INN, hl='Score'),
    'tm': dict(frm='tm m', cols=S.TEAM_MATCH, hl=None),
    'tr': dict(frm='tr c', cols=S.TEAM_AGG, hl='%W'),
    'tro': dict(frm='tro c', cols=S.TEAM_AGG, hl='%W'),
    'ts': dict(frm='ts c join mt_s o on o.match_id = c.lm and o.team_id = c.team_id join tm x on x.match_id = c.lm', cols=S.TEAM_STREAK, hl='Mat'),
    'tg': dict(frm='tg c', cols=S.GROUND, hl='Mat'),
    'pt': dict(frm='pt p', cols=S.PAIR_INN, hl='Runs'),
    'pa': dict(frm='pa p', cols=S.PAIR_AGG, hl='Runs'),
    'pao': dict(frm='pao p', cols=S.PAIR_AGG, hl='Runs'),
    'ptm': dict(frm='ptm p', cols=S.PTM, hl='Runs'),
    'pcar': dict(frm='pcar c' + PN, cols=S.PCAR, hl='Runs'),
    'arsx': dict(frm='arsx c' + PN, cols=S.ARSX, hl='Runs', sub='c.teams || \', \' || c.grp'),
    'arm': dict(frm='arm c' + PN, cols=S.ARM, hl='Runs'),
    'ovr': dict(frm='ovr o join pn n on n.player_id = o.striker_id join pn n2 on n2.player_id = o.bowler_id', cols=S.OVR, hl='Runs', sub='o.balls'),
    'sx6': dict(frm='sx6 o join pn n on n.player_id = o.striker_id join pn n2 on n2.player_id = o.bowler_id', cols=S.SEQ, hl='Sixes'),
    'sx4': dict(frm='sx4 o join pn n on n.player_id = o.striker_id join pn n2 on n2.player_id = o.bowler_id', cols=S.SEQ, hl='Fours'),
    'fst2': dict(frm='fst2 f' + PN, cols=S.FAST, hl='Balls'),
    'fst3': dict(frm='fst3 f' + PN, cols=S.FAST, hl='Balls faced'),
    'ud': dict(frm='ud u' + PN, cols=S.UNUSUAL, hl='Runs scored in an inns'),
    'kp': dict(frm='kp k' + PN, cols=S.KING, hl=None),
    'ms': dict(frm='ms s' + PN, cols=S.MSTREAK, hl='Mat'),
    'wst': dict(frm='wst s' + PN, cols=S.WSTREAK, hl='5wi'),
    'bbc': dict(frm='bbc c join pn n on n.player_id = c.bowler_id join pn n2 on n2.player_id = c.striker_id', cols=S.BBC, hl='Wkts'),
    'ser': dict(frm='ser c', cols=S.SERIES, hl='Mat', sub='c.series', sub_unless='Series'),
    'sr': dict(frm='sr c', cols=S.SERIES_LIST, hl='Margin'),
    'sst': dict(frm='sst c', cols=S.SERIES_STREAK, hl='Series'),
    't4': dict(frm='t4 c', cols=S.T400, hl='400s'),
    't12': dict(frm='t12 c', cols=S.T12, hl='Diff'),
    'po': dict(frm='po c' + PN, cols=S.POTM, hl='Awards'),
    'um': dict(frm='um c', cols=S.OFFICIAL, hl=None),
    'ww45': dict(frm='ww45 o' + ' join pn n on n.player_id = o.bowler_id', cols=S.WWIN, hl=None),
    'ww34': dict(frm='ww34 o join pn n on n.player_id = o.bowler_id', cols=S.WWIN, hl=None),
    'ww44': dict(frm='ww44 o join pn n on n.player_id = o.bowler_id', cols=S.WWIN, hl=None),
    'fwh': dict(frm='fwh o', cols=S.FW, hl='Fall'),
    'fwl': dict(frm='fwl o', cols=S.FW, hl='Fall'),
    'fbd': dict(frm='fbd o join pn n on n.player_id = o.bowler_id join pn n2 on n2.player_id = o.striker_id', cols=S.FBD, hl=None),
    'bmd': dict(frm='bm b join dbm d on d.player_id = b.player_id and d.match_id = b.match_id join pn n on n.player_id = b.player_id', cols=S.BAT_MATCH, hl='Runs'),
    'bid': dict(frm='bi b join dbm d on d.player_id = b.player_id and d.match_id = b.match_id join pn n on n.player_id = b.player_id', cols=S.BAT_INN, hl='Runs'),
    'bwd': dict(frm='bw w join dbm d on d.player_id = w.player_id and d.match_id = w.match_id join pn n on n.player_id = w.player_id', cols=S.BOWL_INN, hl='Wkts'),
    'wmd': dict(frm='wm w join dbm d on d.player_id = w.player_id and d.match_id = w.match_id join pn n on n.player_id = w.player_id', cols=S.BOWL_MATCH, hl='Wkts'),
    'msd': dict(frm='ms s join dbm d on d.player_id = s.player_id' + ' join pn n on n.player_id = s.player_id', cols=S.MSTREAK, hl='Mat'),
    'ptd': dict(frm='pt p join dbm d1 on d1.player_id = p.id1 and d1.match_id = p.match_id join dbm d2 on d2.player_id = p.id2 and d2.match_id = p.match_id', cols=S.PAIR_INN, hl='Runs'),
    'bia': dict(frm='bi b' + PN, cols=S.BAT_INN_AGE, hl='Age'),
    'bwa': dict(frm='bw w' + PN, cols=S.BOWL_INN_AGE, hl='Age'),
    'wma': dict(frm='wm w join pag a on a.player_id = w.player_id and a.match_id = w.match_id join pn n on n.player_id = w.player_id', cols=S.BOWL_MATCH_AGE, hl='Age'),
    'agd': dict(frm='ppa a join dbm d on d.player_id = a.player_id and d.match_id = a.match_id' + ' join pn n on n.player_id = a.player_id', cols=S.AGE, hl='Age'),
    'ago': dict(frm='poldest a join pn n on n.player_id = a.player_id', cols=S.AGE, hl='Age'),
    'car': dict(frm='pfirst f join dbm d on d.player_id = f.player_id join pn n on n.player_id = f.player_id', cols=S.CAREERS, hl='Span'),
    'gap': dict(frm='pgap2 g join pn n on n.player_id = g.player_id', cols=dict(S.GAPS, **{'Missed Span': ('text', "(g.days // 365) || 'y ' || (g.days % 365) || 'd'")}), hl='Missed Span'),
    'gapt': dict(frm='pgap g join pn n on n.player_id = g.player_id', cols=S.GAPS, hl='Missed'),
    'pstr': dict(frm='pstr g join pn n on n.player_id = g.player_id', cols=S.PSTR, hl='Mat'),
    'bcum': dict(frm='bcum c join pn n on n.player_id = c.player_id', cols=S.FASTEST, hl='Inns'),
    'wcum': dict(frm='wcum c join pn n on n.player_id = c.player_id', cols=S.FASTEST, hl='Mat'),
    'hat': dict(frm='hat o join pn n on n.player_id = o.bowler_id', cols=S.HAT, hl=None),
    'buc': dict(frm='buc o join pn n on n.player_id = o.id1 join pn n2 on n2.player_id = o.id2', cols=S.BUC, hl=None),
    'wms': dict(frm='wms s' + PN, cols=S.WMSTREAK, hl='10wm'),
    'pteam': dict(frm='pteam c join pn n on n.player_id = c.player_id', cols=S.PTEAM, hl=None),
}

LISTS = []


def L(cat, title, src, where='true', order='1', ci=None, hl=None, limit=50, note=None, over=None, id=None, fmts=None, prepend=(), intl=False, names=None):
    """One record list. `ci` is the reference site title whose columns it takes (default: its own title), `hl` the column to stress, `over` columns that differ from the source's."""
    LISTS.append(dict(cat=cat, title=title, src=src, where=where, order=order, ci=ci or title, hl=hl, limit=limit, note=note, over=over or {}, prepend=prepend, intl=intl, names=names, id=id or re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-'), fmts=fmts))


def columns(item, fmt):
    """The columns of a list for a format: [(kind, label, sql)], taken from the reference site's column names, and the stressed column's index."""
    heads = CI.get(f"{item['cat']}|{item['ci']}")
    src = SRC[item['src']]
    if heads is None:
        raise KeyError(f"no the reference site columns for {item['cat']}|{item['ci']}")
    names = list(item['prepend']) + list(item['names'] or heads.get(fmt) or heads.get('t20i') or heads.get('odi') or heads.get('test'))
    cols, seen = [], {}
    for name in names:
        if not name:
            continue
        seen[name] = seen.get(name, 0) + 1
        key = name if seen[name] == 1 else f'{name}#{seen[name]}'
        spec = item['over'].get(key) or src['cols'].get(key)
        if spec is None:
            continue
        label = name if seen[name] == 1 else {'Ave': 'Ave', 'Runs': 'HS', 'Score': 'Score', 'Umpire': 'Matches', 'Series': 'Series'}.get(name, name)
        cols.append((spec[0], label, spec[1]))
    if src.get('sub') and not any(label == src.get('sub_unless') for _, label, _ in cols):
        cols.append(('sub', '', src['sub']))
    hls = item['hl'] or src['hl']
    hls = hls if isinstance(hls, tuple) else (hls,)
    idx = next((i for h in hls for i, (_, label, _) in enumerate(cols) if label == h), None)
    return cols, idx


# ---- Batting -----------------------------------------------------------------------------------------------------------------------------------------------------
B = 'batting'
L(B, 'Most runs in career', 'bc', order='c.runs desc', id='most-runs-career')
L(B, 'Highest career batting average', 'bc', where='c.inns >= {Q} and c.nout < c.inns', order='c.ave desc', note='Qualification: {Q} innings.', hl='Ave', id='highest-average-career')
L(B, 'Highest career batting average (no qualification)', 'bc', where='c.nout < c.inns', order='c.ave desc, c.runs desc', ci='Highest career batting average', hl='Ave', id='highest-average-nq')
L(B, 'Highest career strike rate', 'bc', where='c.bf >= {QB}', order='c.sr desc', note='Qualification: {QB} balls faced.', ci='Highest career batting average', hl='SR', id='highest-strike-rate-career')
L(B, 'Most hundreds in a career', 'bc', where='c.h100 > 0', order='c.h100 desc, c.runs desc', hl='100', id='most-hundreds-career')
L(B, 'Most double hundreds in a career', 'bc', where='c.h200 > 0', order='c.h200 desc, c.runs desc', hl='200s', id='most-double-hundreds-career')
L(B, 'Most triple hundreds in a career', 'bc', where='c.h300 > 0', order='c.h300 desc, c.runs desc', hl='300s', id='most-triple-hundreds-career')
L(B, 'Most nineties in career', 'bc', where='c.h90 > 0', order='c.h90 desc, c.runs desc', hl='90s', note='Scores from 90 to 99.', id='most-nineties-career')
L(B, 'Most fifties in career', 'bc', where='c.h50 > 0', order='c.h50 desc, c.runs desc', hl='50', note='Scores from 50 to 99.', id='most-fifties-career')
L(B, 'Most fifty-plus scores in a career', 'bc', where='c.h50 + c.h100 > 0', order='c.h50 + c.h100 desc, c.runs desc', ci='Most fifties in career', hl='50+', id='most-fifty-plus-career')
L(B, 'Most ducks in career', 'bc', where='c.ducks > 0', order='c.ducks desc, c.inns desc', hl='0', id='most-ducks-career')
L(B, 'Fewest ducks in career', 'bc', where='c.inns >= {QD}', order='c.ducks asc, c.inns desc', note='Qualification: {QD} innings.', hl='0', id='fewest-ducks-career')
L(B, 'No ducks in career', 'bc', where='c.inns >= {QD} and c.ducks = 0', order='c.inns desc', note='Qualification: {QD} innings.', hl='Inns', id='no-ducks-career')
L(B, 'Most pairs in career', 'bc', where='c.pairs > 0', order='c.pairs desc, c.ducks desc', note='A pair is a duck in both innings of a match.', hl='Pairs', id='most-pairs-career', fmts=('test',))
L(B, 'Most sixes in career', 'bc', where='c.sixes > 0', order='c.sixes desc, c.runs desc', hl='6s', id='most-sixes-career')
L(B, 'Most fours in career', 'bc', where='c.fours > 0', order='c.fours desc, c.runs desc', hl='4s', id='most-fours-career')
L(B, 'Most balls faced in a career', 'bc', order='c.bf desc', ci='Most runs in career', hl='BF', id='most-balls-faced-career')
L(B, 'Most innings batted', 'bc', order='c.inns desc, c.runs desc', ci='Most runs in career', hl='Inns', id='most-innings-career')
L(B, 'Most not outs in a career', 'bc', where='c.nout > 0', order='c.nout desc, c.runs desc', ci='Most runs in career', hl='NO', id='most-not-outs-career')
L(B, 'Most runs in a career without a hundred', 'bc', where='c.h100 = 0', order='c.runs desc', id='most-runs-no-hundred-career')
L(B, 'Most matches played', 'bc', order='c.mat desc, c.runs desc', ci='Most runs in career', hl='Mat', note='Matches in which the player batted.', id='most-matches-career')
L(B, 'Most runs in an innings', 'bi', order='b.runs desc, b.balls asc', id='highest-score-innings')
L(B, 'Most runs in an innings (progressive record holder)', 'bi', where='b.is_record', order='b.start_date asc', id='highest-score-innings-progressive', limit=200)
L(B, 'Most runs in an innings on the losing side', 'bi', where="b.result = 'lost'", order='b.runs desc', ci='Most runs in an innings', id='highest-score-losing')
L(B, 'Most runs in an innings chasing', 'bi', where='b.chasing', order='b.runs desc', ci='Most runs in an innings', id='highest-score-chasing')
L(B, 'Highest unbeaten score', 'bi', where='not b.is_out', order='b.runs desc', ci='Most runs in an innings', id='highest-score-no')
L(B, 'Highest strike rate in an innings', 'bi', where='b.runs >= {QR}', order='100.0 * b.runs / b.balls desc, b.runs desc', note='Qualification: {QR} runs.', hl='SR', id='highest-strike-rate-innings')
L(B, 'Longest individual innings (by balls)', 'bi', where='b.balls > 0', order='b.balls desc, b.runs desc', hl='Balls', id='most-balls-faced-innings')
L(B, 'Most sixes in an innings', 'bi', where='b.sixes > 0', order='b.sixes desc, b.runs desc', hl='6s', id='most-sixes-innings')
L(B, 'Most fours in an innings', 'bi', where='b.fours > 0', order='b.fours desc, b.runs desc', hl='4s', id='most-fours-innings')
L(B, 'Most runs from fours and sixes in an innings', 'bi', where='b.fours + b.sixes > 0', order='4 * b.fours + 6 * b.sixes desc, b.runs desc', hl='4+6', id='most-boundary-runs-innings')
L(B, 'Fastest Hundreds (by balls faced)', 'bi', where='b.balls_to_100 is not null', order='b.balls_to_100 asc, b.runs desc', hl='Balls', over={'Balls': ('num', 'b.balls_to_100'), 'Runs': ('num', 'b.balls_to_100')}, note='Balls faced to reach 100 in the innings.', id='fastest-hundred-balls')
L(B, 'Fastest fifties (by balls faced)', 'bi', where='b.balls_to_50 is not null', order='b.balls_to_50 asc, b.runs desc', hl='Balls', over={'Balls': ('num', 'b.balls_to_50'), 'Runs': ('num', 'b.balls_to_50')}, note='Balls faced to reach 50 in the innings. Ties are listed with the larger score first.', id='fastest-fifty-balls')
L(B, 'Slowest fifties (by balls faced)', 'bi', where='b.balls_to_50 is not null and b.runs < 100', order='b.balls_to_50 desc, b.runs desc', ci='Fastest fifties (by balls faced)', hl='Balls', over={'Balls': ('num', 'b.balls_to_50')}, note='Innings of 50 to 99.', id='slowest-fifty-balls')
L(B, 'Slowest hundreds (by balls faced)', 'bi', where='b.balls_to_100 is not null', order='b.balls_to_100 desc, b.runs desc', ci='Fastest Hundreds (by balls faced)', hl='Balls', over={'Balls': ('num', 'b.balls_to_100')}, id='slowest-hundred-balls')
L(B, 'Highest maiden hundred', 'bi', where='b.first_h100', order='b.runs desc', note='The first hundred of the player in these matches (the data starts in 2001).', id='maiden-hundred-highest')
L(B, 'Carrying bat through a completed innings', 'bi', where='b.carried', order='b.runs desc', note='Opened and was not out when the side was all out.', id='carrying-bat')
L(B, 'Highest percentage of runs in a completed innings', 'bi', where='b.share is not null and b.team_wkts >= {ALLOUT}', order='b.share desc, b.runs desc', note='All out innings, runs as a share of the team total.', hl='%', id='highest-share-of-runs')
L(B, 'Number eleven top scoring in an innings', 'bi', where='b.pos = 11 and b.top_in_team', order='b.runs desc', ci='Most runs in an innings', id='number-eleven-top-score')
L(B, 'Hundred and a duck in a match', 'bm', where="(b.i1 = '0' and try_cast(replace(b.i2, '*', '') as int) >= 100) or (b.i2 = '0' and try_cast(replace(b.i1, '*', '') as int) >= 100)",
  order='b.runs desc', ci='Most runs in a match', id='hundred-and-duck-match', fmts=('test',))
L(B, 'Dismissed by the first ball of a match', 'bi', where='b.first_ball_out', order='b.start_date desc', limit=100, ci='Most runs in an innings', id='dismissed-first-ball')
L(B, 'Most runs in a match', 'bm', order='b.runs desc, b.balls asc', id='most-runs-match')
L(B, 'Most runs in a match on the losing side', 'bm', where="b.result = 'lost'", order='b.runs desc', id='most-runs-match-losing')
L(B, 'Most sixes in a match', 'bm', where='b.sixes > 0', order='b.sixes desc, b.runs desc', ci='Most runs in a match', hl='6s', over={'6s': ('num', 'b.sixes')}, id='most-sixes-match')
L(B, 'Most runs in a series', 'bs', order='b.runs desc', note='A series is a tournament edition or a bilateral tour.', id='most-runs-series')
L(B, 'Most hundreds in a series', 'bs', where='b.h100 > 0', order='b.h100 desc, b.runs desc', hl='100', id='most-hundreds-series')
L(B, 'Most double hundreds in a series', 'bs', where='b.h200 > 0', order='b.h200 desc, b.runs desc', hl='200s', id='most-double-hundreds-series')
L(B, 'Most ducks in a series', 'bs', where='b.ducks > 0', order='b.ducks desc, b.inns desc', hl='0', id='most-ducks-series')
L(B, 'Most runs in a calendar year', 'byr', order='b.runs desc', id='most-runs-year')
L(B, 'Most hundreds in a calendar year', 'byr', where='b.h100 > 0', order='b.h100 desc, b.runs desc', hl='100', id='most-hundreds-year')
L(B, 'Most sixes in a calendar year', 'byr', where='b.sixes > 0', order='b.sixes desc, b.runs desc', ci='Most runs in a calendar year', hl='6s', id='most-sixes-year')
L(B, 'Most runs on a single ground', 'bg', order='b.runs desc', id='most-runs-ground')
L(B, 'Most runs against one team', 'bo', order='b.runs desc', ci='Most hundreds against one team', id='most-runs-against-team')
L(B, 'Most hundreds against one team', 'bo', where='b.h100 > 0', order='b.h100 desc, b.runs desc', hl='100', id='most-hundreds-against-team')
L(B, 'Most runs in an innings (by batting position)', 'bi', where='b.pos is not null and b.rn_pos = 1', order='b.pos asc', note='The highest score from each batting position.', id='highest-score-by-position', limit=11)
L(B, 'Hundreds in consecutive innings', 'streak', where="b.kind = 'h100' and b.n >= 2", order='b.n desc, b.runs desc', id='hundreds-consecutive-innings')
L(B, 'Fifties in consecutive innings', 'streak', where="b.kind = 'h50' and b.n >= 3", order='b.n desc, b.runs desc', note='Scores of 50 or more.', id='fifties-consecutive-innings')
L(B, 'Most consecutive ducks', 'streak', where="b.kind = 'duck' and b.n >= 2", order='b.n desc', hl='Ducks', id='ducks-consecutive-innings')
L(B, 'Most consecutive innings without a duck', 'streak', where="b.kind = 'noduck'", order='b.n desc', id='innings-without-duck')
L(B, 'Most innings before first duck', 'streak', where="b.kind = 'preduck'", order='b.n desc', note='Counted from the first innings in these matches.', id='innings-before-first-duck')

# ---- Bowling -----------------------------------------------------------------------------------------------------------------------------------------------------
W = 'bowling'
L(W, 'Most wickets in career', 'wc', order='c.wkts desc', id='most-wickets-career')
L(W, 'Best career bowling average', 'wc', where='c.wkts >= {QW}', order='c.ave asc', note='Qualification: {QW} wickets.', hl='Ave', id='best-average-career')
L(W, 'Best career economy rate', 'wc', where='c.balls >= {QWB}', order='c.econ asc', note='Qualification: {QWB} balls bowled.', hl='Econ', id='best-economy-career')
L(W, 'Best career strike rate', 'wc', where='c.wkts >= {QW}', order='c.sr asc', note='Qualification: {QW} wickets.', hl='SR', id='best-strike-rate-career')
L(W, 'Worst career bowling average', 'wc', where='c.wkts >= {QW}', order='c.ave desc', note='Qualification: {QW} wickets.', hl='Ave', id='worst-average-career')
L(W, 'Worst career economy rate', 'wc', where='c.balls >= {QWB}', order='c.econ desc', note='Qualification: {QWB} balls bowled.', hl='Econ', ci='Worst career bowling average', id='worst-economy-career')
L(W, 'Worst career strike rate', 'wc', where='c.wkts >= {QW}', order='c.sr desc', note='Qualification: {QW} wickets.', hl='SR', ci='Worst career bowling average', id='worst-strike-rate-career')
L(W, 'Best career bowling average (without qualification)', 'wc', where='c.wkts > 0', order='c.ave asc, c.wkts desc', hl='Ave', id='best-average-nq')
L(W, 'Worst career bowling average (without qualification)', 'wc', where='c.wkts > 0', order='c.ave desc, c.wkts desc', hl='Ave', id='worst-average-nq')
L(W, 'Most five-wickets-in-an-innings in a career', 'wc', where='c.h5 > 0', order='c.h5 desc, c.wkts desc', hl='5', id='most-five-wickets-career')
L(W, 'Most four-wickets-in-an-innings in a career', 'wc', where='c.h4 > 0', order='c.h4 desc, c.wkts desc', hl='4', id='most-four-wickets-career')
L(W, 'Most ten-wickets-in-a-match in a career', 'wc', where='c.h10 > 0', order='c.h10 desc, c.wkts desc', hl='10', id='most-ten-wickets-match-career', fmts=('test',))
L(W, 'Most balls bowled in career', 'wc', order='c.balls desc', hl='Balls', id='most-balls-career')
L(W, 'Most runs conceded in career', 'wc', order='c.runs desc', hl='Runs', id='most-runs-conceded-career')
L(W, 'Most maidens in career', 'wc', where='c.maidens > 0', order='c.maidens desc, c.wkts desc', hl='Mdns', id='most-maidens-career')
L(W, 'Most matches bowled in', 'wc', order='c.mat desc, c.wkts desc', ci='Most wickets in career', hl='Mat', id='most-matches-bowled')
L(W, 'Most hat-tricks in a career', 'wc', where='c.hat > 0', order='c.hat desc, c.wkts desc', ci='Most wickets in career', hl='Wkts', note='Hat-tricks within one innings.', id='most-hat-tricks-career')
L(W, 'Best figures in an innings', 'bw', where='w.wickets > 0', order='w.wickets desc, w.runs asc, w.balls asc', id='best-figures-innings')
L(W, 'Best figures in a innings when on the losing side', 'bw', where="w.wickets > 0 and w.result = 'lost'", order='w.wickets desc, w.runs asc', id='best-figures-innings-losing')
L(W, 'Best economy rate in an innings', 'bw', where='w.balls >= {QEB}', order='6.0 * w.runs / w.balls asc, w.balls desc', note='Qualification: {QEB} balls.', hl='Econ', id='best-economy-innings')
L(W, 'Worst economy rate in an innings', 'bw', where='w.balls >= {QEB}', order='6.0 * w.runs / w.balls desc, w.balls desc', note='Qualification: {QEB} balls.', hl='Econ', ci='Best economy rate in an innings', id='worst-economy-innings')
L(W, 'Best strike rate in an innings', 'bw', where='w.wickets >= {QSW}', order='1.0 * w.balls / w.wickets asc, w.wickets desc', note='Qualification: {QSW} wickets.', hl='SR', id='best-strike-rate-innings')
L(W, 'Worst strike rate in an innings', 'bw', where='w.wickets >= {QSW}', order='1.0 * w.balls / w.wickets desc, w.wickets desc', note='Qualification: {QSW} wickets.', hl='SR', ci='Best strike rate in an innings', id='worst-strike-rate-innings')
L(W, 'Most balls bowled in an innings', 'bw', order='w.balls desc, w.wickets desc', hl='Balls bowled in an inns', id='most-balls-innings')
L(W, 'Most runs conceded in an innings', 'bw', order='w.runs desc, w.wickets asc', hl='Runs', id='most-runs-conceded-innings')
L(W, 'Most maidens in an innings', 'bw', where='w.maidens > 0', order='w.maidens desc, w.wickets desc', hl='Mdns', ci='Best figures in an innings', id='most-maidens-innings')
L(W, 'Hat-tricks', 'bw', where='w.hat_tricks > 0', order='w.start_date desc', limit=200, ci='Best figures in an innings', id='hat-tricks')
L(W, 'Best figures in an innings (by number of wickets)', 'bw', where='w.wickets > 0 and w.rn_w = 1', order='w.wickets desc', note='The best figures for each number of wickets.', ci='Best figures in an innings', id='best-figures-by-wickets')
L(W, 'Wicket with the first ball of an innings', 'bw', where='w.first_ball', order='w.start_date desc', limit=100, ci='Best figures in an innings', id='wicket-first-ball')
L(W, 'Best figures in a match', 'wm', where='w.wickets > 0', order='w.wickets desc, w.runs asc', id='best-figures-match', fmts=('test',))
L(W, 'Most wickets in a match', 'wm', where='w.wickets > 0', order='w.wickets desc, w.runs asc, w.balls asc', ci='Best figures in a match', id='most-wickets-match', fmts=('test',))
L(W, 'Best figures in a match when on the losing side', 'wm', where="w.wickets > 0 and w.result = 'lost'", order='w.wickets desc, w.runs asc', id='best-figures-match-losing', fmts=('test',))
L(W, 'Most balls bowled in a match', 'wm', order='w.balls desc', hl='Balls', id='most-balls-match', fmts=('test',))
L(W, 'Most runs conceded in a match', 'wm', order='w.runs desc', hl='Runs', id='most-runs-conceded-match', fmts=('test',))
L(W, 'Most wickets in a series', 'ws', where='w.wickets > 0', order='w.wickets desc, w.runs asc', id='most-wickets-series')
L(W, 'Most five-wickets-in-an-innings in a series', 'ws', where='w.h5 > 0', order='w.h5 desc, w.wickets desc', hl='5', ci='Most wickets in a series', id='most-five-wickets-series')
L(W, 'Most wickets in a calendar year', 'wy', where='w.wickets > 0', order='w.wickets desc, w.runs asc', id='most-wickets-year')
L(W, 'Most wickets on a single ground', 'wg', where='w.wickets > 0', order='w.wickets desc, w.runs asc', id='most-wickets-ground')
L(W, 'Most wickets against one team', 'wo', where='w.wickets > 0', order='w.wickets desc, w.runs asc', ci='Most wickets on a single ground', id='most-wickets-against-team')
for _way, _label, _col in (('bowled', 'bowled', 'Bwd'), ('caught', 'caught', 'caught'), ('lbw', 'lbw', 'LBW'), ('stumped', 'stumped', 'stumped'), ('hit wicket', 'hit wicket', 'HW'), ('caught and bowled', 'caught and bowled', 'c&b')):
    L(W, f'Most wickets taken {_label}', 'wt', where=f"w.way = '{_way}'", order='w.wickets desc', note='The bowler is credited with the wicket.', hl=_col, over={_col: ('num', 'w.wickets')}, id='most-wickets-' + _way.replace(' ', '-'))

# ---- Fielding ----------------------------------------------------------------------------------------------------------------------------------------------------
F = 'fielding'
L(F, 'Most catches in career', 'fc', where='c.ct > 0', order='c.ct desc, c.mat asc', note='Catches by fielders, caught and bowled included.', id='most-catches-career')
L(F, 'Most catches in an innings', 'fgi', where='c.ct > 0', order='c.ct desc, c.d desc', id='most-catches-innings')
L(F, 'Most catches in a match', 'fgm', where='c.ct > 0', order='c.ct desc, c.d desc', id='most-catches-match')
L(F, 'Most catches in a series', 'fcs', where='c.ct > 0', order='c.ct desc', id='most-catches-series')
L(F, 'Most catches in a calendar year', 'fcy', where='c.ct > 0', order='c.ct desc', ci='Most catches in a series', id='most-catches-year')
L(F, 'Most catches by a substitute in an innings', 'subc', order='c.ct desc, c.d desc', id='most-catches-substitute-innings')
L(F, 'Most catches by a substitute in a match', 'subm', order='c.ct desc, c.d desc', id='most-catches-substitute')
L(F, 'Most run outs in a career', 'fc', where='c.ro > 0', order='c.ro desc, c.mat asc', ci='Most catches in career', hl='RO', id='most-run-outs-career')
L(F, 'Most fielding dismissals in a career', 'fc', where='c.n > 0', order='c.n desc, c.mat asc', note='Catches, run outs and stumpings.', ci='Most catches in career', hl='Dismissed', id='most-dismissals-fielding-career')

# ---- Partnerships ------------------------------------------------------------------------------------------------------------------------------------------------
P = 'partnership'
L(P, 'Highest partnerships for any wicket', 'pt', order='p.runs desc, p.balls asc', id='highest-partnerships')
L(P, 'Highest partnerships by wicket', 'pt', where='p.rn_w = 1', order='p.wkt asc', note='The best partnership for each wicket.', id='highest-partnerships-by-wicket', limit=10)
for _k, _w in enumerate(('first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'), 1):
    L(P, f'Highest partnership for the {_w} wicket', 'pt', where=f'p.wkt = {_k}', order='p.runs desc, p.balls asc', id=f'highest-partnership-wicket-{_k}')
L(P, 'Highest unbroken partnerships', 'pt', where='not p.ended', order='p.runs desc', ci='Highest partnerships for any wicket', id='highest-partnership-unbroken')
L(P, 'Highest partnerships chasing', 'pt', where='p.chasing', order='p.runs desc', ci='Highest partnerships for any wicket', id='highest-partnership-chasing')
L(P, 'Fastest 100 partnerships (by balls)', 'pt', where='p.runs >= 100 and p.balls > 0', order='p.balls asc, p.runs desc', ci='Highest partnerships for any wicket', hl='Balls', over={'Balls': ('num', 'p.balls')}, id='fastest-partnership-100')
L(P, 'Highest overall partnership runs by a pair', 'pa', order='p.runs desc', id='highest-partnership-runs-pair')
L(P, 'Highest overall partnership runs by openers', 'pao', order='p.runs desc', id='highest-partnership-runs-openers')
L(P, 'Most hundred partnerships by a pair', 'pa', where='p.h100 > 0', order='p.h100 desc, p.runs desc', hl='100', id='most-hundred-partnerships-pair')
L(P, 'Most fifty partnerships by a pair', 'pa', where='p.h50 + p.h100 > 0', order='p.h50 + p.h100 desc, p.runs desc', note='Partnerships of 50 or more.', ci='Most hundred partnerships by a pair', hl='50', id='most-fifty-partnerships-pair')
L(P, 'Highest average partnership by a pair', 'pa', where='p.inns >= {QP}', order='p.ave desc', note='Qualification: {QP} partnerships.', ci='Most hundred partnerships by a pair', hl='Ave', id='highest-average-partnership-pair')

# ---- Team --------------------------------------------------------------------------------------------------------------------------------------------------------
T = 'team'
L(T, 'Results summary', 'tr', where='c.mat >= {QT}', order='c.mat desc', note='Qualification: {QT} matches.', limit=100, hl='Mat', id='results-summary')
L(T, 'Best win percentage', 'tr', where='c.mat >= {QT2}', order='c.winpct desc, c.mat desc', note='Qualification: {QT2} matches. Wins over matches with a result.', limit=100, ci='Results summary', hl='%W', id='best-win-percentage')
L(T, 'Tied matches', 'tm', where="m.outcome = 'tie'", order='m.start_date desc', limit=200, id='tied-matches')
L(T, 'Abandoned matches', 'tm', where="m.outcome = 'no result'", order='m.start_date desc', limit=200, id='abandoned-matches')
L(T, 'Largest margin of victory (by runs)', 'tm', where='m.win_runs is not null and not coalesce(m.won_inns, false)', order='m.win_runs desc', hl='Margin', id='largest-win-runs')
L(T, 'Largest margin of victory (by an innings)', 'tm', where='m.won_inns', order='m.win_runs desc', hl='Margin', id='largest-win-innings')
L(T, 'Largest margin of victory (by wickets)', 'tm', where='m.win_wkts is not null', order='m.win_wkts desc, m.start_date desc', hl='Margin', ci='Largest margin of victory (by wickets)', note='Most wickets in hand at the finish.', id='largest-win-wickets')
L(T, 'Smallest margin of victory (by runs)', 'tm', where='m.win_runs is not null and not coalesce(m.won_inns, false)', order='m.win_runs asc, m.start_date desc', hl='Margin', id='smallest-win-runs')
L(T, 'Smallest margin of victory (by wickets)', 'tm', where='m.win_wkts is not null', order='m.win_wkts asc, m.start_date desc', hl='Margin', id='smallest-win-wickets')
L(T, 'Victory losing fewest wickets', 'tm', where='m.winner_wkts_lost is not null', order='m.winner_wkts_lost asc, m.win_runs desc nulls last', note='The winner lost the fewest wickets in the whole match.', hl='Wkts', id='win-losing-fewest-wickets')
L(T, 'Highest innings totals', 'ti', order='i.runs desc, i.wickets asc', id='highest-total')
L(T, 'Highest totals when chasing (winning)', 'ti', where='i.chasing and i.won', order='i.runs desc', ci='Highest innings totals', id='highest-total-chasing')
L(T, 'Highest fourth innings totals', 'ti', where='i.innings = 4', order='i.runs desc', id='highest-total-fourth')
L(T, 'Lowest innings totals', 'ti', where='i.wickets >= {ALLOUT} and not i.declared', order='i.runs asc, i.balls asc', note='Completed innings (all out).', id='lowest-total')
L(T, 'Lowest totals defended', 'ti', where='i.wickets >= {ALLOUT} and not i.declared and i.bat_first and i.won_by_it', order='i.runs asc', note='Completed innings by the side that batted first and won.', ci='Lowest innings totals', id='lowest-total-chasing')
L(T, 'Highest run rate in a completed innings', 'ti', where='i.wickets >= {ALLOUT} and i.balls >= {QRR}', order='i.runs * 6.0 / i.balls desc', note='All out innings of at least {QRR} balls.', hl='RR', id='highest-run-rate')
L(T, 'Highest run rate (no qualification)', 'ti', where='i.balls > 0', order='i.runs * 6.0 / i.balls desc, i.runs desc', hl='RR', id='highest-run-rate-nq')
L(T, 'Lowest run rate in a completed innings', 'ti', where='i.wickets >= {ALLOUT} and i.balls >= {QRR}', order='i.runs * 6.0 / i.balls asc', note='All out innings of at least {QRR} balls.', hl='RR', id='lowest-run-rate')
L(T, 'Shortest completed innings (by balls)', 'ti', where='i.wickets >= {ALLOUT} and not i.declared', order='i.balls asc, i.runs asc', hl='Balls', id='shortest-completed-innings')
L(T, 'Most hundreds in an innings', 'ti', where='i.h100 > 0', order='i.h100 desc, i.runs desc', hl='100s', id='most-hundreds-innings')
L(T, 'Most fifties in an innings (team)', 'ti', where='i.h50p > 1', order='i.h50p desc, i.runs desc', note='Scores of 50 or more.', ci='Most hundreds in an innings', hl='100s', over={'100s': ('num', 'i.h50p')}, id='most-fifties-innings')
L(T, 'Most ducks in an innings', 'ti', where='i.ducks > 0', order='i.ducks desc, i.runs asc', hl='Ducks', id='most-ducks-innings')
L(T, 'Most sixes in an innings', 'ti', where='i.sixes > 0', order='i.sixes desc, i.runs desc', hl='6s', id='most-sixes-innings-team')
L(T, 'Most fours in an innings', 'ti', where='i.fours > 0', order='i.fours desc, i.runs desc', hl='4s', id='most-fours-innings-team')
L(T, 'Most runs from fours and sixes in an innings', 'ti', where='i.fours + i.sixes > 0', order='4 * i.fours + 6 * i.sixes desc', hl='Runs', id='most-boundary-runs-innings-team')
L(T, 'Most extras in an innings', 'ti', where='i.extras > 0', order='i.extras desc, i.runs desc', hl='Ext', id='most-extras-innings')
L(T, 'Most byes in an innings', 'ti', where='i.byes > 0', order='i.byes desc', hl='b', id='most-byes-innings')
L(T, 'Most leg byes in an innings', 'ti', where='i.legbyes > 0', order='i.legbyes desc', hl='lb', id='most-leg-byes-innings')
L(T, 'Most wides in an innings', 'ti', where='i.wides > 0', order='i.wides desc', hl='w', id='most-wides-innings')
L(T, 'Most no balls in an innings', 'ti', where='i.noballs > 0', order='i.noballs desc', hl='nb', id='most-no-balls-innings')
L(T, 'Extras being highest scorer in a completed innings', 'ti', where='i.extras_top and i.wickets >= {ALLOUT}', order='i.extras desc', hl='Ext', id='extras-top-scorer')
L(T, 'Most bowlers in an innings', 'ti', where='i.bowlers > 0', order='i.bowlers desc, i.runs desc', hl='Num', over={'Num': ('num', 'i.bowlers')}, id='most-bowlers-innings')
L(T, 'Most batters reaching double figures in an innings', 'ti', where='i.dbl > 0', order='i.dbl desc, i.runs desc', hl='Num', over={'Num': ('num', 'i.dbl')}, id='most-batters-double-figures')
L(T, 'Most batters not reaching double figures in an innings', 'ti', where='i.wickets >= {ALLOUT}', order='i.single desc, i.runs asc', hl='Num', over={'Num': ('num', 'i.single')}, note='All out innings.', id='fewest-batters-double-figures')
for _way, _label in (('caught', 'caught'), ('bowled', 'bowled'), ('lbw', 'lbw'), ('run out', 'run out'), ('stumped', 'stumped')):
    _c = 'i.w_' + _way.replace(' ', '_')
    L(T, f'Most batters {_label} in an innings', 'ti', where=f'{_c} > 0', order=f'{_c} desc, i.runs asc', hl='Num', over={'Num': ('num', _c)}, id='most-batters-' + _way.replace(' ', '-') + '-innings')
L(T, 'Highest match aggregates', 'tm', where='m.agg is not null', order='m.agg desc', note='Runs by both sides in the match.', hl='Team runs', id='highest-match-aggregate')
L(T, 'Lowest match aggregates', 'tm', where='m.agg is not null and m.complete', order='m.agg asc', note='Completed matches with a result.', hl='Team runs', ci='Highest match aggregates', id='lowest-match-aggregate')
L(T, 'Most consecutive wins', 'ts', where="c.kind = 'win' and c.n >= {QS}", order='c.n desc, c.d2 desc', limit=100, id='most-consecutive-wins')
L(T, 'Most consecutive defeats', 'ts', where="c.kind = 'loss' and c.n >= {QS}", order='c.n desc, c.d2 desc', limit=100, id='most-consecutive-defeats')
L(T, 'Most consecutive matches without defeat', 'ts', where="c.kind = 'unbeaten' and c.n >= {QS}", order='c.n desc, c.d2 desc', limit=100, id='most-consecutive-unbeaten')
L(T, 'Most consecutive matches without victory', 'ts', where="c.kind = 'winless' and c.n >= {QS}", order='c.n desc, c.d2 desc', limit=100, id='most-consecutive-winless')
L(T, 'Most matches on a single ground', 'tg', order='c.n desc', limit=100, id='most-matches-ground')


# ---- More team lists ---------------------------------------------------------------------------------------------------------------------------------------------
L(T, 'List of series results', 'sr', order='c.d1 desc', limit=2000, note='Bilateral series. The margin is the wins of each side and the matches played.', id='list-of-series-results')
L(T, 'Results summary (by opposition)', 'tro', where='c.mat >= 3', order='c.mat desc, c.team', limit=400, hl='Mat', note='Pairs of sides that have met at least three times.', id='results-by-opposition')
L(T, 'Closest draws by runs remaining', 'ti', where="i.target is not null and i.res = 'draw' and i.rem > 0", order='i.rem asc, i.wickets desc', hl='Rem', id='closest-draws-runs')
L(T, 'Closest draws by wickets remaining', 'ti', where="i.target is not null and i.res = 'draw' and i.rem > 0", order='i.wickets desc, i.rem asc', hl='Wkts', over={'Wkts': ('num', '10 - i.wickets')}, id='closest-draws-wickets')
L(T, 'Victory after a follow on', 'tm', where='m.fo_win', order='m.start_date desc', hl='Margin', id='victory-after-follow-on')
L(T, 'Winning every match in a series (whitewashes)', 'ser', where='c.won = c.n and c.n >= 3', order='c.n desc, c.d1 desc', limit=100, hl='Mat', note='Bilateral series of three or more matches.', id='whitewashes')
L(T, 'Most matches in a series without a win', 'ser', where='c.won = 0 and c.n >= 3', order='c.n desc, c.d1 desc', limit=100, hl='Mat', id='most-matches-series-without-win')
L(T, 'Winning a series after coming from behind', 'ser', where="c.from_behind", order='c.n desc, c.d1 desc', hl='Mat', id='series-from-behind')
L(T, 'Least players used by one side in a series', 'ser', where='c.n >= 3 and c.players is not null', order='c.players asc, c.n desc, c.d1 desc', limit=100, hl='Players', note='Series of three or more matches.', id='least-players-series')
L(T, 'Most players used by one side in a series', 'ser', where='c.n >= 3 and c.players is not null', order='c.players desc, c.n desc, c.d1 desc', limit=100, hl='Players', note='Series of three or more matches.', id='most-players-series')
L(T, 'Most consecutive series wins', 'sst', where="c.kind = 'win' and c.n >= 2", order='c.n desc', limit=100, id='most-consecutive-series-wins')
L(T, 'Most consecutive series without defeat', 'sst', where="c.kind = 'unbeaten' and c.n >= 3", order='c.n desc', limit=100, id='most-consecutive-series-unbeaten')
L(T, 'Most consecutive series without victory', 'sst', where="c.kind = 'winless' and c.n >= 3", order='c.n desc', limit=100, id='most-consecutive-series-winless')
L(T, 'Most consecutive series defeats', 'sst', where="c.kind = 'loss' and c.n >= 2", order='c.n desc', limit=100, id='most-consecutive-series-defeats')
L(T, 'Highest average of runs per wicket', 'ti', where='i.wickets > 0', order='i.runs * 1.0 / i.wickets desc', hl='Ave', id='highest-average-per-wicket')
L(T, 'Most consecutive innings of over 400', 't4', order='c.n desc', limit=100, id='consecutive-innings-over-400')
L(T, "Biggest difference between a team's first and second innings", 't12', order='c.diff desc', id='difference-first-second-innings')
L(T, 'Most consecutive draws', 'ts', where="c.kind = 'draw' and c.n >= 2", order='c.n desc, c.d2 desc', limit=100, id='most-consecutive-draws')
L(T, 'Most consecutive matches without a draw', 'ts', where="c.kind = 'nodraw' and c.n >= {QS}", order='c.n desc, c.d2 desc', limit=100, id='most-consecutive-without-draw')
L(T, 'Longest matches (by days)', 'tm', where='m.days is not null and m.complete', order='m.days desc, m.start_date desc', hl='Days', note='Days from the first to the last day of the match, rest days included.', id='longest-matches-days')
L(T, 'Longest matches (by balls bowled)', 'tm', where='m.ob > 0', order='m.ob desc, m.start_date desc', hl='Balls', id='longest-matches-balls')
L(T, 'Shortest matches (by days)', 'tm', where='m.days is not null and m.winner_id is not null', order='m.days asc, m.ob asc', hl='Days', note='Days from the first to the last day of the match.', id='shortest-matches-days')
L(T, 'Shortest matches (by balls bowled)', 'tm', where='m.complete and m.ob > 0 and m.winner_id is not null', order='m.ob asc', hl='Balls', id='shortest-matches-balls')
L(T, 'Most hundreds in a match', 'tm', where='m.h100 > 0', order='m.h100 desc', hl='100s', id='most-hundreds-match')
L(T, 'Most hundreds in a series', 'ser', where='c.h100 > 0', order='c.h100 desc', limit=100, hl='100s', prepend=('Team',), id='most-hundreds-series-team')
L(T, 'Both openers scoring a hundred in an innings', 'ti', where='i.open100', order='i.start_date desc', limit=100, id='both-openers-hundred')
L(T, 'Most ducks in a match', 'tm', where='m.dk > 0', order='m.dk desc', hl='Ducks', id='most-ducks-match')
L(T, 'Most pairs in a match', 'tm', where='m.pairs > 0', order='m.pairs desc', hl='Pairs', id='most-pairs-match')
L(T, 'Most sixes in a match', 'tm', where='m.s6 > 0', order='m.s6 desc, m.f4 desc', hl='6s', id='most-sixes-match-team')
L(T, 'Most fours in a match', 'tm', where='m.f4 > 0', order='m.f4 desc, m.s6 desc', hl='4s', id='most-fours-match-team')
L(T, 'Most runs from fours and sixes in a match', 'tm', where='m.f4 + m.s6 > 0', order='4 * m.f4 + 6 * m.s6 desc', hl='Runs', id='most-boundary-runs-match')
L(T, 'Most hundred partnerships in an innings', 'ti', where='i.p100 > 0', order='i.p100 desc, i.runs desc', hl='100s', over={'100s': ('num', 'i.p100')}, id='most-hundred-partnerships-innings')
L(T, 'Most hundred partnerships in a match', 'tm', where='m.p100 > 0', order='m.p100 desc', hl='100s', over={'100s': ('num', 'm.p100')}, id='most-hundred-partnerships-match')
L(T, 'Most extras in a match', 'tm', where='m.ex > 0', order='m.ex desc', hl='Extras', id='most-extras-match')
L(T, 'Most byes in a match', 'tm', where='m.by > 0', order='m.by desc', hl='b', id='most-byes-match')
L(T, 'Most leg byes in a match', 'tm', where='m.lb > 0', order='m.lb desc', hl='lb', id='most-leg-byes-match')
L(T, 'Most wides in a match', 'tm', where='m.wd > 0', order='m.wd desc', hl='w', id='most-wides-match')
L(T, 'Most no balls in a match', 'tm', where='m.nb > 0', order='m.nb desc', hl='nb', id='most-no-balls-match')
L(T, 'Most bowlers in a match', 'tm', where='m.bw > 0', order='m.bw desc', hl='Num', over={'Num': ('num', 'm.bw')}, id='most-bowlers-match')
L(T, 'Most bowlers taking a wicket in an innings', 'ti', where='i.bwk > 0', order='i.bwk desc, i.runs desc', hl='Num', over={'Num': ('num', 'i.bwk')}, id='most-bowlers-wicket-innings')
L(T, 'Most bowlers taking a wicket in an match', 'tm', where='m.bwk > 0', order='m.bwk desc', hl='Num', over={'Num': ('num', 'm.bwk')}, id='most-bowlers-wicket-match')
L(T, 'Two bowlers with five-wickets-in-an-innings', 'ti', where='i.b5 >= 2', order='i.start_date desc', limit=100, id='two-bowlers-five-wickets')
L(T, 'Two bowlers with four-wickets-in-an-innings', 'ti', where='i.b4 >= 2', order='i.runs asc, i.start_date desc', limit=100, id='two-bowlers-four-wickets')
L(T, 'Two bowlers unchanged in a completed innings', 'ti', where='i.bowlers = 2 and i.wickets >= {ALLOUT} and not i.declared', order='i.start_date desc', limit=100, id='two-bowlers-unchanged')
L(T, 'Most runs in an innings when only four bowlers used', 'ti', where='i.bowlers = 4', order='i.runs desc', id='most-runs-four-bowlers')
L(T, 'Most runs in an innings when only five bowlers used', 'ti', where='i.bowlers = 5', order='i.runs desc', id='most-runs-five-bowlers')
for _way, _label, _c in (('caught', 'caught', 'cc'), ('bowled', 'bowled', 'cb'), ('lbw', 'lbw', 'cl'), ('run out', 'run out', 'cr'), ('stumped', 'stumped', 'cs')):
    L(T, f'Most batters {_label} in a match', 'tm', where=f'm.{_c} > 0', order=f'm.{_c} desc', hl='Num', over={'Num': ('num', f'm.{_c}'), 'Wkts': ('num', 'm.wk')}, id='most-batters-' + _way.replace(' ', '-') + '-match')
L(T, 'Largest margin of victory (by balls remaining)', 'tm', where='m.balls_rem is not null and m.balls_rem > 0', order='m.balls_rem desc', hl='Balls Rem', id='largest-win-balls-remaining')
L(T, 'Highest innings totals batting second', 'ti', where='i.innings = 2', order='i.runs desc', id='highest-total-second')

# ---- More batting lists ------------------------------------------------------------------------------------------------------------------------------------------
L(B, 'Most runs off one over', 'ovr', order='o.runs desc, o.start_date', hl='Runs', note='Runs charged to the bowler: off the bat, wides and no balls. The line under the name is the over ball by ball.', id='most-runs-over')
L(B, 'Most sixes off consecutive balls', 'sx6', order='o.n desc, o.start_date', hl=('Sixes', 'Number'), note='Deliveries one after another in an innings, each a six.', id='most-sixes-consecutive-balls')
L(B, 'Most fours off consecutive balls', 'sx4', order='o.n desc, o.start_date', hl='Fours', note='Deliveries one after another in an innings, each a four.', id='most-fours-consecutive-balls')
L(B, 'Fastest double hundreds (by balls faced)', 'fst2', order='f.balls asc, f.runs desc', hl='Balls', id='fastest-double-hundreds-balls')
L(B, 'Fastest triple hundreds (by balls faced)', 'fst3', order='f.balls asc, f.runs desc', hl='Balls faced', id='fastest-triple-hundreds-balls')
L(B, '99 not out (and 199, 299 etc)', 'bi', where='b.runs % 100 = 99 and not b.is_out', order='b.start_date desc', limit=100, ci='99 not out (and 199, 299 etc)', id='ninety-nine-not-out')
L(B, 'Dismissed for 99 (and 199, 299 etc)', 'bi', where='b.runs % 100 = 99 and b.is_out', order='b.runs desc, b.start_date desc', limit=100, id='dismissed-for-99')
L(B, 'Dismissed for 99', 'bi', where='b.runs = 99 and b.is_out', order='b.start_date desc', limit=100, id='dismissed-for-99-t20')
L(B, 'Unusual dismissals', 'ud', order='u.start_date desc', limit=200, id='unusual-dismissals')
L(B, 'King Pair', 'kp', order='k.start_date desc', limit=100, note='Out to the first ball faced in both innings of a match.', id='king-pair')
L(B, 'Hundred in each innings of a match', 'bm', where='b.r1 >= 100 and b.r2 >= 100', order='b.r1 + b.r2 desc', hl='Runs', over={'Runs': ('num', 'b.r1 + b.r2')}, id='hundred-each-innings')
L(B, 'Double hundred and hundred in a match', 'bm', where='(b.r1 >= 200 and b.r2 >= 100) or (b.r2 >= 200 and b.r1 >= 100)', order='b.r1 + b.r2 desc', id='double-hundred-and-hundred')
L(B, 'Hundred and a ninety in a match', 'bm', where='(b.r1 >= 100 and b.r2 between 90 and 99) or (b.r2 >= 100 and b.r1 between 90 and 99)', order='b.r1 + b.r2 desc', id='hundred-and-ninety')
L(B, 'Two unbeaten fifties in a match', 'bm', where='b.r1 >= 50 and b.r2 >= 50 and not b.o1 and not b.o2', order='b.r1 + b.r2 desc', id='two-unbeaten-fifties')
L(B, 'Hundreds in consecutive matches', 'ms', where="s.kind = 'h100' and s.n >= 2", order='s.n desc, s.d_last desc', id='hundreds-consecutive-matches')
L(B, 'Fifties in consecutive matches', 'ms', where="s.kind = 'h50' and s.n >= 3", order='s.n desc, s.d_last desc', id='fifties-consecutive-matches')
L(B, 'Fastest Hundreds - India (by balls faced)', 'bi', where="b.balls_to_100 is not null and b.team = 'India'", order='b.balls_to_100 asc, b.runs desc', hl='Balls', over={'Balls': ('num', 'b.balls_to_100')}, id='fastest-hundreds-india')
L(B, 'Fastest hundreds', 'bi', where='b.balls_to_100 is not null', order='b.balls_to_100 asc, b.runs desc', hl='Balls', over={'Balls': ('num', 'b.balls_to_100')}, note='Balls faced to reach 100 in the innings.', id='fastest-hundreds-limited')
L(B, 'Fastest fifties', 'bi', where='b.balls_to_50 is not null', order='b.balls_to_50 asc, b.runs desc', hl='Balls', over={'Balls': ('num', 'b.balls_to_50')}, note='Balls faced to reach 50 in the innings.', id='fastest-fifties-limited')

# ---- More bowling lists ------------------------------------------------------------------------------------------------------------------------------------------
L(W, 'Most consecutive five-wickets-in-an-innings', 'wst', where="s.kind = 'h5' and s.n >= 2", order='s.n desc, s.d_last desc', id='consecutive-five-wickets')
L(W, 'Most consecutive four-wickets-in-an-innings', 'wst', where="s.kind = 'h4' and s.n >= 2", order='s.n desc, s.d_last desc', hl='4wi', id='consecutive-four-wickets')
L(W, 'Bowler/Batter combinations', 'bbc', order='c.wkts desc, c.ave asc', note='Bowler credited with the dismissals; three or more.', id='bowler-batter-combinations')
L(W, 'Bowler/Batters combinations', 'bbc', order='c.wkts desc, c.ave asc', note='Bowler credited with the dismissals; three or more.', id='bowler-batter-combinations-odi')
L(W, 'Bowler/batters combinations', 'bbc', order='c.wkts desc, c.ave asc', note='Bowler credited with the dismissals; three or more.', id='bowler-batter-combinations-t20')

# ---- All-round lists ---------------------------------------------------------------------------------------------------------------------------------------------
A = 'allround'
L(A, '1000 runs and 100 wickets', 'pcar', where='c.runs >= 1000 and c.wkts >= 100', order='c.runs desc', id='ar-1000-100')
L(A, '1000 runs, 50 wickets and 50 catches', 'pcar', where='c.runs >= 1000 and c.wkts >= 50 and c.ct >= 50', order='c.runs desc', id='ar-1000-50-50')
L(A, '5000 runs and 50 fielding dismissals', 'pcar', where='c.runs >= 5000 and c.dis >= 50', order='c.runs desc', note='Fielding dismissals: catches, run outs and stumpings.', id='ar-5000-50-fielding')
L(A, '250 runs and 20 wickets in a series', 'arsx', where='c.runs >= 250 and c.wkts >= 20', order='c.runs + 20 * c.wkts desc', id='ar-series-250-20')
L(A, '250 runs and 10 wickets in a series', 'arsx', where='c.runs >= 250 and c.wkts >= 10', order='c.runs + 20 * c.wkts desc', id='ar-series-250-10')
L(A, '100 runs and 10 wickets in a match', 'arm', where='c.runs >= 100 and c.wkts >= 10', order='c.runs + 20 * c.wkts desc', id='ar-match-100-10')
L(A, 'A hundred and five wickets in an innings', 'arm', where='c.max_runs >= 100 and c.max_wkts >= 5', order='c.max_wkts desc, c.max_runs desc', note='A hundred in one innings and five wickets in an innings of the same match.', id='ar-hundred-five-wickets')
L(A, 'A hundred and four wickets in an innings', 'arm', where='c.max_runs >= 100 and c.max_wkts >= 4', order='c.max_wkts desc, c.max_runs desc', id='ar-hundred-four-wickets')
L(A, 'A fifty and five wickets in an innings', 'arm', where='c.max_runs >= 50 and c.max_wkts >= 5', order='c.max_wkts desc, c.max_runs desc', id='ar-fifty-five-wickets')
L(A, 'Opening the batting and bowling in the same match', 'arm', where='c.opened_both', order='c.start_date desc', limit=100, note='Batted at 1 or 2 and bowled the first over of an innings.', id='ar-opened-bat-and-bowl')

# ---- More partnership and individual lists ---------------------------------------------------------------------------------------------------------------------------
P2 = 'partnership'
L(P2, 'Highest partnership runs in a match (both innings)', 'ptm', order='p.runs desc', note='A pair batting together in both innings of a match.', id='highest-partnership-match')
I = 'individual'
L(I, 'Most matches in career', 'pcar', order='c.mat desc, c.runs desc', hl='Mat', note='Matches in the playing XI, since 2001.', id='most-matches-in-career')
L(I, 'Most player-of-the-match awards', 'po', order='c.n desc, c.mat asc', id='player-of-the-match')
L(I, 'Most matches as an umpire', 'um', where="c.role = 'umpire'", order='c.n desc', note='On-field umpire.', hl='Umpire', id='most-matches-umpire')
L(I, 'Most matches as a TV umpire', 'um', where="c.role = 'tv_umpire'", order='c.n desc', ci='Most matches as an umpire', id='most-matches-tv-umpire')
L(I, 'Most matches as a match referee', 'um', where="c.role = 'match_referee'", order='c.n desc', hl='Matches', id='most-matches-referee')


# ---- Debut, age, sequence and career lists ---------------------------------------------------------------------------------------------------------------------------
NOTE_DEBUT = 'Players whose first international was in 2002 or later, so the first match in the data is their debut.'
NOTE_AGE = 'Age in whole years at the match. Dates of birth are not published, so players of one age are in match date order.'
L(W, 'Four wickets in five balls', 'ww45', order='o.start_date desc', limit=100, note='Four wickets within five deliveries of one bowler in an innings.', id='four-wickets-five-balls')
L(W, 'Three wickets in four balls', 'ww34', names=['Bowler', 'Match', 'Location', 'Year'], order='o.start_date desc', limit=100, note='Three wickets within four deliveries of one bowler in an innings.', id='three-wickets-four-balls')
L(W, 'Four wickets in four balls', 'ww44', order='o.start_date desc', limit=100, note='Four wickets with four consecutive deliveries of one bowler.', id='four-wickets-four-balls')
L(P, 'Highest score at each fall of wicket', 'fwh', order='o.wk, o.score desc', limit=100, prepend=('Wkt',), note='The ten highest team scores at which each wicket fell.', id='highest-score-fall-of-wicket')
L(P, 'Lowest score at each fall of wicket', 'fwl', order='o.wk, o.score', limit=100, prepend=('Wkt',), note='The ten lowest team scores at which each wicket fell.', id='lowest-score-fall-of-wicket')
L(B, 'Most runs in debut match', 'bmd', order='b.runs desc', note=NOTE_DEBUT, intl=True, id='most-runs-debut-match')
L(B, 'Hundred on debut', 'bid', where='b.runs >= 100', order='b.runs desc', note=NOTE_DEBUT, intl=True, id='hundred-on-debut')
L(B, 'Double hundred on debut', 'bid', where='b.runs >= 200', order='b.runs desc', note=NOTE_DEBUT, intl=True, id='double-hundred-on-debut')
L(B, 'Ninety on debut', 'bid', where='b.runs between 90 and 99', order='b.runs desc', note=NOTE_DEBUT, intl=True, id='ninety-on-debut')
L(B, 'Pair on debut', 'bmd', where='b.r1 = 0 and b.r2 = 0 and b.o1 and b.o2', order='b.start_date desc', note=NOTE_DEBUT, intl=True, id='pair-on-debut')
L(B, 'Hundreds in consecutive matches from debut', 'msd', where="s.kind = 'h100' and s.n >= 2 and s.r0 = 1", order='s.n desc', note=NOTE_DEBUT, intl=True, id='hundreds-consecutive-from-debut')
L(W, 'Best figures in a innings on debut', 'bwd', where='w.wickets > 0', order='w.wickets desc, w.runs asc', note=NOTE_DEBUT, intl=True, id='best-figures-innings-debut')
L(W, 'Best figures in a match on debut', 'wmd', where='w.wickets > 0', order='w.wickets desc, w.runs asc', note=NOTE_DEBUT, intl=True, id='best-figures-match-debut')
L(W, 'Wicket with first ball in career', 'fbd', names=['Bowler', 'Batter', 'Match', 'Location', 'Season'], order='o.start_date desc', limit=100, note=NOTE_DEBUT, intl=True, id='wicket-first-ball-career')
L(P, 'Highest partnership by debutants', 'ptd', order='p.runs desc', note='Both batters playing their first match. ' + NOTE_DEBUT, intl=True, id='highest-partnership-debutants')
L(B, 'Youngest player to score a hundred', 'bia', where='b.runs >= 100 and b.age is not null', order='b.age asc, b.start_date', note=NOTE_AGE, id='youngest-hundred')
L(B, 'Youngest player to score a double hundred', 'bia', where='b.runs >= 200 and b.age is not null', order='b.age asc, b.start_date', note=NOTE_AGE, id='youngest-double-hundred')
L(B, 'Youngest player to score a triple hundred', 'bia', where='b.runs >= 300 and b.age is not null', order='b.age asc, b.start_date', note=NOTE_AGE, id='youngest-triple-hundred')
L(B, 'Oldest player to score a hundred', 'bia', where='b.runs >= 100 and b.age is not null', order='b.age desc, b.start_date', note=NOTE_AGE, id='oldest-hundred')
L(B, 'Oldest player to score a maiden hundred', 'bia', where='b.first_h100 and b.age is not null and b.player_id in (select player_id from dbm)', order='b.age desc, b.start_date', note=NOTE_AGE + ' ' + NOTE_DEBUT, intl=True, id='oldest-maiden-hundred')
L(W, 'Youngest player to take five-wickets-in-an-innings', 'bwa', where='w.wickets >= 5 and w.age is not null', order='w.age asc, w.start_date', note=NOTE_AGE, id='youngest-five-wickets')
L(W, 'Oldest player to take five-wickets-in-an-innings', 'bwa', where='w.wickets >= 5 and w.age is not null', order='w.age desc, w.start_date', note=NOTE_AGE, id='oldest-five-wickets')
L(W, 'Oldest player to take a maiden five-wickets-in-an-innings', 'bwa', where='w.first_w5 and w.age is not null and w.player_id in (select player_id from dbm)', order='w.age desc, w.start_date', note=NOTE_AGE + ' ' + NOTE_DEBUT, intl=True, id='oldest-maiden-five-wickets')
L(W, 'Youngest player to take ten-wickets-in-a-match', 'wma', where='w.wickets >= 10 and a.age is not null', order='a.age asc, w.start_date', note=NOTE_AGE, id='youngest-ten-wickets')
L(W, 'Oldest player to take ten-wickets-in-a-match', 'wma', where='w.wickets >= 10 and a.age is not null', order='a.age desc, w.start_date', note=NOTE_AGE, id='oldest-ten-wickets')
L(I, 'Youngest players', 'agd', order='a.age asc, a.start_date', note=NOTE_AGE + ' ' + NOTE_DEBUT + ' Age at debut.', intl=True, id='youngest-players')
L(I, 'Oldest players on debut', 'agd', order='a.age desc, a.start_date', note=NOTE_AGE + ' ' + NOTE_DEBUT, intl=True, id='oldest-players-debut')
L(I, 'Oldest players', 'ago', order='a.age desc, a.start_date', note=NOTE_AGE + ' Each player once, at their oldest appearance.', id='oldest-players')
L(I, 'Longest careers', 'car', order='f.d2 - f.d1 desc', note='First match to last match in the data. ' + NOTE_DEBUT, intl=True, id='longest-careers')
L(I, 'Longest intervals between appearances', 'gap', order='g.days desc', note='Time between two matches of a player.', id='longest-intervals')
L(I, 'Most consecutive matches missed for a team between appearances', 'gapt', order='g.missed desc, g.days desc', note='Matches of the team played between two appearances of the player.', id='matches-missed-for-team')
L(I, 'Most consecutive matches for a team', 'pstr', order='g.n desc, g.d2 desc', id='most-consecutive-matches-team')
L(I, 'Representing two countries', 'pteam', order='sum(c.mat) over (partition by c.player_id) desc, c.player_id, c.mat desc', limit=200, note='Players who appeared for more than one team, with their record for each.', id='representing-two-countries')

for _n in list(range(1000, 18001, 1000)) + [2500, 3500]:
    if f'batting|Fastest to {_n} runs' in CI:
        L(B, f'Fastest to {_n} runs', 'bcum', where=f'c.cum >= {_n} and c.cum - c.runs < {_n}', order='c.inn_n, date_diff(\'day\', c.d1, c.start_date)', note='Players whose debut is in the data. ' + NOTE_DEBUT, intl=True, id=f'fastest-to-{_n}-runs')
for _n in range(50, 851, 50):
    if f'bowling|Fastest to {_n} wickets' in CI:
        L(W, f'Fastest to {_n} wickets', 'wcum', where=f'c.cum >= {_n} and c.cum - c.wickets < {_n}', order='c.mat_n, date_diff(\'day\', c.d1, c.start_date)', note='Players whose debut is in the data. ' + NOTE_DEBUT, intl=True, id=f'fastest-to-{_n}-wickets')

L(T, 'Winning on the last ball of the match', 'tm', where='m.last_ball', order='m.start_date desc', limit=100, note='A chase that reached the target with the last ball of the innings.', id='win-on-last-ball')
L(T, 'Victory reaching target after declaration', 'tm', where='m.win_wkts is not null and m.odecl and m.wscore is not null', order='m.start_date desc', limit=100, hl='Margin', note='A side chased a target set by a declaration.', id='win-after-declaration')
L(W, 'Bowlers unchanged in a completed innings', 'buc', order='o.start_date desc', limit=100, note='Only two bowlers bowled the whole completed innings.', id='bowlers-unchanged')
L(W, 'Most consecutive ten-wickets-in-a-match', 'wms', where='s.n >= 2', order='s.n desc, s.d_last desc', id='consecutive-ten-wickets')
L(B, 'Cricket World Cup - Fastest Hundreds', 'bi', where="b.balls_to_100 is not null and b.tk in ('odi-world-cup-male', 'odi-world-cup-female')", order='b.balls_to_100 asc, b.runs desc', hl='Balls', over={'Balls': ('num', 'b.balls_to_100')}, intl=True, id='cwc-fastest-hundreds')
L(B, 'Cricket World Cup - Fastest fifties', 'bi', where="b.balls_to_50 is not null and b.tk in ('odi-world-cup-male', 'odi-world-cup-female')", order='b.balls_to_50 asc, b.runs desc', hl='Balls', over={'Balls': ('num', 'b.balls_to_50')}, intl=True, id='cwc-fastest-fifties')
L(B, 'T20 World Cup - Fastest Hundreds', 'bi', where="b.balls_to_100 is not null and b.tk in ('t20-world-cup-male', 't20-world-cup-female')", order='b.balls_to_100 asc, b.runs desc', hl='Balls', over={'Balls': ('num', 'b.balls_to_100')}, intl=True, id='t20wc-fastest-hundreds')
L(B, 'T20 World Cup - Fastest Fifties', 'bi', where="b.balls_to_50 is not null and b.tk in ('t20-world-cup-male', 't20-world-cup-female')", order='b.balls_to_50 asc, b.runs desc', hl='Balls', over={'Balls': ('num', 'b.balls_to_50')}, intl=True, id='t20wc-fastest-fifties')
L(W, 'World Cup Hat-tricks', 'hat', where="o.tk in ('odi-world-cup-male', 'odi-world-cup-female')", order='o.start_date desc', intl=True, id='cwc-hat-tricks')
L(W, 'T20 World Cup - Hat-tricks', 'hat', where="o.tk in ('t20-world-cup-male', 't20-world-cup-female')", order='o.start_date desc', intl=True, id='t20wc-hat-tricks')

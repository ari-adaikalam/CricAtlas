import { describe, expect, it } from 'vitest';
import { cachedRows, questionHash, rememberAnswers, rememberResult } from '../queryCache';
import { setPlayer } from '../store';

describe('question hash', () => {
  it('is the same for the same question and differs when anything in it differs', () => {
    const a = questionHash(['balls_by_batter.parquet'], 'select 1 where x = ?', ['ba607b88', 2]);
    expect(questionHash(['balls_by_batter.parquet'], 'select 1 where x = ?', ['ba607b88', 2])).toBe(a);
    expect(questionHash(['balls_by_batter.parquet'], 'select 1 where x = ?', ['ba607b88', 3])).not.toBe(a);
    expect(questionHash(['balls_by_bowler.parquet'], 'select 1 where x = ?', ['ba607b88', 2])).not.toBe(a);
    expect(questionHash(['balls_by_batter.parquet'], 'select 2 where x = ?', ['ba607b88', 2])).not.toBe(a);
  });
  it('is a short string', () => expect(questionHash(['a'], 'b', []).length).toBeLessThan(14));
});

describe('recorded answers', () => {
  const files = ['balls_by_batter.parquet'] as const;
  const sql = 'select count(*) as n from t';
  it('answers a recorded question for the current player with a copy', () => {
    rememberAnswers('aaaaaaaa', [[questionHash(files, sql, ['aaaaaaaa']), [{ n: 5 }]]]);
    setPlayer('aaaaaaaa');
    const got = cachedRows(files, sql, ['aaaaaaaa']);
    expect(got).toEqual([{ n: 5 }]);
    (got![0] as { n: number }).n = 99;
    expect(cachedRows(files, sql, ['aaaaaaaa'])).toEqual([{ n: 5 }]);
  });
  it('does not answer an unrecorded question or another player', () => {
    setPlayer('aaaaaaaa');
    expect(cachedRows(files, 'select 2', ['aaaaaaaa'])).toBeUndefined();
    setPlayer('bbbbbbbb');
    expect(cachedRows(files, sql, ['aaaaaaaa'])).toBeUndefined();
  });
  it('keeps only the newest few players', () => {
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) rememberAnswers(id, [[questionHash(files, sql, [id]), [{ n: 1 }]]]);
    setPlayer('c1'); expect(cachedRows(files, sql, ['c1'])).toBeUndefined();
    setPlayer('c5'); expect(cachedRows(files, sql, ['c5'])).toEqual([{ n: 1 }]);
  });
});

describe('answers kept from the engine', () => {
  const files = ['bat_innings.parquet'] as const;
  const sql = 'select n from t';
  it('are not changed by the loader that asked for them (the Form loader reverses its rows in place)', () => {
    const rows = [{ n: 1 }, { n: 2 }, { n: 3 }];
    rememberResult('bbbbbbbb', files, sql, [], rows);
    rows.reverse();
    setPlayer('bbbbbbbb');
    expect(cachedRows(files, sql, [])).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });
  it('are not kept when there are too many rows', () => {
    rememberResult('bbbbbbbb', files, 'select big', [], Array.from({ length: 4001 }, (_, n) => ({ n })));
    expect(cachedRows(files, 'select big', [])).toBeUndefined();
  });
});

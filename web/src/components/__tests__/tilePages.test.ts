import { describe, expect, it } from 'vitest';
import { loneHalves, landingPage, markerFor, pageStart, pageTiles, startMarker, stepTo, swipeTarget, tipText } from '../TileCarousel';

// H is a half tile, W a wide one. The patterns of the player page views at 2026-10-21.
const row = (p: string): boolean[] => [...p].map((c) => c === 'W');
const BOWLING = row('HHHHHHHWWWHHHHHHHH'); // 7 half, 3 wide (Batters faced, Opponent phases, Pitch map), 8 half
const BATTING = row('HHHHHHWWWWWHHHHHHH');
const RECORDS = row('HHHWWHH');
// The Match analysis rows at stage 3: a limited-overs match and a Test.
const ANALYSIS = row('HHHWWW');
const ANALYSIS_TEST = row('HHHHWWW');

describe('the page that shows a tile', () => {
  it('a wide tile is its own page', () => {
    expect(pageStart(BOWLING, 9)).toBe(9);
    expect(pageTiles(BOWLING, 9)).toEqual([9]);
  });
  it('a half tile starts a pair with the half tile after it', () => {
    expect(pageStart(BOWLING, 10)).toBe(10); // Length by phase, with Line and length
    expect(pageTiles(BOWLING, 10)).toEqual([10, 11]);
    expect(pageStart(BOWLING, 11)).toBe(11); // Line and length, with Control: the row moves one
    expect(pageStart(BOWLING, 0)).toBe(0);
  });
  it('the last half tile before a wide tile is the second of a pair', () => {
    expect(pageStart(BOWLING, 6)).toBe(5); // Batters shows with By season
    expect(pageTiles(BOWLING, 5)).toEqual([5, 6]);
    expect(pageStart(RECORDS, 2)).toBe(1);
  });
  it('the last tile of a row is the second of a pair', () => {
    expect(pageStart(BOWLING, 17)).toBe(16);
    expect(pageStart(BATTING, 18)).toBe(17);
  });
});

describe('the round buttons', () => {
  it('step one tile, and the marker goes on the new tile', () => {
    expect(stepTo(BOWLING, [0, 1], 1)).toEqual({ start: 1, marker: 2 }); // Key numbers, Form -> Form, Progression
    expect(stepTo(BOWLING, [10, 11], 1)).toEqual({ start: 11, marker: 12 }); // Length by phase, Line and length -> Line and length, Control
    expect(stepTo(BOWLING, [11, 12], -1)).toEqual({ start: 10, marker: 10 });
  });
  it('from a pair to a wide tile, and back', () => {
    expect(stepTo(BOWLING, [5, 6], 1)).toEqual({ start: 7, marker: 7 }); // By season, Batters -> Batters faced
    expect(stepTo(BOWLING, [7], -1)).toEqual({ start: 5, marker: 6 }); // Batters faced -> By season, Batters: the marker on Batters
    expect(stepTo(BOWLING, [10, 11], -1)).toEqual({ start: 9, marker: 9 }); // -> Pitch map alone
  });
  it('from a wide tile to a pair, the marker goes on the next tile, the one beside where the row was', () => {
    expect(stepTo(BOWLING, [9], 1)).toEqual({ start: 10, marker: 10 }); // Pitch map -> Length by phase and Line and length, marker on Length by phase
  });
  it('does not go past the ends', () => {
    expect(stepTo(BOWLING, [0, 1], -1)).toBeNull();
    expect(stepTo(BOWLING, [16, 17], 1)).toBeNull();
  });
  it('markerFor takes the new tile nearest to where the row was', () => {
    expect(markerFor([10, 11], [9], 1)).toBe(10);
    expect(markerFor([5, 6], [7], -1)).toBe(6);
    expect(markerFor([11, 12], [10, 11], 1)).toBe(12);
  });
});

describe('a half tile with no half tile to pair with is not allowed', () => {
  it('finds none in the views as they are', () => {
    for (const p of [BOWLING, BATTING, RECORDS, row('WWWWWWW')]) expect(loneHalves(p)).toEqual([]);
  });
  it('finds a first half tile before a wide tile, and one between two wide tiles', () => {
    expect(loneHalves(row('HWWHH'))).toEqual([0]);
    expect(loneHalves(row('HHWHWHH'))).toEqual([3]);
    expect(loneHalves(row('HHHWH'))).toEqual([4]);
  });
  it('every pattern of up to 8 tiles: pageStart gives a page that holds the tile, and the marker of a step is in the page', () => {
    for (let len = 1; len <= 8; len++) for (let bits = 0; bits < 2 ** len; bits++) {
      const wide = Array.from({ length: len }, (_, k) => Boolean((bits >> k) & 1));
      for (let i = 0; i < len; i++) { const s = pageStart(wide, i); expect(pageTiles(wide, s)).toContain(i); }
      if (loneHalves(wide).length) continue; // an arrangement that is not allowed
      for (const dir of [1, -1] as const) for (let s = 0; s < len; s++) {
        const page = pageTiles(wide, pageStart(wide, s)); const to = stepTo(wide, page, dir);
        if (to) expect(pageTiles(wide, to.start)).toContain(to.marker);
      }
    }
  });
});

describe('the page a click shows', () => {
  it('a tile reached from its left is the right tile of its page', () => {
    expect(landingPage(BOWLING, 5, 1)).toBe(4); // By season, with Runs conceded
    expect(landingPage(BOWLING, 6, 1)).toBe(5); // Batters, with By season
    expect(landingPage(BOWLING, 0, 1)).toBe(0);
  });
  it('a tile reached from its right is the left tile of its page', () => {
    expect(landingPage(BOWLING, 5, -1)).toBe(5); // By season, with Batters
    expect(landingPage(BOWLING, 4, -1)).toBe(4);
  });
  it('a half tile with no partner on the wanted side takes the other side, and a wide tile is alone', () => {
    expect(landingPage(BOWLING, 6, -1)).toBe(5); // Batters is before a wide tile
    expect(landingPage(BOWLING, 10, 1)).toBe(10); // first half tile after a wide one
    expect(landingPage(BOWLING, 17, -1)).toBe(16); // the last tile of the row
    expect(landingPage(BOWLING, 8, 1)).toBe(8);
  });
});

describe('the Match analysis rows', () => {
  it('have no half tile standing alone', () => {
    // with The story (stage 5): two or three story tiles and the three flow tiles, then the wide tiles
    for (const story of [2, 3]) expect(loneHalves(row('H'.repeat(story + 3) + 'W'.repeat(8)))).toEqual([]);
    expect(loneHalves(ANALYSIS)).toEqual([]);
    expect(loneHalves(ANALYSIS_TEST)).toEqual([]);
  });
});

describe('tipText', () => {
  it('keeps only the first sentence of a tip', () => {
    expect(tipText('Real innings played back ball by ball. Pick one below the chart to play it.')).toBe('Real innings played back ball by ball.');
    expect(tipText('Reviews by each side. Upheld: the review succeeded. Struck down: it failed.')).toBe('Reviews by each side.');
  });
  it('leaves a one sentence tip as it is, and a number with a point inside it', () => {
    expect(tipText('Titles and finals in every tournament.')).toBe('Titles and finals in every tournament.');
    expect(tipText('Economy is 7.5 an over in the latest 30 innings.')).toBe('Economy is 7.5 an over in the latest 30 innings.');
  });
  it('puts the marker of a row at its start on the last tile on screen, however the first measurements arrived', () => {
    // Two tiles measured first and a third a moment later, and all three at once, end on the same tile (found 2026-10-25: the marker landed on the first tile in about one load in twelve).
    expect(startMarker([0, 1])).toBe(1);
    expect(startMarker([0, 1, 2])).toBe(2);
    expect(startMarker([0])).toBe(0);
    expect(startMarker([])).toBe(0);
  });
  it('ends a phone swipe on one tile at most from where it began', () => {
    const step = 428;
    expect(swipeTarget(0, 60, 0, step, 6)).toBe(0); // a short drag comes back
    expect(swipeTarget(0, 250, 0.2, step, 6)).toBe(1); // a drag past halfway goes on
    expect(swipeTarget(0, 300, 5, step, 6)).toBe(1); // a hard flick still moves one tile
    expect(swipeTarget(856, 700, -1, step, 6)).toBe(1); // back one tile
    expect(swipeTarget(856, 100, -9, step, 6)).toBe(1); // never two
    expect(swipeTarget(0, -50, -1, step, 6)).toBe(0); // not before the first
    expect(swipeTarget(5 * 428, 5 * 428 + 200, 2, step, 6)).toBe(5); // not after the last
  });
});

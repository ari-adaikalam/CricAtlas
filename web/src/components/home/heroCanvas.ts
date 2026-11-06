import { oversText, type Replay } from '@/domain/homeReplay';

// The run chart of the hero, drawn on a canvas ball by ball (mockups/home-page). Colours come from the batting team (its colour for the team line, the second one from sideColours for the batter), white for sixes and wickets. The wagon wheel is the
// app's own (components/wagon).

export interface HeroColours { team: string; hero: string }

const INK = '#ddd', MUTED = '#8e8e8e';

export interface Surface { ctx: CanvasRenderingContext2D; w: number; h: number; font: string }

/** Runs through the innings: the team's runs and the batter's, wickets as ticks, boundaries as dots, milestones labelled with the balls faced, and the target as a dashed line. */
export function drawChart({ ctx: c, w, h, font }: Surface, r: Replay, ball: number, colours: HeroColours): void {
  const SKY = colours.team, GOLD = colours.hero;
  const top = 30, bottom = 34, left = Math.max(34, w * 0.045), right = Math.max(16, w * 0.02), pw = w - left - right, ph = h - top - bottom;
  const last = r.points[r.points.length - 1]!;
  const max = Math.max(last.team, r.target ?? 0) * 1.06;
  const ballsMax = Math.max(r.scheduledOvers * r.ballsPerOver, last.legal);
  const X = (legal: number): number => left + (legal / ballsMax) * pw;
  const Y = (v: number): number => top + ph - (v / max) * ph;
  c.font = `12px ${font}`; c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1;
  c.fillStyle = INK; c.font = `600 13px ${font}`; c.textAlign = 'left'; c.fillText('Runs through the innings', 6, 16);
  c.font = `12px ${font}`; c.fillStyle = MUTED;
  const step = r.scheduledOvers > 20 ? 10 : 5;
  for (let o = 0; o <= r.scheduledOvers; o += step) {
    const x = X(o * r.ballsPerOver);
    c.beginPath(); c.moveTo(x, top); c.lineTo(x, top + ph); c.stroke();
    c.textAlign = 'center'; c.fillText(String(o), x, top + ph + 16);
  }
  c.textAlign = 'left'; c.fillText('Overs', left, top + ph + 30);
  const nice = [10, 20, 25, 50, 100, 200].find((n) => max / n <= 5) ?? 200;
  c.textAlign = 'right';
  for (let v = 0; v <= max; v += nice) {
    const y = Y(v);
    c.beginPath(); c.moveTo(left, y); c.lineTo(left + pw, y); c.stroke();
    c.fillText(String(v), left - 8, y + 4);
  }
  c.textAlign = 'left';
  if (r.target) {
    c.setLineDash([6, 6]); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(left, Y(r.target)); c.lineTo(left + pw, Y(r.target)); c.stroke(); c.setLineDash([]);
    c.fillStyle = INK; c.textAlign = 'right'; c.fillText(`Target ${r.target}`, left + pw, Y(r.target) - 8); c.textAlign = 'left';
  }
  const pts = r.points.slice(0, ball + 1);
  const line = (key: 'team' | 'hero', colour: string, width: number): void => {
    const path = (): void => { c.beginPath(); pts.forEach((p, i) => { const x = X(p.legal), y = Y(p[key]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); };
    path();
    const end = pts[pts.length - 1]!;
    c.lineTo(X(end.legal), Y(0)); c.lineTo(X(pts[0]!.legal), Y(0)); c.closePath();
    const g = c.createLinearGradient(0, top, 0, top + ph); g.addColorStop(0, `${colour}55`); g.addColorStop(1, `${colour}00`); c.fillStyle = g; c.fill();
    path(); c.strokeStyle = colour; c.lineWidth = width; c.lineJoin = 'round'; c.stroke();
  };
  line('team', SKY, 3); line('hero', GOLD, 4);
  pts.forEach((p) => { if (p.boundary) { c.fillStyle = p.boundary === 6 ? '#fff' : GOLD; c.beginPath(); c.arc(X(p.legal), Y(p.hero), p.boundary === 6 ? 5 : 3.5, 0, 7); c.fill(); } });
  pts.forEach((p, i) => {
    if (i && p.wkts > pts[i - 1]!.wkts) { const x = X(p.legal), y = Y(p.team); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x, y + 9); c.stroke(); }
  });
  for (const [m, k] of r.milestones) {
    if (k > ball) continue;
    const p = r.points[k]!, x = X(p.legal), y = Y(p.hero);
    c.font = `600 12px ${font}`; c.textAlign = 'center';
    // A dark outline keeps the label readable where it crosses the team's line.
    c.lineWidth = 4; c.strokeStyle = '#141414'; c.lineJoin = 'round'; c.strokeText(`${m} off ${p.faced}`, x, y - 14);
    c.fillStyle = GOLD; c.fillText(`${m} off ${p.faced}`, x, y - 14);
    c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); c.textAlign = 'left';
  }
  const p = pts[pts.length - 1]!;
  c.fillStyle = '#fff'; c.beginPath(); c.arc(X(p.legal), Y(p.hero), 5, 0, 7); c.fill();
}

/** The two live readouts: the batter's runs, balls and strike rate, and the team's score and overs (with the target in a chase). */
export function readouts(r: Replay, ball: number): { hero: string; heroNote: string; team: string; teamNote: string } {
  const p = r.points[ball]!, finished = ball >= r.points.length - 1;
  return {
    hero: `${p.hero}${finished && !r.heroOut ? '*' : ''}`,
    heroNote: `${p.faced} balls, SR ${p.faced ? ((p.hero / p.faced) * 100).toFixed(0) : '-'}`,
    team: `${p.team}/${p.wkts}`,
    teamNote: `${oversText(p.legal, r.ballsPerOver)} ov${r.target ? `, target ${r.target}` : ''}`,
  };
}

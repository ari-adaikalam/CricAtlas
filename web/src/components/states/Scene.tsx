import { BALL_INNER, LINE_INNER } from './ballArt';
import s from './states.module.css';

export type StateKind = 'loading' | 'notfound' | 'error' | 'empty';
export type SceneKind = Exclude<StateKind, 'loading'>;

// The outline's paths are marked class "ln" in ballArt. Swap in this module's hashed class name.
const OUTLINE = LINE_INNER.replaceAll('class="ln"', `class="${s.ln}"`);

const Ball = ({ x, y, size }: { x: number; y: number; size: number }) => (
  <g transform={`translate(${x} ${y}) scale(${size / 100})`} dangerouslySetInnerHTML={{ __html: BALL_INNER }} />
);

function Stumps({ x, top, height, falling }: { x: number; top: number; height: number; falling: boolean }) {
  const join = (...names: Array<string | undefined>): string => names.filter(Boolean).join(' ');
  const stump = (dx: number, tilt: string | undefined) => <rect key={dx} className={falling ? join(s.stump, tilt) : undefined} x={x + dx} y={top} width="5" height={height} rx="1.5" fill="#f4f4f4" />;
  return (
    <g>
      {stump(0, s.s1)}{stump(9, s.s2)}{stump(18, s.s3)}
      <rect className={falling ? join(s.bail, s.b1) : undefined} x={x + 1} y={top - 4} width="10" height="3" rx="1.2" fill="#EBC862" />
      <rect className={falling ? join(s.bail, s.b2) : undefined} x={x + 12} y={top - 4} width="10" height="3" rx="1.2" fill="#EBC862" />
    </g>
  );
}

/** The loading ball, small, for the line before the headline. Decorative, the words beside it carry the meaning. */
export function BallLoader() {
  return (
    <span className={s.loader} aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <g className={`${s.spinner} ${s.lSpin}`}><g className={s.lFill} dangerouslySetInnerHTML={{ __html: BALL_INNER }} /></g>
        <g className={s.lOutline} dangerouslySetInnerHTML={{ __html: OUTLINE }} />
      </svg>
    </span>
  );
}

/** One framed illustration per state. Decorative: the headline and text beside it carry the meaning. */
export function Scene({ kind }: { kind: SceneKind }) {
  return (
    <div className={s.scene} aria-hidden="true">
      <svg viewBox="0 0 300 170">
        {kind === 'notfound' && (
          <>
            <rect width="300" height="170" fill="#17321f" />
            <rect x="104" width="92" height="170" fill="#C7B98E" opacity=".9" />
            <line x1="104" x2="196" y1="30" y2="30" stroke="#fff" strokeWidth="1.5" />
            <Stumps x={139} top={40} height={26} falling={false} />
            <g className={s.roll}><g className={`${s.spinner} ${s.wideSpin}`}><Ball x={139} y={139} size={22} /></g></g>
            <text className={s.wideText} x="244" y="86" fill="#EBC862" fontSize="15" fontWeight="600" textAnchor="middle">wide!</text>
          </>
        )}
        {kind === 'error' && (
          <>
            <rect width="300" height="170" fill="#101214" />
            <rect y="128" width="300" height="42" fill="#17321f" />
            <rect y="126" width="300" height="3" fill="#C7B98E" />
            <Stumps x={204} top={78} height={48} falling />
            <g className={s.hit}><g className={`${s.spinner} ${s.hitSpin}`}><Ball x={30} y={102} size={24} /></g></g>
          </>
        )}
        {kind === 'empty' && (
          <>
            <rect width="300" height="170" fill="#101214" />
            <rect className={s.dash} x="30" y="22" width="240" height="126" rx="8" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="1.5" strokeDasharray="8 6" />
            <ellipse className={s.shadow} cx="150" cy="118" rx="18" ry="4" fill="#000" opacity=".55" />
            <g className={s.bob}><Ball x={132} y={76} size={36} /></g>
          </>
        )}
      </svg>
    </div>
  );
}

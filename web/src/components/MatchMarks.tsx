import type { SubMark } from '@/domain/match';

/** A coin beside the name of the side that won the toss. */
export function TossCoin({ decision }: { decision: string }) {
  const label = `Won the toss and chose to ${decision}`;
  return (
    <svg className="coin" viewBox="0 0 20 20" width="16" height="16" role="img" aria-label={label}>
      <title>{label}</title>
      <circle cx="10" cy="10" r="9" fill="#EBC862" /><circle cx="10" cy="10" r="6.4" fill="none" stroke="#9A7B1C" strokeWidth="1.4" />
      <path d="M7.4 7.6h5.2M10 7.6v5.4" stroke="#7A5F10" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** A green arrow beside a player who came in, a red one beside a player who went out (an impact player, a concussion substitute, a supersub). */
// The class is sub-in and sub-out, never a bare `in`: the ported mockup stylesheet has a card class called `in`.
export function SubArrow({ mark }: { mark: SubMark }) {
  const into = mark.dir === 'in';
  return (
    <svg className={`sub sub-${mark.dir}`} viewBox="0 0 16 16" width="13" height="13" role="img" aria-label={mark.title}>
      <title>{mark.title}</title>
      <path d={into ? 'M8 14V3M3.5 7.5L8 3l4.5 4.5' : 'M8 2v11M3.5 8.5L8 13l4.5-4.5'} fill="none" stroke={into ? '#3FBF6B' : '#E5484D'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

'use client';

import { useId } from 'react';
import { useEmblemStyle } from '@/data/emblemStyle';
import { emblemFacts, emblemInk, type EmblemStyle } from '@/domain/emblem';

/** A team's generated emblem in its colours. `size` is in pixels. */
export function TeamEmblem({ team, size = 48, style }: { team: string; size?: number; style?: EmblemStyle }) {
  const saved = useEmblemStyle();
  const kind = style ?? saved;
  const t = emblemFacts(team);
  const id = useId();
  const long = t.short.length > 3;
  const label = `${t.name} emblem`;
  const common = { viewBox: '0 0 120 120', width: size, height: size, role: 'img', 'aria-label': label, className: 'emblem' } as const;
  const text = (y: number, fontSize: number, fill: string) => (
    <text x="60" y={y} textAnchor="middle" fontFamily="Outfit,sans-serif" fontWeight="700" fontSize={fontSize} fill={fill} letterSpacing="1">{t.short}</text>
  );
  if (kind === 'B') {
    return (
      <svg {...common}>
        <circle cx="60" cy="60" r="56" fill={t.c2} /><circle cx="60" cy="60" r="46" fill={t.c1} />
        <path d="M17 42 C27 52 27 68 17 78" fill="none" stroke={t.c3} strokeWidth="3" strokeDasharray="4 5" strokeLinecap="round" opacity=".95" />
        <path d="M103 42 C93 52 93 68 103 78" fill="none" stroke={t.c3} strokeWidth="3" strokeDasharray="4 5" strokeLinecap="round" opacity=".95" />
        <circle cx="60" cy="60" r="56" fill="none" stroke={t.c3} strokeWidth="2.5" />
        {text(68, long ? 21 : 27, emblemInk(t.c1))}
      </svg>
    );
  }
  if (kind === 'D') {
    const clip = `${id}-clip`;
    return (
      <svg {...common}>
        <defs><clipPath id={clip}><circle cx="60" cy="60" r="54" /></clipPath></defs>
        <circle cx="60" cy="60" r="54" fill={t.c1} />
        <g clipPath={`url(#${clip})`}><path d="M60 8 C48 34 48 86 60 112 L130 112 L130 0 L60 0 Z" fill={t.c2} /></g>
        <path d="M60 8 C48 34 48 86 60 112" fill="none" stroke={t.c3} strokeWidth="3" strokeDasharray="4 5" strokeLinecap="round" />
        <circle cx="60" cy="60" r="54" fill="none" stroke={t.c3} strokeWidth="3" />
        <rect x="22" y="40" width="76" height="40" rx="8" fill="#141414" opacity=".78" />
        {text(68, long ? 19 : 26, '#FFFFFF')}
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="8" y="8" width="104" height="104" rx="22" fill={t.c1} />
      <rect x="8" y="8" width="104" height="104" rx="22" fill="none" stroke={t.c3} strokeWidth="3" />
      <g fill={t.c2}><rect x="38" y="66" width="8" height="38" rx="3" /><rect x="56" y="66" width="8" height="38" rx="3" /><rect x="74" y="66" width="8" height="38" rx="3" /></g>
      <g fill={t.c3}><rect x="38" y="60" width="26" height="5" rx="2.5" /><rect x="56" y="60" width="26" height="5" rx="2.5" /></g>
      {text(50, long ? 22 : 30, emblemInk(t.c1))}
    </svg>
  );
}

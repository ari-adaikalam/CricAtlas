import { BUILDER } from '@/domain/builder';

/** The line at the foot of every page: who built the app, where the data comes from, and a caution (Ari, 2026-10-24). */
export function SiteCredit() {
  return (
    <>
      {/* The full line at every width but a phone, where one short line fits the screen (phone.css). */}
      <span className="cr-full">
        Built by{' '}
        <a className="builder" href={BUILDER.portfolio} target="_blank" rel="noopener noreferrer">{BUILDER.name}</a>.
        {' '}Ball-by-ball data from{' '}
        <a className="builder" href={BUILDER.cricsheet} target="_blank" rel="noopener noreferrer">Cricsheet</a>{' '}(ODC-BY). Data might not be accurate.
      </span>
      <span className="cr-short">
        Built by{' '}
        <a className="builder" href={BUILDER.portfolio} target="_blank" rel="noopener noreferrer">{BUILDER.name}</a>.
        {' '}Data from{' '}
        <a className="builder" href={BUILDER.cricsheet} target="_blank" rel="noopener noreferrer">Cricsheet</a>{' '}(ODC-BY). May be inaccurate.
      </span>
    </>
  );
}

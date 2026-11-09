import { FORMAT_LABEL, editionOptions, formatsOf, stageOptions, teamOptions, venueOptions, type Fmt, type TFilters, type TMatch } from '@/domain/tournament';

interface Props { ms: readonly TMatch[]; filters: TFilters; onChange: (next: TFilters) => void }

/** Format (only when the tournament has more than one), Stage and Edition in the strip. Edition options with no matches in the chosen Format are greyed, and so are stages the edition did not use. */
export function TournamentFilterBar({ ms, filters, onChange }: Props) {
  const formats = formatsOf(ms);
  const editions = editionOptions(ms, filters.format);
  const stages = stageOptions(ms, filters.format, filters.edition);
  const known = new Set(editions.map((e) => e.edition));
  // The Stage box is as wide as the longest stage name of this tournament in any edition, so choosing an edition does not change its width. Only the greyed '(no matches)' form of a stage can still make it wider, and only for the editions that lack that stage.
  const widest = stageOptions(ms, filters.format, null).map((s) => s.label).reduce((a, b) => (b.length > a.length ? b : a), '');
  return (
    <div className="filters mini" role="group" aria-label="Filters">
      {formats.length > 1 && (
        <label className="fl"><span>Format</span>
          <select value={filters.format} onChange={(e) => onChange({ ...filters, format: e.target.value as Fmt })}>
            {formats.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
          </select>
        </label>
      )}
      <label className="fl fsz"><span>Stage</span>
        <select value={filters.stage} onChange={(e) => onChange({ ...filters, stage: e.target.value })}>
          {stages.map((s) => <option key={s.value} value={s.value} disabled={s.matches === 0}>{s.label}{s.matches === 0 ? ' (no matches)' : ''}</option>)}
        </select>
        <i className="fsz-t" aria-hidden="true">{widest}</i>
      </label>
      <label className="fl"><span>Edition</span>
        <select value={filters.edition ?? ''} onChange={(e) => onChange({ ...filters, edition: e.target.value || null })}>
          <option value="">All editions</option>
          {editions.map((e) => <option key={e.edition} value={e.edition}>{e.label}</option>)}
          {filters.edition && !known.has(filters.edition) && <option value={filters.edition}>{filters.edition}</option>}
        </select>
      </label>
    </div>
  );
}

/** The second row of every view: Team and Venue, with the number of matches under all the filters and a way to clear the two. */
export function TournamentScopeBar({ ms, filters, count, onChange }: { ms: readonly TMatch[]; filters: TFilters; count: number; onChange: (next: TFilters) => void }) {
  const teams = teamOptions(ms, filters);
  const venues = venueOptions(ms, filters);
  const any = filters.team !== null || filters.venue !== null;
  return (
    <div className="bfbar">
      <label className="fl2"><span>Team</span>
        <select data-bf="type" aria-label="Team" value={filters.team ?? ''} onChange={(e) => onChange({ ...filters, team: e.target.value || null })}>
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.matches})</option>)}
        </select>
      </label>
      <label className="fl2"><span>Venue</span>
        <select data-bf="type" aria-label="Venue" value={filters.venue ?? ''} onChange={(e) => onChange({ ...filters, venue: e.target.value || null })}>
          <option value="">All venues</option>
          {venues.map((v) => <option key={v.value} value={v.value}>{v.value} ({v.matches})</option>)}
        </select>
      </label>
      <span className="bfn"><b>{count.toLocaleString('en')}</b> {count === 1 ? 'match' : 'matches'}{any && <> <button type="button" className="mini" onClick={() => onChange({ ...filters, team: null, venue: null })}>Clear</button></>}</span>
    </div>
  );
}

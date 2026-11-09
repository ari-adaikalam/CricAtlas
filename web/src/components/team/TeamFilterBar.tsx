import { FORMAT_NAME, type FormatChoice } from '@/domain/filters';
import { chooseCompetition, chooseFormat, competitionOptions, formatOptions, opponentOptions, seasonOptions, venueOptions, type TeamFilters, type TeamMatch } from '@/domain/team';

interface Props {
  ms: readonly TeamMatch[];
  filters: TeamFilters;
  national: boolean;
  /** The Bat, bowl and field view cannot show International, because rates differ between the formats. */
  noIntl: boolean;
  onChange: (next: TeamFilters) => void;
  disabled?: boolean;
}

/** Format, Competition and Season in the strip, as on the player page. Choosing a competition moves Format to one that has its matches, and a choice made before it that has no matches under it is dropped. */
export function TeamFilterBar({ ms, filters, national, noIntl, onChange, disabled = false }: Props) {
  const formats = formatOptions(ms, filters.format);
  const competitions = competitionOptions(ms, filters.format);
  const seasons = seasonOptions(ms, filters, national);
  return (
    <div className="filters mini" role="group" aria-label="Filters">
      <label className="fl"><span>Format</span>
        <select disabled={disabled} value={filters.format} onChange={(e) => onChange(chooseFormat(e.target.value as FormatChoice))}>
          {formats.map((o) => {
            const blocked = o.disabled || (noIntl && o.format === 'INTERNATIONAL');
            return <option key={o.format} value={o.format} disabled={blocked} title={o.format === 'INTERNATIONAL' && noIntl ? 'Rates differ between Tests, ODIs and T20Is, so pick one format here' : undefined}>{FORMAT_NAME[o.format]}</option>;
          })}
        </select>
      </label>
      <label className="fl"><span>Competition</span>
        <select disabled={disabled} value={filters.competition ?? ''} onChange={(e) => onChange(chooseCompetition(ms, filters, e.target.value || null))}>
          <option value="">All competitions</option>
          {competitions.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
        </select>
      </label>
      <label className="fl"><span>Season</span>
        <select disabled={disabled} value={filters.season ?? ''} onChange={(e) => onChange({ ...filters, season: e.target.value || null, opponent: null, venue: null })}>
          <option value="">All time</option>
          {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
    </div>
  );
}

/** The second row of every view: Opponent and Venue, with the number of matches under all the filters and a way to clear the two. */
export function TeamScopeBar({ ms, filters, national, count, onChange }: { ms: readonly TeamMatch[]; filters: TeamFilters; national: boolean; count: number; onChange: (next: TeamFilters) => void }) {
  const opponents = opponentOptions(ms, filters, national);
  const venues = venueOptions(ms, { ...filters, venue: filters.venue }, national);
  const any = filters.opponent !== null || filters.venue !== null;
  return (
    <div className="bfbar">
      <label className="fl2"><span>Opponent</span>
        <select data-bf="type" aria-label="Opponent" value={filters.opponent ?? ''} onChange={(e) => onChange({ ...filters, opponent: e.target.value || null })}>
          <option value="">All opponents</option>
          {opponents.map((o) => <option key={o.value} value={o.value}>{o.name} ({o.matches})</option>)}
          {filters.opponent && !opponents.some((o) => o.value === filters.opponent) && <option value={filters.opponent}>{filters.opponent}</option>}
        </select>
      </label>
      <label className="fl2"><span>Venue</span>
        <select data-bf="type" aria-label="Venue" value={filters.venue ?? ''} onChange={(e) => onChange({ ...filters, venue: e.target.value || null })}>
          <option value="">All venues</option>
          {venues.map((o) => <option key={o.value} value={o.value}>{o.name} ({o.matches})</option>)}
        </select>
      </label>
      <span className="bfn"><b>{count.toLocaleString('en')}</b> {count === 1 ? 'match' : 'matches'}{any && <> <button type="button" className="mini" onClick={() => onChange({ ...filters, opponent: null, venue: null })}>Clear</button></>}</span>
    </div>
  );
}

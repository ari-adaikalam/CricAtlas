import { chooseCompetition, chooseFormat, competitionOptions, formatOptions, seasonOptions, type PlayerFilters } from '@/domain/filters';
import type { SummaryRow } from '@/domain/batting';
import { formatLabel } from '@/domain/labels';

interface Props {
  rows: readonly SummaryRow[];
  filters: PlayerFilters;
  /** Analysis views cannot show International, because rates differ between the international formats. */
  analysis: boolean;
  onChange: (next: PlayerFilters) => void;
  /** The next player is loading: the choices stay in view but cannot be changed. */
  disabled?: boolean;
}

/** Format, Competition and Season, as in the mockup's strip. Choosing a competition moves Format to one that has its matches. */
export function FilterBar({ rows, filters, analysis, onChange, disabled = false }: Props) {
  const formats = formatOptions(rows, filters.format);
  const competitions = competitionOptions(rows, filters.format);
  const seasons = seasonOptions(rows, filters.format, filters.competition);
  return (
    <div className="filters mini" role="group" aria-label="Filters">
      <label className="fl"><span>Format</span>
        <select disabled={disabled} value={filters.format} onChange={(e) => onChange(chooseFormat(e.target.value as PlayerFilters['format']))}>
          {formats.map((o) => {
            const blocked = o.disabled || (analysis && o.format === 'INTERNATIONAL');
            return <option key={o.format} value={o.format} disabled={blocked} title={o.format === 'INTERNATIONAL' && analysis ? 'Rates differ between Tests, ODIs and T20Is, so pick one format here' : undefined}>{formatLabel(o.format)}</option>;
          })}
        </select>
      </label>
      <label className="fl"><span>Competition</span>
        <select disabled={disabled} value={filters.competition ?? ''} onChange={(e) => onChange(chooseCompetition(rows, filters, e.target.value || null))}>
          <option value="">All competitions</option>
          {competitions.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
        </select>
      </label>
      <label className="fl"><span>Season</span>
        <select disabled={disabled} value={filters.season ?? ''} onChange={(e) => onChange({ ...filters, season: e.target.value || null })}>
          <option value="">Career</option>
          {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
    </div>
  );
}

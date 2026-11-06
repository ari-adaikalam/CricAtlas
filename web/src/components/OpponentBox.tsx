'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Opponent } from '@/data/scope';
import { sentence } from '@/domain/shotFilter';

const int = new Intl.NumberFormat('en');

interface Props {
  /** Bowler on the Batting view, Batter on the Bowling view. */
  label: 'Bowler' | 'Batter';
  /** null while the list loads. */
  opponents: readonly Opponent[] | null;
  value: string;
  onChange: (id: string) => void;
}

/**
 * The searchable list of the mockup: every opponent with their style and the balls, found by name or style. Escape closes it and Enter picks
 * the first match. Choosing one narrows every tile to that opponent.
 */
export function OpponentBox({ label, opponents, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const all = label === 'Bowler' ? 'All bowlers' : 'All batters';
  const plural = label === 'Bowler' ? 'bowlers' : 'batters';

  const found = useMemo(() => {
    const q = text.trim().toLowerCase();
    return (opponents ?? []).filter((o) => !q || o.name.toLowerCase().includes(q) || (o.style ?? '').toLowerCase().includes(q)).slice(0, 80);
  }, [opponents, text]);
  const current = opponents?.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  function pick(id: string) { onChange(id); setOpen(false); setText(''); button.current?.focus(); }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); button.current?.focus(); }
    if (e.key === 'Enter') { e.preventDefault(); const first = found[0]; if (first) pick(first.id); else if (!text) pick(''); }
  }

  return (
    <div className="cbx" ref={box} onKeyDown={onKey}>
      <span className="cbl">{label}</span>
      <button type="button" className="cbb" ref={button} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen((o) => !o); setText(''); }}>{current ? current.name : value ? 'Chosen' : all}</button>
      <div className="cbp" hidden={!open}>
        <input ref={input} type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Search ${plural}`} autoComplete="off" aria-label={`Search ${plural}`} />
        <div className="cbl2" role="listbox" aria-label={label}>
          <div className={`cbo${value === '' ? ' on' : ''}`} role="option" aria-selected={value === ''} onClick={() => pick('')}>{all}</div>
          {opponents === null ? <div className="cbn">Loading</div> : found.length === 0 ? <div className="cbn">No {label.toLowerCase()} found</div> : found.map((o) => (
            <div key={o.id} className={`cbo${value === o.id ? ' on' : ''}`} role="option" aria-selected={value === o.id} onClick={() => pick(o.id)}>
              <span>{o.name}</span><em>{o.style ? sentence(o.style) : 'Style not recorded'}, {int.format(o.balls)} balls</em>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

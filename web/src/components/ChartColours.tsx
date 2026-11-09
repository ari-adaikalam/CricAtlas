'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { View } from '@/domain/ballFilters';
import { chartColours, scopeTeamColour, type ChartColours, type ScopeTeam } from '@/domain/colours';
import type { PlayerFilters } from '@/domain/filters';
import { loadScopeTeams } from '@/data/scopeTeams';

const Context = createContext<ChartColours>(chartColours(null));

/** The two colours every chart below draws with. Outside a provider they are the fixed gold and sky. */
export const useChartColours = (): ChartColours => useContext(Context);

/**
 * Sets the chart colours from the player's team under the Format, Competition and Season choices. While the team loads, or if it cannot be read, the colours
 * come from the country, and then from the fixed pair, so a chart is never left without a colour.
 */
export function ChartColoursProvider({ playerId, filters, view, country, children }: { playerId: string; filters: PlayerFilters | null; view: View; country: string | null; children: ReactNode }) {
  const [teams, setTeams] = useState<ScopeTeam[]>([]);
  useEffect(() => {
    if (!filters) return;
    let cancelled = false;
    loadScopeTeams(playerId, filters, view)
      .then((found) => { if (!cancelled) setTeams(found); })
      .catch((error: unknown) => { console.error('Team colour failed to load', error); if (!cancelled) setTeams([]); });
    return () => { cancelled = true; };
  }, [playerId, filters, view]);
  const colours = chartColours(scopeTeamColour(teams, country));
  return <Context.Provider value={colours}>{children}</Context.Provider>;
}

/** Fixes the chart colours to a given team colour (the Match page draws each side's charts in its own colour). */
export function ChartColoursFor({ colour, children }: { colour: string | null; children: ReactNode }) {
  return <Context.Provider value={chartColours(colour)}>{children}</Context.Provider>;
}

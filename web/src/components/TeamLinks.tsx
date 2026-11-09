'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchTeamIndex, type TeamIndexRow } from '@/data/teamData';
import { EntityLink } from './EntityLink';
import { NameLink } from './NameLink';

// A team's name as a link (Ari, 2026-10-22). The Match page knows the id of both sides, so it gives them through TeamIds. The player page has team names only, so TeamRef looks a name up in the list of
// teams (t/index.json) with the player's gender; a name that matches no team, or more than one in a way it cannot tell apart, stays plain text.

const Ids = createContext<ReadonlyMap<string, string>>(new Map());
export const TeamIds = Ids.Provider;

/** A team of the page's match, as a link with the team menu. */
export function TeamLink({ name, children }: { name: string; children?: ReactNode }) {
  const id = useContext(Ids).get(name) ?? null;
  return <EntityLink entity={{ kind: 'team', id, name }}>{children ?? name}</EntityLink>;
}

const Gender = createContext<string | null>(null);
/** The gender of the player the page is about, so that "India" means the side that player played for. */
export const TeamGender = Gender.Provider;

let list: Promise<TeamIndexRow[]> | null = null;
function lookup(): Promise<Map<string, string>> {
  list ??= fetchTeamIndex();
  return list.then((rows) => {
    const best = new Map<string, TeamIndexRow>();
    for (const r of rows) {
      for (const name of [r.name, ...r.earlier]) {
        const key = `${name}|${r.gender}`;
        const have = best.get(key);
        if (!have || r.matches > have.matches) best.set(key, r);
      }
    }
    return new Map([...best].map(([k, r]) => [k, r.id]));
  });
}

let cached: Map<string, string> | null = null;
function useLookup(): Map<string, string> | null {
  const [map, setMap] = useState<Map<string, string> | null>(cached);
  useEffect(() => {
    if (cached) return;
    let live = true;
    lookup().then((m) => { cached = m; if (live) setMap(m); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return map;
}

/** A team named on the player page. `inRow` keeps the click of the name its own when the row around it does something. */
export function TeamRef({ name, id: known, inRow = false, children }: { name: string; /** The team's id when the data has it. Without one the name is looked up with the player's gender. */ id?: string | null; inRow?: boolean; children?: ReactNode }) {
  const gender = useContext(Gender);
  const map = useLookup();
  const id = known ? known : map ? (gender ? map.get(`${name}|${gender}`) : map.get(`${name}|male`) ?? map.get(`${name}|female`)) ?? null : null;
  const entity = { kind: 'team', id, name } as const;
  const text = children ?? name;
  return id === null ? <>{text}</> : inRow ? <NameLink entity={entity}>{text}</NameLink> : <EntityLink entity={entity}>{text}</EntityLink>;
}

/**
 * A label that starts with a team's name and goes on ("India bowling, 2nd innings", "Sri Lanka, 290"): the team's name is a link and the rest stays text. A label that does not start with
 * the team's name is left as it is.
 */
export function TeamLabel({ team, text }: { team: string; text: string }) {
  return text.startsWith(team) ? <><TeamLink name={team} />{text.slice(team.length)}</> : <>{text}</>;
}

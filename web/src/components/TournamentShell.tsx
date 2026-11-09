'use client';

import { AddressShell } from './useAddressShell';
import { TournamentView } from './TournamentView';
import { isTournamentKey } from '@/data/tournamentData';

export const TournamentShell = () => <AddressShell read={(slug) => (isTournamentKey(slug) ? slug : null)}>{(slug) => <TournamentView slug={slug} />}</AddressShell>;

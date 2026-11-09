'use client';

import { AddressShell } from './useAddressShell';
import { MatchView } from './MatchView';
import { matchIdFromSlug } from '@/domain/slug';

export const MatchShell = () => <AddressShell read={matchIdFromSlug}>{(matchId) => <MatchView matchId={matchId} />}</AddressShell>;

'use client';

import { AddressShell } from './useAddressShell';
import { PlayerView } from './PlayerView';
import { playerIdFromSlug } from '@/domain/slug';

export const PlayerShell = () => <AddressShell read={playerIdFromSlug}>{(playerId) => <PlayerView playerId={playerId} />}</AddressShell>;

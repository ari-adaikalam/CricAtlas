'use client';

import { AddressShell } from './useAddressShell';
import { TeamView } from './TeamView';
import { isTeamSlug } from '@/data/teamData';

export const TeamShell = () => <AddressShell read={(slug) => (isTeamSlug(slug) ? slug : null)}>{(slug) => <TeamView slug={slug} />}</AddressShell>;

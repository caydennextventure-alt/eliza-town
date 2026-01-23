import { xxHash32 } from '../../util/xxhash';
import type { PlayerId, Role } from '../types';

export type RoleAssignment = {
  playerId: PlayerId;
  role: Role;
};

const ROLE_DISTRIBUTION: Role[] = [
  'WEREWOLF',
  'WEREWOLF',
  'SEER',
  'DOCTOR',
  'VILLAGER',
  'VILLAGER',
  'VILLAGER',
  'VILLAGER',
];

const REQUIRED_PLAYERS = ROLE_DISTRIBUTION.length;
const ROLE_ASSIGN_SEED = 0x9e3779b9;

export function assignRoles(playerIds: PlayerId[]): RoleAssignment[] {
  if (playerIds.length !== REQUIRED_PLAYERS) {
    throw new Error(`assignRoles requires ${REQUIRED_PLAYERS} players`);
  }

  const uniquePlayerIds = new Set(playerIds);
  if (uniquePlayerIds.size !== playerIds.length) {
    throw new Error('assignRoles requires unique player ids');
  }

  const orderedPlayers = [...playerIds]
    .map((playerId) => ({
      playerId,
      sortKey: xxHash32(playerId, ROLE_ASSIGN_SEED) >>> 0,
    }))
    .sort((a, b) => {
      if (a.sortKey !== b.sortKey) {
        return a.sortKey - b.sortKey;
      }
      return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
    });

  const roleByPlayerId = new Map<PlayerId, Role>();
  orderedPlayers.forEach((entry, index) => {
    roleByPlayerId.set(entry.playerId, ROLE_DISTRIBUTION[index]);
  });

  return playerIds.map((playerId) => {
    const role = roleByPlayerId.get(playerId);
    if (!role) {
      throw new Error(`Missing role assignment for player ${playerId}`);
    }
    return { playerId, role };
  });
}

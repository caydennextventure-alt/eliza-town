import { GameId } from '../../convex/aiTown/ids.ts';
import { AgentDescription } from '../../convex/aiTown/agentDescription.ts';
import { PlayerDescription } from '../../convex/aiTown/playerDescription.ts';
import { World } from '../../convex/aiTown/world.ts';
import { WorldMap } from '../../convex/aiTown/worldMap.ts';
import { Id } from '../../convex/_generated/dataModel';
import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import { parseMap } from '../../convex/util/object.ts';

export type ServerGame = {
  world: World;
  playerDescriptions: Map<GameId<'players'>, PlayerDescription>;
  agentDescriptions: Map<GameId<'agents'>, AgentDescription>;
  worldMap: WorldMap;
  worldMapId: Id<'maps'>;
  worldMapFingerprint: string;
};

// TODO: This hook reparses the game state (even if we're not rerunning the query)
// when used in multiple components. Move this to a context to only parse it once.
export function useServerGame(worldId: Id<'worlds'> | undefined): ServerGame | undefined {
  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const descriptions = useQuery(api.world.gameDescriptions, worldId ? { worldId } : 'skip');
  const game = useMemo(() => {
    if (!worldState || !descriptions) {
      return undefined;
    }
    const worldMap = new WorldMap(descriptions.worldMap);
    const fingerprint = (() => {
      // Cheap rolling hash across placedObjects and interactables, so we can remount PixiStaticMap
      // when the map changes (Convex doc id stays the same on patch).
      let h = 2166136261;
      const mix = (n: number) => {
        h ^= n;
        h = Math.imul(h, 16777619);
      };
      for (const p of worldMap.placedObjects) {
        for (let i = 0; i < p.id.length; i++) mix(p.id.charCodeAt(i));
        for (let i = 0; i < p.objectId.length; i++) mix(p.objectId.charCodeAt(i));
        mix(p.col | 0);
        mix(p.row | 0);
        mix((p.rotation ?? 0) | 0);
      }
      for (const it of worldMap.interactables) {
        for (let i = 0; i < it.objectInstanceId.length; i++) mix(it.objectInstanceId.charCodeAt(i));
        for (let i = 0; i < it.objectType.length; i++) mix(it.objectType.charCodeAt(i));
      }
      return `${h >>> 0}`;
    })();
    return {
      world: new World(worldState.world),
      agentDescriptions: parseMap(
        descriptions.agentDescriptions,
        AgentDescription,
        (p) => p.agentId,
      ),
      playerDescriptions: parseMap(
        descriptions.playerDescriptions,
        PlayerDescription,
        (p) => p.playerId,
      ),
      worldMap,
      worldMapId: descriptions.worldMap._id,
      worldMapFingerprint: fingerprint,
    };
  }, [worldState, descriptions]);
  return game;
}

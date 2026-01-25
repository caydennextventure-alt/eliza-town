import PixiGame from './PixiGame.tsx';
import { useEffect, useState } from 'react';

import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useQuery } from 'convex/react';
import PlayerDetails from './PlayerDetails.tsx';
import { api } from '../../convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useServerGame } from '../hooks/serverGame.ts';
import PetalFx from './PetalFx.tsx';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

export default function Game() {
  const convex = useConvex();
  const [selectedElement, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();
  const [gameWrapperRef, { width, height }] = useElementSize();

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);
  const [isNight, setIsNight] = useState(false);
  const canToggleNight = import.meta.env.DEV || SHOW_DEBUG_UI;

  useEffect(() => {
    if (!canToggleNight) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'n') return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }

      setIsNight((prev) => !prev);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canToggleNight]);

  // Send a periodic heartbeat to our world to keep it alive.
  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  if (!worldId || !engineId || !game) {
    return null;
  }
  return (
    <>
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      <div className="w-full h-full relative overflow-hidden bg-brown-900" ref={gameWrapperRef}>
        {canToggleNight && (
          <div className="absolute top-2 left-2 z-10 pointer-events-auto">
            <button
              type="button"
              className="border border-white/30 bg-gray-900/60 px-3 py-1 text-xs text-white hover:border-white/60"
              onClick={() => setIsNight((prev) => !prev)}
            >
              Night: {isNight ? 'ON' : 'OFF'} (N)
            </button>
          </div>
        )}
        <Stage width={width} height={height} options={{ backgroundColor: isNight ? 0x0b1320 : 0x7ab5ff }}>
          <ConvexProvider client={convex}>
            <PixiGame
              game={game}
              worldId={worldId}
              engineId={engineId}
              width={width}
              height={height}
              historicalTime={historicalTime}
              setSelectedElement={setSelectedElement}
              isNight={isNight}
            />
            <PetalFx />
          </ConvexProvider>
        </Stage>
        
        {/* Right-side overlay for Player Details */}
        <div className="absolute top-0 right-0 z-10 h-full w-80 lg:w-96 p-4 flex flex-col pointer-events-auto overflow-hidden">
          <PlayerDetails
            worldId={worldId}
            engineId={engineId}
            game={game}
            playerId={selectedElement?.id}
            setSelectedElement={setSelectedElement}
          />
        </div>

      </div>
    </>
  );
}

/**
 * Game Component
 *
 * Main game view. AI agents are powered by ElizaOS running in the Convex backend.
 * Agents automatically pause when no users are connected to save LLM costs.
 */

import { useState } from 'react';
import PixiGame from './PixiGame.tsx';

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

  // Send a periodic heartbeat to our world to keep it alive.
  // This also signals to the backend that users are connected.
  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  // Check if still loading data (but always render the container for size measurement)
  const isLoading = !worldId || !engineId || !game;

  return (
    <div className="w-full h-full relative overflow-hidden bg-gray-900" ref={gameWrapperRef}>
      {isLoading || !width || !height ? (
        <div className="w-full h-full flex items-center justify-center text-white">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p>Loading AI Town...</p>
            <p className="text-xs text-gray-400 mt-2">
              {!worldStatus ? 'Connecting to server...' : 
               !game ? 'Loading world data...' : 
               'Initializing display...'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
          <Stage width={width} height={height} options={{ backgroundColor: 0x7ab5ff }}>
            <ConvexProvider client={convex}>
              <PixiGame
                game={game}
                worldId={worldId}
                engineId={engineId}
                width={width}
                height={height}
                historicalTime={historicalTime}
                setSelectedElement={setSelectedElement}
              />
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

          {/* ElizaOS Status Badge */}
          <div className="absolute bottom-4 left-4 z-10 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-sm text-white/90 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span>AI Agents powered by ElizaOS</span>
          </div>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import PixiGame from './PixiGame.tsx';

import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useQuery } from 'convex/react';
import PlayerDetails from './PlayerDetails.tsx';
import { api } from 'convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useServerGame } from '../hooks/serverGame.ts';
import { useSendInput } from '../hooks/sendInput.ts';
import { isTestMode } from '../testEnv';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

type Props = {
  onOpenSpectator?: (matchId: string) => void;
  hideTestControls?: boolean;
};

export default function Game({ onOpenSpectator, hideTestControls = false }: Props) {
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
  const humanTokenIdentifier = useQuery(api.world.userStatus, worldId ? { worldId } : 'skip');
  const humanPlayerId =
    game && humanTokenIdentifier
      ? [...game.world.players.values()].find((p) => p.human === humanTokenIdentifier)?.id
      : undefined;
  const moveTo = useSendInput(engineId!, 'moveTo');
  const [testDestination, setTestDestination] = useState<{ x: number; y: number } | null>(null);

  // Send a periodic heartbeat to our world to keep it alive.
  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  if (!worldId || !engineId || !game) {
    return null;
  }
  const humanPlayer = humanPlayerId ? game.world.players.get(humanPlayerId) : undefined;
  const handleTestMove = async () => {
    if (!humanPlayerId) {
      return;
    }
    const next = {
      x: testDestination ? testDestination.x + 1 : 1,
      y: testDestination ? testDestination.y + 1 : 1,
    };
    setTestDestination(next);
    await moveTo({ playerId: humanPlayerId, destination: next });
  };
  const startConversation = useSendInput(engineId!, 'startConversation');
  const handleInviteMe = async () => {
    if (!humanPlayerId || !selectedElement || selectedElement.id === humanPlayerId) {
      return;
    }
    await startConversation({ playerId: selectedElement.id, invitee: humanPlayerId });
  };
  const showTestControls = isTestMode && !hideTestControls;

  return (
    <>
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      <div className="w-full h-full relative overflow-hidden bg-brown-900" ref={gameWrapperRef}>
        {showTestControls && (
          <div
            className="absolute bottom-4 left-4 z-20 flex flex-col gap-3 bg-black/40 p-3 text-white text-xs max-w-[260px]"
            data-testid="test-controls"
          >
            <div className="font-bold uppercase tracking-wider">Test Controls</div>
            <div>
              Human:{' '}
              <span data-testid="test-human-player-id">
                {humanPlayerId ?? 'not-playing'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleTestMove()}
              className="border border-white/40 px-2 py-1 hover:border-white"
              data-testid="test-move"
            >
              Move +1,+1
            </button>
            <div>
              Position:{' '}
              <span data-testid="test-player-position">
                {humanPlayer
                  ? `${Math.floor(humanPlayer.position.x)},${Math.floor(humanPlayer.position.y)}`
                  : 'not-playing'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleInviteMe()}
              disabled={!selectedElement || selectedElement.id === humanPlayerId}
              className="border border-white/40 px-2 py-1 hover:border-white disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="test-invite-me"
            >
              Invite Me (from selected)
            </button>
            <div className="space-y-1" data-testid="test-player-list">
              {[...game.world.players.values()].map((player) => {
                const label = game.playerDescriptions.get(player.id)?.name ?? player.id;
                return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setSelectedElement({ kind: 'player', id: player.id })}
                  className="block w-full border border-white/20 px-2 py-1 text-left hover:border-white"
                  data-testid={`test-player-select-${player.id}`}
                  data-player-id={player.id}
                  data-player-name={label}
                >
                  Select {label}
                </button>
                );
              })}
            </div>
          </div>
        )}
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
              onOpenSpectator={onOpenSpectator}
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
      </div>
    </>
  );
}

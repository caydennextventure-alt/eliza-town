import PixiGame from './PixiGame.tsx';
import { useEffect, useMemo, useState } from 'react';

import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useMutation, useQuery } from 'convex/react';
import PlayerDetails from './PlayerDetails.tsx';
import { api } from '../../convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useServerGame } from '../hooks/serverGame.ts';
import PetalFx from './PetalFx.tsx';
import ReactModal from 'react-modal';
import type { Interactable } from '../../convex/aiTown/worldMap.ts';
import { toastOnError } from '../toasts.ts';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

const INTERACTABLE_TYPE_OPTIONS = [
  { id: 'board', label: 'Board' },
  { id: 'bulletin', label: 'Bulletin' },
  { id: 'vending', label: 'Vending' },
  { id: 'tv', label: 'TV' },
  { id: 'custom', label: 'Custom' },
] as const;

type InteractableTypeId = (typeof INTERACTABLE_TYPE_OPTIONS)[number]['id'];

const isInteractableTypeId = (value: string): value is InteractableTypeId =>
  INTERACTABLE_TYPE_OPTIONS.some((opt) => opt.id === value);

const modalStyles = {
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    zIndex: 20,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '520px',
    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};

export default function Game() {
  const convex = useConvex();
  const [selectedElement, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();
  const [activeInteractable, setActiveInteractable] = useState<Interactable | null>(null);
  const [buildMode, setBuildMode] = useState(false);
  const [buildSelectedObjectInstanceId, setBuildSelectedObjectInstanceId] = useState<string | null>(
    null,
  );
  const [buildTypeDraft, setBuildTypeDraft] = useState<InteractableTypeId>('board');
  const [buildNameDraft, setBuildNameDraft] = useState('');
  const [buildRadiusDraft, setBuildRadiusDraft] = useState(2);
  const [gameWrapperRef, { width, height }] = useElementSize();

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;
  const upsertInteractable = useMutation(api.maps.upsertInteractable);
  const removeInteractable = useMutation(api.maps.removeInteractable);

  const game = useServerGame(worldId);
  const [isNight, setIsNight] = useState(false);
  const canToggleNight = import.meta.env.DEV || SHOW_DEBUG_UI;
  const canUseBuildMode = import.meta.env.DEV || SHOW_DEBUG_UI;

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

  useEffect(() => {
    if (!canUseBuildMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'b') return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }

      setBuildMode((prev) => {
        const next = !prev;
        if (!next) {
          setBuildSelectedObjectInstanceId(null);
        }
        return next;
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canUseBuildMode]);

  // Send a periodic heartbeat to our world to keep it alive.
  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  const selectedInteractable = useMemo(() => {
    if (!buildSelectedObjectInstanceId || !game) return null;
    return (
      game.worldMap.interactables.find((item) => item.objectInstanceId === buildSelectedObjectInstanceId) ??
      null
    );
  }, [buildSelectedObjectInstanceId, game]);

  const selectedPlacedObject = useMemo(() => {
    if (!buildSelectedObjectInstanceId || !game) return null;
    const placementId =
      selectedInteractable?.placedObjectId ??
      selectedInteractable?.objectInstanceId ??
      buildSelectedObjectInstanceId;
    if (!placementId) return null;
    return game.worldMap.placedObjects.find((placement) => placement.id === placementId) ?? null;
  }, [buildSelectedObjectInstanceId, game, selectedInteractable?.objectInstanceId, selectedInteractable?.placedObjectId]);

  useEffect(() => {
    if (!buildMode) return;
    if (!buildSelectedObjectInstanceId) return;
    if (!game) return;

    const inferred: InteractableTypeId = (() => {
      const lower = (selectedPlacedObject?.objectId ?? '').toLowerCase();
      if (lower.includes('bulletin')) return 'bulletin';
      if (lower.includes('vending')) return 'vending';
      if (lower.includes('television') || lower.includes('tv')) return 'tv';
      if (lower.includes('board')) return 'board';
      return 'custom';
    })();

    const fromData = selectedInteractable?.objectType;
    setBuildTypeDraft(fromData && isInteractableTypeId(fromData) ? fromData : inferred);
    setBuildNameDraft(selectedInteractable?.displayName ?? '');
    setBuildRadiusDraft(selectedInteractable?.interactionRadius ?? 2);
  }, [
    buildMode,
    buildSelectedObjectInstanceId,
    game,
    selectedInteractable?.displayName,
    selectedInteractable?.interactionRadius,
    selectedInteractable?.objectType,
    selectedPlacedObject?.objectId,
  ]);

  if (!worldId || !engineId || !game) {
    return null;
  }

  const buildSelectedPlacementId = buildMode ? selectedPlacedObject?.id ?? null : null;

  const saveBuildSelection = async () => {
    if (!selectedPlacedObject) return;
    const objectInstanceId = selectedInteractable?.objectInstanceId ?? selectedPlacedObject.id;
    const hitbox =
      selectedInteractable?.hitbox ?? ({
        kind: 'tileRect' as const,
        x: selectedPlacedObject.col,
        y: selectedPlacedObject.row,
        w: 1,
        h: 1,
      });

    await toastOnError(
      upsertInteractable({
        worldId,
        interactable: {
          objectInstanceId,
          objectType: buildTypeDraft,
          placedObjectId: selectedPlacedObject.id,
          hitbox,
          interactionRadius: buildRadiusDraft,
          displayName: buildNameDraft.trim() ? buildNameDraft.trim() : undefined,
        },
      }),
    );
  };

  const removeBuildSelection = async () => {
    if (!selectedPlacedObject) return;
    const objectInstanceId = selectedInteractable?.objectInstanceId ?? selectedPlacedObject.id;
    await toastOnError(removeInteractable({ worldId, objectInstanceId }));
  };

  const interactableLabel = (interactable: Interactable) => {
    if (interactable.displayName) return interactable.displayName;
    const type = interactable.objectType;
    if (type === 'board') return 'Board';
    if (type === 'bulletin') return 'Bulletin';
    if (type === 'vending') return 'Vending';
    if (type === 'tv') return 'TV';
    return 'Interactable';
  };

  return (
    <>
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      <div className="w-full h-full relative overflow-hidden bg-brown-900" ref={gameWrapperRef}>
        {(canToggleNight || canUseBuildMode) && (
          <div className="absolute top-2 left-2 z-10 pointer-events-auto flex flex-col gap-2">
            {canToggleNight && (
              <button
                type="button"
                className="border border-white/30 bg-gray-900/60 px-3 py-1 text-xs text-white hover:border-white/60"
                onClick={() => setIsNight((prev) => !prev)}
              >
                Night: {isNight ? 'ON' : 'OFF'} (N)
              </button>
            )}
            {canUseBuildMode && (
              <button
                type="button"
                className="border border-white/30 bg-gray-900/60 px-3 py-1 text-xs text-white hover:border-white/60"
                onClick={() =>
                  setBuildMode((prev) => {
                    const next = !prev;
                    if (!next) setBuildSelectedObjectInstanceId(null);
                    return next;
                  })
                }
              >
                Build: {buildMode ? 'ON' : 'OFF'} (B)
              </button>
            )}
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
              onInteractableClick={(interactable) => setActiveInteractable(interactable)}
              buildMode={buildMode}
              buildSelectedPlacementId={buildSelectedPlacementId}
              onBuildSelect={(objectInstanceId) => setBuildSelectedObjectInstanceId(objectInstanceId)}
            />
            <PetalFx />
          </ConvexProvider>
        </Stage>

        <ReactModal
          isOpen={Boolean(activeInteractable)}
          onRequestClose={() => setActiveInteractable(null)}
          style={modalStyles}
          contentLabel="Interactable"
          ariaHideApp={false}
        >
          {activeInteractable && (
            <div className="font-display space-y-3">
              <div className="text-3xl font-bold">{interactableLabel(activeInteractable)}</div>
              <div className="text-sm opacity-80 font-mono break-all">
                objectInstanceId: {activeInteractable.objectInstanceId}
              </div>
              <div className="text-sm opacity-80 font-mono">
                type: {activeInteractable.objectType}
              </div>
              <div className="text-sm opacity-90">
                Phase 1 placeholder: later 这里会变成 Lobby / Session UI。
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="border border-white/30 bg-gray-900/60 px-4 py-2 text-sm text-white hover:border-white/60"
                  onClick={() => setActiveInteractable(null)}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </ReactModal>

        {buildMode && (
          <div className="absolute top-16 left-2 z-10 pointer-events-auto w-80 border border-white/20 bg-gray-950/70 p-3 text-white">
            <div className="text-sm font-bold font-display">Build Mode</div>
            <div className="text-[11px] opacity-80 mt-1">
              Click an object (anchor tile) to select. Save requires login unless Convex env sets{' '}
              <span className="font-mono">ALLOW_UNAUTHENTICATED_TOWN_EDIT=1</span>.
            </div>
            <div className="mt-2 space-y-2">
              <div className="text-[11px] font-mono break-all opacity-90">
                selected: {buildSelectedObjectInstanceId ?? '—'}
              </div>
              {selectedPlacedObject && (
                <>
                  <div className="text-[11px] font-mono break-all opacity-80">
                    objectId: {selectedPlacedObject.objectId}
                  </div>
                  <select
                    value={buildTypeDraft}
                    onChange={(e) => setBuildTypeDraft(e.target.value as InteractableTypeId)}
                    className="w-full text-xs bg-gray-900/60 border border-white/20 px-2 py-1"
                  >
                    {INTERACTABLE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={buildNameDraft}
                    onChange={(e) => setBuildNameDraft(e.target.value)}
                    placeholder="Display name (optional)"
                    className="w-full text-xs bg-gray-900/60 border border-white/20 px-2 py-1"
                  />
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={buildRadiusDraft}
                    onChange={(e) => setBuildRadiusDraft(Number(e.target.value))}
                    placeholder="Interaction radius"
                    className="w-full text-xs bg-gray-900/60 border border-white/20 px-2 py-1"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      className="border border-white/30 bg-emerald-900/60 px-3 py-1 text-xs text-white hover:border-white/60"
                      onClick={saveBuildSelection}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      disabled={!selectedInteractable}
                      className={`border px-3 py-1 text-xs text-white ${
                        selectedInteractable
                          ? 'border-white/30 bg-red-900/60 hover:border-white/60'
                          : 'border-white/10 bg-gray-900/30 opacity-50 cursor-not-allowed'
                      }`}
                      onClick={removeBuildSelection}
                    >
                      Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        
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

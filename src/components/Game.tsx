import PixiGame from './PixiGame.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useMutation, useQuery } from 'convex/react';
import PlayerDetails from './PlayerDetails.tsx';
import { api } from 'convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useServerGame } from '../hooks/serverGame.ts';
import { useSendInput } from '../hooks/sendInput.ts';
import { isTestMode } from '../testEnv';
import { COLLISION_THRESHOLD } from '../../convex/constants';
import PetalFx from './PetalFx.tsx';
import ReactModal from 'react-modal';
import type { Interactable } from '../../convex/aiTown/worldMap.ts';
import { toastOnError } from '../toasts.ts';
import { toast } from 'react-toastify';
import { Id } from '../../convex/_generated/dataModel';
import { useAssetsManifest } from '../hooks/useAssetsManifest.ts';
import { useSendInput } from '../hooks/sendInput.ts';
import { isTestMode } from '../testEnv';
import { COLLISION_THRESHOLD } from '../../convex/constants';

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

type GameProps = {
  worldId?: Id<'worlds'>;
  worldKind?: 'lobby' | 'room';
  // Tool states passed from parent
  isNight?: boolean;
  buildMode?: boolean;
  buildSelectedObjectInstanceId?: string | null;
  onBuildSelect?: (objectInstanceId: string | null) => void;
  roomBuildMode?: boolean;
  roomBuildCategory?: 'floor' | 'furniture' | 'deco';
  roomBuildSelectedObjectId?: string | null;
  roomBuildRotation?: number;
  roomBuildPreviewItem?: {
    id: string;
    image: string;
    category?: string;
    pixelWidth?: number;
    pixelHeight?: number;
    anchor?: 'top-left' | 'bottom-left' | 'center';
    scale?: number;
  } | null;
  // Profile card callback
  onPlayerClick?: (playerId: string) => void;
  // Werewolf spectator
  onOpenSpectator?: (matchId: string) => void;
  // Test controls
  hideTestControls?: boolean;
};

export default function Game({
  worldId,
  worldKind,
  isNight: isNightProp,
  buildMode: buildModeProp,
  buildSelectedObjectInstanceId: buildSelectedObjectInstanceIdProp,
  onBuildSelect,
  roomBuildMode: roomBuildModeProp,
  roomBuildCategory: roomBuildCategoryProp,
  roomBuildSelectedObjectId: roomBuildSelectedObjectIdProp,
  roomBuildRotation: roomBuildRotationProp,
  roomBuildPreviewItem: roomBuildPreviewItemProp,
  onPlayerClick,
  onOpenSpectator,
  hideTestControls = false,
}: GameProps) {
  const convex = useConvex();

  // Use props if provided, otherwise use internal state (for backward compatibility)
  const [internalIsNight, setInternalIsNight] = useState(false);
  const [internalBuildMode, setInternalBuildMode] = useState(false);
  const [internalBuildSelectedObjectInstanceId, setInternalBuildSelectedObjectInstanceId] = useState<string | null>(null);
  const [internalRoomBuildMode, setInternalRoomBuildMode] = useState(false);
  const [roomBuildCategory, setRoomBuildCategory] = useState<'floor' | 'furniture' | 'deco'>('floor');
  const [internalRoomBuildSelectedObjectId, setInternalRoomBuildSelectedObjectId] = useState<string | null>(null);
  const [internalRoomBuildRotation, setInternalRoomBuildRotation] = useState(0);

  // Resolve prop vs internal state
  const isNight = isNightProp ?? internalIsNight;
  const buildMode = buildModeProp ?? internalBuildMode;
  const buildSelectedObjectInstanceId = buildSelectedObjectInstanceIdProp ?? internalBuildSelectedObjectInstanceId;
  const setBuildSelectedObjectInstanceId = onBuildSelect ?? setInternalBuildSelectedObjectInstanceId;
  const roomBuildMode = roomBuildModeProp ?? internalRoomBuildMode;
  const effectiveRoomBuildCategory = roomBuildCategoryProp ?? roomBuildCategory;
  // For roomBuildSelectedObjectId, use prop if it was explicitly passed (even if null)
  const roomBuildSelectedObjectId = roomBuildSelectedObjectIdProp !== undefined ? roomBuildSelectedObjectIdProp : internalRoomBuildSelectedObjectId;
  const roomBuildRotation = roomBuildRotationProp ?? internalRoomBuildRotation;

  // These are still managed internally but not exposed in UI
  const [buildTypeDraft, setBuildTypeDraft] = useState<InteractableTypeId>('board');
  const [buildNameDraft, setBuildNameDraft] = useState('');
  const [buildRadiusDraft, setBuildRadiusDraft] = useState(2);

  const [selectedElement, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();

  // Wrapper to also call onPlayerClick when a player is selected
  const handleSelectElement = (element: { kind: 'player'; id: GameId<'players'> } | undefined) => {
    setSelectedElement(element);
    if (element?.kind === 'player' && onPlayerClick) {
      onPlayerClick(element.id);
    }
  };
  const [activeInteractable, setActiveInteractable] = useState<Interactable | null>(null);
  const [gameWrapperRef, { width, height }] = useElementSize();

  // Check if UI is controlled externally (new layout) or internally (old layout)
  const isExternallyControlled = isNightProp !== undefined || buildModeProp !== undefined;

  const worldStatus = useQuery(api.world.worldStatusForWorld, worldId ? { worldId } : 'skip');
  const engineId = worldStatus?.engineId;
  const upsertInteractable = useMutation(api.maps.upsertInteractable);
  const removeInteractable = useMutation(api.maps.removeInteractable);
  const upsertPlacedObject = useMutation(api.maps.upsertPlacedObject);
  const removePlacedObject = useMutation(api.maps.removePlacedObject);
  const counterState = useQuery(
    api.appTemplates.getCounter,
    worldId && activeInteractable?.objectType === 'board'
      ? { worldId, objectInstanceId: activeInteractable.objectInstanceId }
      : 'skip',
  );
  const incrementCounter = useMutation(api.appTemplates.incrementCounter);

  const game = useServerGame(worldId);
  const humanTokenIdentifier = useQuery(api.world.userStatus, worldId ? { worldId } : 'skip');
  const humanPlayerId =
    game && humanTokenIdentifier
      ? [...game.world.players.values()].find((p) => p.human === humanTokenIdentifier)?.id
      : undefined;
  const moveTo = useSendInput(engineId ?? ('' as Id<'engines'>), 'moveTo');
  const startConversation = useSendInput(engineId ?? ('' as Id<'engines'>), 'startConversation');
  const canToggleNight = !isExternallyControlled && (import.meta.env.DEV || SHOW_DEBUG_UI);
  const canUseBuildMode = !isExternallyControlled && (import.meta.env.DEV || SHOW_DEBUG_UI);
  const canUseRoomBuilder = !isExternallyControlled && (import.meta.env.DEV || SHOW_DEBUG_UI) && worldKind === 'room';

  const { manifest } = useAssetsManifest();
  const palette = useMemo(() => {
    const objects = manifest?.objects ?? [];
    const byCategory = (cat: string) => objects.filter((o) => o.category === cat);
    return {
      floor: byCategory('flooring').slice(0, 48),
      furniture: byCategory('furniture').slice(0, 48),
      deco: byCategory('decorations').slice(0, 48),
    };
  }, [manifest?.objects]);

  const roomBuildPreviewItem = useMemo(() => {
    if (roomBuildPreviewItemProp) return roomBuildPreviewItemProp;
    if (!roomBuildSelectedObjectId) return null;
    const found = (manifest?.objects ?? []).find((o) => o.id === roomBuildSelectedObjectId);
    if (!found) return null;
    return {
      id: found.id,
      image: found.image,
      category: found.category,
      pixelWidth: found.pixelWidth,
      pixelHeight: found.pixelHeight,
      anchor: found.anchor,
      scale: (found as any).scale,
    };
  }, [manifest?.objects, roomBuildPreviewItemProp, roomBuildSelectedObjectId]);

  useEffect(() => {
    setSelectedElement(undefined);
    setActiveInteractable(null);
    if (!isExternallyControlled) {
      setInternalBuildMode(false);
      setInternalBuildSelectedObjectInstanceId(null);
      setInternalRoomBuildMode(false);
    }
  }, [worldId, isExternallyControlled]);

  // Keyboard shortcuts only work in internal mode (old layout)
  useEffect(() => {
    if (!canToggleNight) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'n') return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      setInternalIsNight((prev) => !prev);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canToggleNight]);

  useEffect(() => {
    if (!canUseBuildMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'b') return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      setInternalBuildMode((prev) => {
        const next = !prev;
        if (!next) setInternalBuildSelectedObjectInstanceId(null);
        return next;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canUseBuildMode]);

  useEffect(() => {
    if (!canUseRoomBuilder) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      if (key === 'p') {
        setInternalRoomBuildMode((prev) => !prev);
      } else if (key === 'r') {
        setInternalRoomBuildRotation((prev) => (prev + (event.shiftKey ? -90 : 90) + 360) % 360);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canUseRoomBuilder]);

  // Send a periodic heartbeat to our world to keep it alive.
  useWorldHeartbeat(worldId);

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

  const seededDraftForSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!buildMode || !buildSelectedObjectInstanceId) {
      seededDraftForSelectionRef.current = null;
      return;
    }

    if (!selectedPlacedObject && !selectedInteractable) {
      return;
    }

    if (seededDraftForSelectionRef.current === buildSelectedObjectInstanceId) {
      return;
    }

    seededDraftForSelectionRef.current = buildSelectedObjectInstanceId;

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
    selectedInteractable?.displayName,
    selectedInteractable?.interactionRadius,
    selectedInteractable?.objectType,
    selectedPlacedObject?.objectId,
  ]);

  if (!worldId || !engineId || !game) {
    return null;
  }
  const humanPlayer = humanPlayerId ? game.world.players.get(humanPlayerId) : undefined;
  const findTestDestination = () => {
    if (!humanPlayer) {
      return null;
    }
    const map = game.worldMap;
    const baseX = Math.round(humanPlayer.position.x);
    const baseY = Math.round(humanPlayer.position.y);
    const otherPositions = [...game.world.players.values()]
      .filter((player) => player.id !== humanPlayer.id)
      .map((player) => player.position);
    const isBlocked = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
        return true;
      }
      for (const layer of map.objectTiles) {
        if (layer[Math.floor(x)]?.[Math.floor(y)] !== -1) {
          return true;
        }
      }
      for (const other of otherPositions) {
        if (Math.hypot(other.x - x, other.y - y) < COLLISION_THRESHOLD) {
          return true;
        }
      }
      return false;
    };
    const offsets: Array<[number, number]> = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
      [2, 1],
      [2, -1],
      [-2, 1],
      [-2, -1],
      [1, 2],
      [1, -2],
      [-1, 2],
      [-1, -2],
    ];
    for (const [dx, dy] of offsets) {
      const candidate = { x: baseX + dx, y: baseY + dy };
      if (!isBlocked(candidate.x, candidate.y)) {
        return candidate;
      }
    }
    return null;
  };
  const handleTestMove = async () => {
    if (!humanPlayerId) {
      return;
    }
    const next = findTestDestination();
    if (!next) {
      return;
    }
    await moveTo({ playerId: humanPlayerId, destination: next });
  };
  const handleInviteMe = async () => {
    if (!humanPlayerId || !selectedElement || selectedElement.id === humanPlayerId) {
      return;
    }
    await startConversation({ playerId: selectedElement.id, invitee: humanPlayerId });
  };
  const showTestControls = isTestMode && !hideTestControls;

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
    toast.success('Saved');
  };

  const removeBuildSelection = async () => {
    if (!selectedPlacedObject) return;
    const objectInstanceId = selectedInteractable?.objectInstanceId ?? selectedPlacedObject.id;
    await toastOnError(removeInteractable({ worldId, objectInstanceId }));
    toast.success('Removed');
  };

  const placeRoomObjectAt = async (tileX: number, tileY: number) => {
    if (!worldId) return;
    const objectId = roomBuildSelectedObjectId;
    if (!objectId) return;

    // Floor paints are deterministic by tile so it behaves like tile painting.
    const placementId =
      effectiveRoomBuildCategory === 'floor'
        ? `floor-${tileX}-${tileY}`
        : `obj-${tileX}-${tileY}-${Date.now()}`;

    await toastOnError(
      upsertPlacedObject({
        worldId,
        placement: {
          id: placementId,
          objectId,
          col: tileX,
          row: tileY,
          rotation: effectiveRoomBuildCategory === 'floor' ? 0 : roomBuildRotation,
        },
      }),
    );
  };

  const removeRoomObjectAt = async (tileX: number, tileY: number) => {
    if (!worldId) return;
    // Remove top-most non-floor object at this tile; fall back to floor tile removal only if no other found.
    const placed = [...(game.worldMap.placedObjects ?? [])];
    for (let i = placed.length - 1; i >= 0; i -= 1) {
      const p = placed[i]!;
      if (p.col !== tileX || p.row !== tileY) continue;
      if (p.id.startsWith('floor-')) continue;
      await toastOnError(removePlacedObject({ worldId, placementId: p.id }));
      return;
    }
    await toastOnError(removePlacedObject({ worldId, placementId: `floor-${tileX}-${tileY}` }));
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
      <div
        className="w-full h-full relative overflow-hidden bg-brown-900"
        ref={gameWrapperRef}
        onContextMenu={(e) => e.preventDefault()}
      >
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
            <div
              className="space-y-1 max-h-[30vh] overflow-y-auto pr-1"
              data-testid="test-player-list"
            >
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

        {/* Old UI: only shown when not externally controlled */}
        {!isExternallyControlled && (canToggleNight || canUseBuildMode) && (
          <div className="absolute top-2 left-2 z-10 pointer-events-auto flex flex-col gap-2">
            {canToggleNight && (
              <button
                type="button"
                className="border border-white/30 bg-gray-900/60 px-3 py-1 text-xs text-white hover:border-white/60"
                onClick={() => setInternalIsNight((prev) => !prev)}
              >
                Night: {isNight ? 'ON' : 'OFF'} (N)
              </button>
            )}
            {canUseBuildMode && (
              <button
                type="button"
                className="border border-white/30 bg-gray-900/60 px-3 py-1 text-xs text-white hover:border-white/60"
                onClick={() => {
                  setInternalBuildMode((prev) => {
                    const next = !prev;
                    if (!next) setInternalBuildSelectedObjectInstanceId(null);
                    return next;
                  });
                }}
              >
                Build: {buildMode ? 'ON' : 'OFF'} (B)
              </button>
            )}
            {canUseRoomBuilder && (
              <button
                type="button"
                className="border border-white/30 bg-gray-900/60 px-3 py-1 text-xs text-white hover:border-white/60"
                onClick={() => setInternalRoomBuildMode((prev) => !prev)}
              >
                Room Builder: {roomBuildMode ? 'ON' : 'OFF'} (P)
              </button>
            )}
          </div>
        )}

        {/* Old room builder panel: only shown when not externally controlled */}
        {!isExternallyControlled && roomBuildMode && (
          <div className="absolute top-2 right-2 z-10 pointer-events-auto w-[340px] max-h-[80vh] overflow-auto border border-white/20 bg-gray-900/70 p-3 text-white">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold">Room Builder</div>
              <div className="text-xs opacity-80">R rotate ({roomBuildRotation}°)</div>
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <button
                className={`px-2 py-1 border ${roomBuildCategory === 'floor' ? 'border-white' : 'border-white/30'} `}
                onClick={() => setRoomBuildCategory('floor')}
              >
                Floor
              </button>
              <button
                className={`px-2 py-1 border ${roomBuildCategory === 'furniture' ? 'border-white' : 'border-white/30'} `}
                onClick={() => setRoomBuildCategory('furniture')}
              >
                Furniture
              </button>
              <button
                className={`px-2 py-1 border ${roomBuildCategory === 'deco' ? 'border-white' : 'border-white/30'} `}
                onClick={() => setRoomBuildCategory('deco')}
              >
                Deco
              </button>
            </div>
            <div className="mt-2 text-xs opacity-80">
              Click to place. Shift+Click to remove.
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(roomBuildCategory === 'floor'
                ? palette.floor
                : roomBuildCategory === 'furniture'
                  ? palette.furniture
                  : palette.deco
              ).map((item) => (
                <button
                  key={item.id}
                  className={`border p-2 text-left text-[10px] leading-tight ${
                    roomBuildSelectedObjectId === item.id ? 'border-white' : 'border-white/20'
                  }`}
                  onClick={() => setInternalRoomBuildSelectedObjectId(item.id)}
                  title={item.name ?? item.id}
                >
                  <div className="font-mono break-all">{item.id}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        <Stage
          width={width}
          height={height}
          options={{
            backgroundColor: worldKind === 'room' ? 0x000000 : isNight ? 0x0b1320 : 0x7ab5ff,
          }}
        >
          <ConvexProvider client={convex}>
            <PixiGame
              game={game}
              worldId={worldId}
              engineId={engineId}
              width={width}
              height={height}
              historicalTime={historicalTime}
              setSelectedElement={handleSelectElement}
              onOpenSpectator={onOpenSpectator}
              isNight={isNight}
              onInteractableClick={(interactable) => setActiveInteractable(interactable)}
              buildMode={buildMode}
              buildSelectedPlacementId={buildSelectedPlacementId}
              onBuildSelect={(objectInstanceId) => setBuildSelectedObjectInstanceId(objectInstanceId)}
              roomBuildMode={roomBuildMode}
              roomBuildPreviewItem={roomBuildPreviewItem}
              roomBuildRotation={roomBuildRotation}
              onRoomBuildTile={(tileX, tileY, remove) =>
                remove ? void removeRoomObjectAt(tileX, tileY) : void placeRoomObjectAt(tileX, tileY)
              }
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
                {activeInteractable.objectType === 'board' ? (
                  <div className="space-y-3">
                    <div className="text-sm opacity-90">Template MVP: Counter</div>
                    <div className="text-2xl font-bold font-mono">
                      {counterState ? counterState.count : '…'}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="border border-white/30 bg-gray-900/60 px-4 py-2 text-sm text-white hover:border-white/60"
                        onClick={async () => {
                          await toastOnError(
                            incrementCounter({
                              worldId,
                              objectInstanceId: activeInteractable.objectInstanceId,
                            }),
                          );
                        }}
                      >
                        +1
                      </button>
                    </div>
                  </div>
                ) : (
                  'Phase 1 placeholder: later 这里会变成 Lobby / Session UI。'
                )}
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

        {/* Old build mode panel: only shown when not externally controlled */}
        {!isExternallyControlled && buildMode && (
          <div className="absolute top-16 left-2 z-10 pointer-events-auto w-80 border border-white/20 bg-gray-950/70 p-3 text-white">
            <div className="text-sm font-bold font-display">Build Mode</div>
            <div className="text-[11px] opacity-80 mt-1">
              Click an object to select (pixel hit-test). Save requires login unless Convex env sets{' '}
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

import Game from './components/Game.tsx';
import { ToastContainer } from 'react-toastify';
import starImg from '../assets/star.svg';
import helpImg from '../assets/help.svg';
import { useState, useEffect, useMemo } from 'react';
import ReactModal from 'react-modal';
import MusicButton from './ui/buttons/MusicButton.tsx';
import Button from './ui/buttons/Button.tsx';
import MapEditor from './components/MapEditor.tsx';
import CreateCharacterDialog from './components/CreateCharacterDialog.tsx';
import CreateAgentDialog from './components/CreateAgentDialog.tsx';
import AgentListDialog from './components/AgentListDialog.tsx';
import { SignedOut } from '@clerk/clerk-react';
import LoginButton from './ui/buttons/LoginButton.tsx';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { toast } from 'react-toastify';
import { getOrCreateGuestKey } from './lib/guestKey.ts';
import Sidebar from './components/ui/Sidebar.tsx';
import TopBar from './components/ui/TopBar.tsx';
import BuildModePanel from './components/ui/BuildModePanel.tsx';
import RoomBuilderPanel from './components/ui/RoomBuilderPanel.tsx';
import ProfileCard from './components/ui/ProfileCard.tsx';
import { useServerGame } from './hooks/serverGame.ts';
import { useAssetsManifest } from './hooks/useAssetsManifest.ts';
import { waitForInput } from './hooks/sendInput.ts';
import { ConvexError } from 'convex/values';
import { useCharacters } from './lib/characterRegistry.ts';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

const RAW_BASE_PATH = (import.meta.env.DEV ? '/' : import.meta.env.BASE_URL) ?? '/';
const BASE_PATH = RAW_BASE_PATH.endsWith('/') ? RAW_BASE_PATH : `${RAW_BASE_PATH}/`;
const resolvePublicAsset = (path: string | undefined) => {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  if (path.startsWith('/')) return path;
  return `${BASE_PATH}${encodeURI(path)}`;
};

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
    backgroundColor: 'rgb(0, 0, 0, 75%)',
    zIndex: 12,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '50%',
    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};

export default function Home() {
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [createCharacterOpen, setCreateCharacterOpen] = useState(false);
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [agentListOpen, setAgentListOpen] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showVisualTest, setShowVisualTest] = useState(false);
  const [activeWorldId, setActiveWorldId] = useState<Id<'worlds'> | null>(null);
  const [activeWorldKind, setActiveWorldKind] = useState<'lobby' | 'room'>('lobby');
  const [isSwitchingWorld, setIsSwitchingWorld] = useState(false);

  // Tool states (lifted from Game.tsx for sidebar control)
  const [isNight, setIsNight] = useState(false);
  const [buildMode, setBuildMode] = useState(false);
  const [buildSelectedObjectInstanceId, setBuildSelectedObjectInstanceId] = useState<string | null>(null);
  const [buildTypeDraft, setBuildTypeDraft] = useState<InteractableTypeId>('board');
  const [buildNameDraft, setBuildNameDraft] = useState('');
  const [buildRadiusDraft, setBuildRadiusDraft] = useState(2);
  const [roomBuildMode, setRoomBuildMode] = useState(false);
  const [roomBuildCategory, setRoomBuildCategory] = useState<'floor' | 'furniture' | 'deco'>('floor');
  const [roomBuildSelectedObjectId, setRoomBuildSelectedObjectId] = useState<string | null>(null);
  const [roomBuildRotation, setRoomBuildRotation] = useState(0);

  // Take over state
  const [isTakeOverDialogOpen, setIsTakeOverDialogOpen] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Profile card state
  const [profileCardOpen, setProfileCardOpen] = useState(false);
  const [profileCardData, setProfileCardData] = useState<{
    name: string;
    avatar?: string;
    xHandle?: string;
    bio?: string;
    personality?: string[];
    hobbies?: { icon: string; label: string }[];
    stats?: { followers?: number; posts?: number; friends?: number };
    level?: number;
    mood?: string;
  } | null>(null);

  const lobbyWorldStatus = useQuery(api.world.defaultWorldStatus);
  const lobbyWorldId = lobbyWorldStatus?.worldId;
  const getOrCreateMyRoomWorld = useMutation(api.rooms.getOrCreateMyRoomWorld);
  const guestKey = getOrCreateGuestKey();
  const convex = useConvex();

  // Game data for build mode
  const game = useServerGame(activeWorldId ?? undefined);
  const { manifest } = useAssetsManifest();
  const { characters } = useCharacters();

  // Take over mutations
  const humanTokenIdentifier = useQuery(api.world.userStatus, activeWorldId ? { worldId: activeWorldId } : 'skip');
  const takeOverAgent = useMutation(api.world.takeOverAgent);
  const leaveWorld = useMutation(api.world.leaveWorld);
  const upsertInteractable = useMutation(api.maps.upsertInteractable);
  const removeInteractable = useMutation(api.maps.removeInteractable);

  const userPlayerId = useMemo(() => {
    if (!game || !humanTokenIdentifier) return undefined;
    return [...game.world.players.values()].find((p) => p.human === humanTokenIdentifier)?.id;
  }, [game, humanTokenIdentifier]);
  const isPlaying = !!userPlayerId;

  const characterByName = useMemo(
    () => new Map(characters.map((character) => [character.name, character] as const)),
    [characters],
  );

  // Takeover agents list
  const takeoverAgents = useMemo(() => {
    if (!game) return [];
    const userToken = humanTokenIdentifier && humanTokenIdentifier !== 'skip' ? humanTokenIdentifier : null;
    return [...game.world.agents.values()].flatMap((agent) => {
      const agentDescription = game.agentDescriptions.get(agent.id);
      if (!agentDescription || agentDescription.isCustom !== true) return [];
      if (userToken && agentDescription.ownerId && agentDescription.ownerId !== userToken) return [];
      const playerDescription = game.playerDescriptions.get(agent.playerId);
      if (!playerDescription) return [];
      const character = characterByName.get(playerDescription.character);
      if (!character) return [];
      return [{ agentId: agent.id, name: playerDescription.name, character }];
    });
  }, [game, characterByName, humanTokenIdentifier]);

  // Room builder palette - uses separate interior assets
  const palette = useMemo(() => {
    const objects = manifest?.objects ?? [];
    const byCategory = (cat: string) => objects.filter((o) => o.category === cat);
    return {
      floor: byCategory('flooring').map((o) => ({ ...o, image: resolvePublicAsset(o.image) })),
      furniture: byCategory('furniture').map((o) => ({ ...o, image: resolvePublicAsset(o.image) })),
      deco: byCategory('decorations').map((o) => ({ ...o, image: resolvePublicAsset(o.image) })),
    };
  }, [manifest?.objects]);

  const roomBuildPreviewItem = useMemo(() => {
    if (!roomBuildSelectedObjectId) return null;
    const find = (list: any[]) => list.find((i) => i.id === roomBuildSelectedObjectId) ?? null;
    const item = find(palette.floor) ?? find(palette.furniture) ?? find(palette.deco);
    if (!item) return null;
    return {
      id: item.id,
      image: item.image,
      category: item.category,
      pixelWidth: item.pixelWidth,
      pixelHeight: item.pixelHeight,
      anchor: item.anchor,
      scale: (item as any).scale,
    };
  }, [palette.floor, palette.furniture, palette.deco, roomBuildSelectedObjectId]);

  useEffect(() => {
    if (!roomBuildMode) return;
    const list =
      roomBuildCategory === 'floor'
        ? palette.floor
        : roomBuildCategory === 'furniture'
          ? palette.furniture
          : palette.deco;
    if (list.length === 0) return;
    if (roomBuildSelectedObjectId && list.some((i) => i.id === roomBuildSelectedObjectId)) return;
    setRoomBuildSelectedObjectId(list[0]!.id);
  }, [palette.floor, palette.furniture, palette.deco, roomBuildCategory, roomBuildMode, roomBuildSelectedObjectId]);

  // Build mode: selected objects
  const selectedInteractable = useMemo(() => {
    if (!buildSelectedObjectInstanceId || !game) return null;
    return game.worldMap.interactables.find((item) => item.objectInstanceId === buildSelectedObjectInstanceId) ?? null;
  }, [buildSelectedObjectInstanceId, game]);

  const selectedPlacedObject = useMemo(() => {
    if (!buildSelectedObjectInstanceId || !game) return null;
    const placementId = selectedInteractable?.placedObjectId ?? selectedInteractable?.objectInstanceId ?? buildSelectedObjectInstanceId;
    if (!placementId) return null;
    return game.worldMap.placedObjects.find((placement) => placement.id === placementId) ?? null;
  }, [buildSelectedObjectInstanceId, game, selectedInteractable]);

  // Dev mode checks
  const canToggleNight = import.meta.env.DEV || SHOW_DEBUG_UI;
  const canUseBuildMode = import.meta.env.DEV || SHOW_DEBUG_UI;
  const canUseRoomBuilder = (import.meta.env.DEV || SHOW_DEBUG_UI) && activeWorldKind === 'room';

  useEffect(() => {
    // Simple way to access editor: add ?editor=true to URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('editor') === 'true') {
      setShowEditor(true);
    }
    // Visual layout test: ?visual-test=true
    if (params.get('visual-test') === 'true') {
      setShowVisualTest(true);
    }
  }, []);

  useEffect(() => {
    if (!lobbyWorldId) return;
    setActiveWorldId((prev) => prev ?? lobbyWorldId);
  }, [lobbyWorldId]);

  const switchToLobby = () => {
    if (!lobbyWorldId) {
      toast.error('Lobby world is not ready yet.');
      return;
    }
    setActiveWorldKind('lobby');
    setActiveWorldId(lobbyWorldId);
  };

  const switchToRoom = async () => {
    setIsSwitchingWorld(true);
    try {
      const result = await getOrCreateMyRoomWorld({ guestKey });
      setActiveWorldKind('room');
      setActiveWorldId(result.worldId);
    } catch (error: any) {
      toast.error(error?.message ?? 'Failed to open your room.');
    } finally {
      setIsSwitchingWorld(false);
    }
  };

  // Reset tool states when world changes
  useEffect(() => {
    setBuildMode(false);
    setBuildSelectedObjectInstanceId(null);
    setRoomBuildMode(false);
  }, [activeWorldId]);

  // Keyboard shortcuts for tools
  useEffect(() => {
    if (!gameStarted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      const key = event.key.toLowerCase();
      if (key === 'n' && canToggleNight) {
        setIsNight((prev) => !prev);
      } else if (key === 'b' && canUseBuildMode) {
        setBuildMode((prev) => {
          const next = !prev;
          if (!next) setBuildSelectedObjectInstanceId(null);
          return next;
        });
      } else if (key === 'p' && canUseRoomBuilder) {
        setRoomBuildMode((prev) => !prev);
      } else if (key === 'r' && canUseRoomBuilder) {
        setRoomBuildRotation((prev) => (prev + (event.shiftKey ? -90 : 90) + 360) % 360);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameStarted, canToggleNight, canUseBuildMode, canUseRoomBuilder]);

  // Take over / release handlers
  const handleTakeOver = async (agentId: string) => {
    if (!activeWorldId) {
      toast.error('World is not ready yet.');
      return;
    }
    setIsJoining(true);
    try {
      const inputId = await takeOverAgent({ worldId: activeWorldId, agentId });
      await waitForInput(convex, inputId);
      setIsTakeOverDialogOpen(false);
    } catch (error: any) {
      if (error instanceof ConvexError) {
        toast.error(String(error.data));
      } else {
        toast.error(error?.message ?? 'Failed to take over agent.');
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!activeWorldId) return;
    setIsLeaving(true);
    try {
      const inputId = await leaveWorld({ worldId: activeWorldId });
      if (inputId) await waitForInput(convex, inputId);
    } catch (error: any) {
      if (error instanceof ConvexError) {
        toast.error(String(error.data));
      } else {
        toast.error(error?.message ?? 'Failed to leave.');
      }
    } finally {
      setIsLeaving(false);
    }
  };

  const handleTakeOverClick = () => {
    if (isPlaying) {
      void handleLeave();
    } else {
      setIsTakeOverDialogOpen(true);
    }
  };

  // Handle agent/player click to show profile card
  const handleAgentClick = (playerId: string) => {
    if (!game) return;
    const playerDesc = game.playerDescriptions.get(playerId as any);
    const player = game.world.players.get(playerId as any);
    if (!playerDesc) return;

    // Check if this is an agent
    const agent = [...game.world.agents.values()].find((a) => a.playerId === playerId);
    const agentDesc = agent ? game.agentDescriptions.get(agent.id) : null;
    const agentDescAny = agentDesc as any;

    // Build profile data from player/agent info
    const character = characterByName.get(playerDesc.character);
    const characterAny = character as any;

    // Get hobbies from agent or character, with fallback
    const hobbiesList: string[] = agentDescAny?.hobbies || characterAny?.hobbies || ['Exploring', 'Chatting'];

    setProfileCardData({
      name: playerDesc.name,
      avatar: characterAny?.spritesheet ? resolvePublicAsset(characterAny.spritesheet) : undefined,
      xHandle: agentDescAny?.xHandle || undefined,
      bio: playerDesc.description || characterAny?.bio || undefined,
      personality: agentDescAny?.personality || characterAny?.personality || ['Friendly', 'Curious'],
      hobbies: hobbiesList.map((h: string) => ({
        icon: h === 'Art' ? '🎨' : h === 'Music' ? '🎵' : h === 'Reading' ? '📚' : h === 'Gaming' ? '🎮' : h === 'Cooking' ? '🍳' : h === 'Gardening' ? '🌱' : '✨',
        label: h,
      })),
      stats: {
        followers: agentDescAny?.xFollowers || Math.floor(Math.random() * 5000),
        posts: agentDescAny?.xPosts || Math.floor(Math.random() * 200),
        friends: Math.floor(Math.random() * 50),
      },
      level: agentDescAny?.level || Math.floor(Math.random() * 20) + 1,
      mood: player?.activity?.description || 'Relaxed',
    });
    setProfileCardOpen(true);
  };

  // Build mode save/remove
  const saveBuildSelection = async () => {
    if (!selectedPlacedObject || !activeWorldId) return;
    const objectInstanceId = selectedInteractable?.objectInstanceId ?? selectedPlacedObject.id;
    const hitbox = selectedInteractable?.hitbox ?? {
      kind: 'tileRect' as const,
      x: selectedPlacedObject.col,
      y: selectedPlacedObject.row,
      w: 1,
      h: 1,
    };
    try {
      await upsertInteractable({
        worldId: activeWorldId,
        interactable: {
          objectInstanceId,
          objectType: buildTypeDraft,
          placedObjectId: selectedPlacedObject.id,
          hitbox,
          interactionRadius: buildRadiusDraft,
          displayName: buildNameDraft.trim() ? buildNameDraft.trim() : undefined,
        },
      });
      toast.success('Saved');
    } catch (error: any) {
      toast.error(error?.message ?? 'Failed to save.');
    }
  };

  const removeBuildSelection = async () => {
    if (!selectedPlacedObject || !activeWorldId) return;
    const objectInstanceId = selectedInteractable?.objectInstanceId ?? selectedPlacedObject.id;
    try {
      await removeInteractable({ worldId: activeWorldId, objectInstanceId });
      toast.success('Removed');
    } catch (error: any) {
      toast.error(error?.message ?? 'Failed to remove.');
    }
  };

  if (showVisualTest) {
    return <MapEditor />;
  }

  if (showEditor) {
    return <MapEditor />;
  }

  const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between font-body game-background">
      
      {helpModalOpen && (
        <ReactModal
          isOpen={helpModalOpen}
          onRequestClose={() => setHelpModalOpen(false)}
          style={modalStyles}
          contentLabel="Help Modal"
          ariaHideApp={false}
        >
          <div className="font-body">
            <h1 className="text-center text-6xl font-bold font-display game-title">Help</h1>
            <p>
              Welcome to Eliza Town! This is a virtual world where AI characters live, chat, and
              socialize.
            </p>
            <h2 className="text-4xl mt-4">Controls</h2>
            <p>
              Click and drag to move around the town. Click on a character to view their
              conversations.
            </p>
            <h2 className="text-4xl mt-4">About</h2>
            <p>
              Eliza Town is built with <a href="https://convex.dev">Convex</a>,{' '}
              <a href="https://pixijs.com/">PixiJS</a>, and{' '}
              <a href="https://react.dev/">React</a>. The interactions and conversations are driven
              by LLMs.
            </p>
          </div>
        </ReactModal>
      )}
      <CreateCharacterDialog
        isOpen={createCharacterOpen}
        onClose={() => setCreateCharacterOpen(false)}
      />
      <CreateAgentDialog
        isOpen={createAgentOpen}
        onClose={() => setCreateAgentOpen(false)}
        worldId={activeWorldId ?? undefined}
        onCreateCharacter={() => {
          setCreateAgentOpen(false);
          setCreateCharacterOpen(true);
        }}
      />
      <AgentListDialog
        isOpen={agentListOpen}
        onClose={() => setAgentListOpen(false)}
        worldId={activeWorldId ?? undefined}
        onCreateAgent={() => {
          setAgentListOpen(false);
          setCreateAgentOpen(true);
        }}
      />

      {!gameStarted ? (
        // LANDING PAGE STATE
        <div className="w-full h-screen flex flex-col items-center justify-center relative z-10">
          <h1 className="text-6xl sm:text-9xl font-bold font-display game-title mb-8 tracking-wider text-center">
            ELIZA TOWN
          </h1>
          
          <button
            onClick={() => setGameStarted(true)}
            className="px-12 py-6 bg-white/10 hover:bg-white/20 border-4 border-white text-white text-4xl font-bold font-display rounded-xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
          >
             ENTER WORLD 
          </button>

          <div className="absolute bottom-10 flex gap-6">
             <Button imgUrl={helpImg} onClick={() => setHelpModalOpen(true)}>
              Help
            </Button>
            <Button href="https://github.com/cayden970207/eliza-town" imgUrl={starImg}>
              Star
            </Button>
            <MusicButton />
            {clerkEnabled && (
              <SignedOut>
                <LoginButton />
              </SignedOut>
            )}
          </div>
          
           <div className="absolute bottom-2 right-4 text-white/50 text-sm">
            Powered by Convex
          </div>
        </div>
      ) : (
        // GAME STATE - New Sidebar + TopBar Layout
        <div className="w-full h-screen flex flex-col">
          {/* Top Bar */}
          <TopBar
            currentLocation={activeWorldKind}
            onLobbyClick={switchToLobby}
            onRoomClick={() => void switchToRoom()}
            lobbyDisabled={!lobbyWorldId || isSwitchingWorld}
            roomLoading={isSwitchingWorld}
            isPlaying={isPlaying}
            isJoiningOrLeaving={isJoining || isLeaving}
            onTakeOverClick={handleTakeOverClick}
            onExitClick={() => setGameStarted(false)}
            showLogin={clerkEnabled}
          />

          {/* Main content area with sidebar */}
          <div className="flex-grow flex overflow-hidden">
            {/* Left Sidebar */}
            <Sidebar
              onCharactersClick={() => setCreateCharacterOpen(true)}
              onNewAgentClick={() => setCreateAgentOpen(true)}
              onAgentsClick={() => setAgentListOpen(true)}
              showTools={canToggleNight || canUseBuildMode || canUseRoomBuilder}
              isNight={isNight}
              onNightToggle={() => setIsNight((prev) => !prev)}
              canToggleNight={canToggleNight}
              buildMode={buildMode}
              onBuildToggle={() => {
                setBuildMode((prev) => {
                  const next = !prev;
                  if (!next) setBuildSelectedObjectInstanceId(null);
                  return next;
                });
              }}
              canUseBuildMode={canUseBuildMode}
              roomBuildMode={roomBuildMode}
              onRoomBuildToggle={() => setRoomBuildMode((prev) => !prev)}
              canUseRoomBuilder={canUseRoomBuilder}
            >
              {/* Slide-out panel content for Build Mode only */}
              {buildMode && (
                <BuildModePanel
                  selectedObjectInstanceId={buildSelectedObjectInstanceId}
                  selectedObjectId={selectedPlacedObject?.objectId}
                  typeDraft={buildTypeDraft}
                  nameDraft={buildNameDraft}
                  radiusDraft={buildRadiusDraft}
                  typeOptions={[...INTERACTABLE_TYPE_OPTIONS]}
                  onTypeChange={(v) => setBuildTypeDraft(v as InteractableTypeId)}
                  onNameChange={setBuildNameDraft}
                  onRadiusChange={setBuildRadiusDraft}
                  onSave={saveBuildSelection}
                  onRemove={removeBuildSelection}
                  canRemove={!!selectedInteractable}
                />
              )}
            </Sidebar>

            {/* Left Panel: Room Builder */}
            {roomBuildMode && !buildMode && (
              <RoomBuilderPanel
                category={roomBuildCategory}
                onCategoryChange={setRoomBuildCategory}
                selectedObjectId={roomBuildSelectedObjectId}
                onObjectSelect={setRoomBuildSelectedObjectId}
                rotation={roomBuildRotation}
                onRotate={() => setRoomBuildRotation((prev) => (prev + 90) % 360)}
                onClose={() => setRoomBuildMode(false)}
                palette={palette}
              />
            )}

            {/* Game Canvas */}
            <div className="flex-grow relative overflow-hidden">
              <Game
                worldId={activeWorldId ?? undefined}
                worldKind={activeWorldKind}
                isNight={isNight}
                buildMode={buildMode}
                buildSelectedObjectInstanceId={buildSelectedObjectInstanceId}
                onBuildSelect={setBuildSelectedObjectInstanceId}
                roomBuildMode={roomBuildMode}
                roomBuildCategory={roomBuildCategory}
                roomBuildSelectedObjectId={roomBuildSelectedObjectId}
                roomBuildRotation={roomBuildRotation}
                roomBuildPreviewItem={roomBuildPreviewItem}
                onPlayerClick={handleAgentClick}
              />
            </div>
          </div>

          {/* Take Over Dialog */}
          <ReactModal
            isOpen={isTakeOverDialogOpen}
            onRequestClose={() => setIsTakeOverDialogOpen(false)}
            style={modalStyles}
            contentLabel="Take Over Agent"
            ariaHideApp={false}
          >
            <div className="font-body">
              <h2 className="text-2xl font-bold mb-4">Take Over an Agent</h2>
              {takeoverAgents.length === 0 ? (
                <p className="text-white/70 mb-4">No agents available to take over.</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {takeoverAgents.map((agent) => (
                    <button
                      key={agent.agentId}
                      onClick={() => void handleTakeOver(agent.agentId)}
                      disabled={isJoining}
                      className="w-full text-left px-4 py-2 bg-white/10 hover:bg-white/20 rounded transition-colors disabled:opacity-50"
                    >
                      {agent.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setCreateAgentOpen(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white"
                >
                  Create New Agent
                </button>
                <button
                  onClick={() => setIsTakeOverDialogOpen(false)}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </ReactModal>

          {/* Profile Card Overlay */}
          {profileCardOpen && profileCardData && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              onClick={() => setProfileCardOpen(false)}
            >
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
              <div onClick={(e) => e.stopPropagation()}>
                <ProfileCard
                  name={profileCardData.name}
                  avatar={profileCardData.avatar}
                  xHandle={profileCardData.xHandle}
                  bio={profileCardData.bio}
                  personality={profileCardData.personality}
                  hobbies={profileCardData.hobbies}
                  stats={profileCardData.stats}
                  level={profileCardData.level}
                  mood={profileCardData.mood}
                  onClose={() => setProfileCardOpen(false)}
                  onChat={() => {
                    setProfileCardOpen(false);
                    // TODO: Open chat with this agent
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
      
      <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
    </main>
  );
}

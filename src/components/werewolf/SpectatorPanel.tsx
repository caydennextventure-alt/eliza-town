import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import ReactModal from 'react-modal';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useSendInput } from '../../hooks/sendInput';
import { useServerGame } from '../../hooks/serverGame';
import { CharacterDefinition, useCharacters } from '../../lib/characterRegistry';
import { toastOnError } from '../../toasts';
import { buildKeyMoments, buildVoteTally, formatCountdown } from './spectatorUtils';

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
    maxWidth: '1200px',
    width: '96%',
    height: '90vh',
    maxHeight: '90vh',
    overflow: 'hidden',
    border: '6px solid rgb(18, 22, 32)',
    borderRadius: '0',
    padding: '0',
    background: 'rgb(11, 15, 24)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};

const DEFAULT_EVENTS_LIMIT = 200;
const BASE_SPECTATOR_WIDTH = 1500;
const BASE_SPECTATOR_HEIGHT = 980;
const MIN_SPECTATOR_SCALE = 0.75;
const MAX_SPECTATOR_SCALE = 1;

const PHASE_ORDER = [
  'LOBBY',
  'NIGHT',
  'DAY_ANNOUNCE',
  'DAY_OPENING',
  'DAY_DISCUSSION',
  'DAY_VOTE',
  'DAY_RESOLUTION',
] as const;
type PhaseKey = (typeof PHASE_ORDER)[number];

const PHASE_LABELS: Record<PhaseKey, string> = {
  LOBBY: 'Lobby',
  NIGHT: 'Night',
  DAY_ANNOUNCE: 'Day announce',
  DAY_OPENING: 'Day opening',
  DAY_DISCUSSION: 'Day discussion',
  DAY_VOTE: 'Day vote',
  DAY_RESOLUTION: 'Day resolution',
};

const PHASE_HINTS: Record<PhaseKey, string> = {
  LOBBY: 'Seats fill and players ready up.',
  NIGHT: 'Night falls. Secrets move in the dark.',
  DAY_ANNOUNCE: 'The town learns what happened overnight.',
  DAY_OPENING: 'Opening statements set the tone.',
  DAY_DISCUSSION: 'The town debates, accuse, and defend.',
  DAY_VOTE: 'Cast your vote before time runs out.',
  DAY_RESOLUTION: 'Judgment is delivered. The day ends.',
};

const STORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'chat', label: 'Chat' },
  { id: 'events', label: 'Events' },
  { id: 'votes', label: 'Votes' },
] as const;
type StoryFilter = (typeof STORY_FILTERS)[number]['id'];

type Props = {
  isOpen: boolean;
  matchId: string | null;
  onClose: () => void;
};

type TranscriptEntry = {
  eventId: string;
  timeLabel: string;
  title: string;
  text: string;
  kind: 'message' | 'system' | 'vote' | 'narrator';
  playerId?: string | null;
  visibility: 'PUBLIC' | 'PRIVATE';
};

type ReplayMarkerType = 'phase' | 'night' | 'death' | 'end';

type ReplayMarker = {
  eventId: string;
  index: number;
  type: ReplayMarkerType;
};

type WinningTeam = 'VILLAGERS' | 'WEREWOLVES';

type SpectatorEventView = {
  eventId: string;
  at: string;
  type: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  payload: Record<string, unknown>;
};

function formatMatchId(matchId: string): string {
  if (matchId.length <= 8) {
    return matchId;
  }
  return `${matchId.slice(0, 6)}...${matchId.slice(-4)}`;
}

function formatTimeLabel(isoTimestamp: string): string {
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) {
    return isoTimestamp;
  }
  return new Date(parsed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatPhaseLabel(phase: string): string {
  if (phase in PHASE_LABELS) {
    return PHASE_LABELS[phase as PhaseKey];
  }
  return phase.replace(/_/g, ' ').toLowerCase();
}

function getSpriteFrameStyle(
  character: CharacterDefinition,
  direction: 'down' | 'up' | 'left' | 'right',
  sizePx: number,
) {
  const frame = character.spritesheetData.frames[direction];
  const frameWidth = frame.frame.w;
  const frameHeight = frame.frame.h;
  const sheetWidth = frameWidth * 3;
  const sheetHeight = frameHeight * 4;
  const scale = sizePx / frameWidth;
  return {
    width: sizePx,
    height: Math.round(frameHeight * scale),
    backgroundImage: `url(${character.textureUrl})`,
    backgroundPosition: `-${frame.frame.x * scale}px -${frame.frame.y * scale}px`,
    backgroundSize: `${sheetWidth * scale}px ${sheetHeight * scale}px`,
    backgroundRepeat: 'no-repeat',
  };
}

function buildTranscriptEntries(
  events: SpectatorEventView[],
  playerNameById: Map<string, string>,
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  for (const event of events) {
    const payload = asRecord(event.payload) ?? {};
    const timeLabel = formatTimeLabel(event.at);
    const isPrivate = event.visibility === 'PRIVATE';
    const privateLabel = isPrivate ? ' (Private)' : '';

    switch (event.type) {
      case 'PUBLIC_MESSAGE': {
        const playerId = typeof payload.playerId === 'string' ? payload.playerId : null;
        const text = typeof payload.text === 'string' ? payload.text : null;
        if (!playerId || !text) {
          break;
        }
        const kind = typeof payload.kind === 'string' ? payload.kind : null;
        const prefix = kind && kind !== 'DISCUSSION' ? `[${kind}] ` : '';
        entries.push({
          eventId: event.eventId,
          timeLabel,
          title: playerNameById.get(playerId) ?? playerId,
          text: `${prefix}${text}`,
          kind: 'message',
          playerId,
          visibility: event.visibility,
        });
        break;
      }
      case 'NARRATOR': {
        const text = typeof payload.text === 'string' ? payload.text : null;
        if (!text) {
          break;
        }
        entries.push({
          eventId: event.eventId,
          timeLabel,
          title: `Narrator${privateLabel}`,
          text,
          kind: 'narrator',
          visibility: event.visibility,
        });
        break;
      }
      case 'WOLF_CHAT_MESSAGE': {
        const fromWolfId = typeof payload.fromWolfId === 'string' ? payload.fromWolfId : null;
        const text = typeof payload.text === 'string' ? payload.text : null;
        if (!fromWolfId || !text) {
          break;
        }
        const wolfName = playerNameById.get(fromWolfId) ?? fromWolfId;
        entries.push({
          eventId: event.eventId,
          timeLabel,
          title: `Wolf chat${privateLabel}`,
          text: `${wolfName}: ${text}`,
          kind: 'message',
          playerId: fromWolfId,
          visibility: event.visibility,
        });
        break;
      }
      case 'PHASE_CHANGED': {
        const toPhase = typeof payload.to === 'string' ? payload.to : null;
        const dayNumber = typeof payload.dayNumber === 'number' ? payload.dayNumber : null;
        if (!toPhase) {
          break;
        }
        const dayLabel = dayNumber !== null ? `Day ${dayNumber}` : 'Day ?';
        entries.push({
          eventId: event.eventId,
          timeLabel,
          title: 'Phase',
          text: `Phase changed to ${toPhase} (${dayLabel}).`,
          kind: 'system',
          visibility: event.visibility,
        });
        break;
      }
      case 'VOTE_CAST': {
        const voterId = typeof payload.voterPlayerId === 'string' ? payload.voterPlayerId : null;
        if (!voterId) {
          break;
        }
        const targetField = payload.targetPlayerId;
        const targetId = typeof targetField === 'string' ? targetField : null;
        const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
        const voterName = playerNameById.get(voterId) ?? voterId;
        const targetName = targetId ? playerNameById.get(targetId) ?? targetId : 'Abstain';
        const reasonSuffix = reason ? ` (${reason})` : '';
        entries.push({
          eventId: event.eventId,
          timeLabel,
          title: 'Vote',
          text: `${voterName} -> ${targetName}${reasonSuffix}`,
          kind: 'vote',
          playerId: voterId,
          visibility: event.visibility,
        });
        break;
      }
      case 'NIGHT_RESULT': {
        const killedId = typeof payload.killedPlayerId === 'string' ? payload.killedPlayerId : null;
        const savedByDoctor = payload.savedByDoctor === true;
        const killedName = killedId ? playerNameById.get(killedId) ?? killedId : null;
        const text = killedName
          ? `Night result: ${killedName} was killed.`
          : savedByDoctor
            ? 'Night result: no one died (doctor saved).'
            : 'Night result: no one died.';
        entries.push({
          eventId: event.eventId,
          timeLabel,
          title: 'Night',
          text,
          kind: 'system',
          visibility: event.visibility,
        });
        break;
      }
      case 'PLAYER_ELIMINATED': {
        const playerId = typeof payload.playerId === 'string' ? payload.playerId : null;
        const role = typeof payload.roleRevealed === 'string' ? payload.roleRevealed : null;
        if (!playerId || !role) {
          break;
        }
        const name = playerNameById.get(playerId) ?? playerId;
        entries.push({
          eventId: event.eventId,
          timeLabel,
          title: 'Elimination',
          text: `${name} was eliminated. Role: ${role}.`,
          kind: 'system',
          playerId,
          visibility: event.visibility,
        });
        break;
      }
      case 'GAME_ENDED': {
        const winningTeam = typeof payload.winningTeam === 'string' ? payload.winningTeam : null;
        if (!winningTeam) {
          break;
        }
        entries.push({
          eventId: event.eventId,
          timeLabel,
          title: 'Game',
          text: `Game ended: ${winningTeam} win.`,
          kind: 'system',
          visibility: event.visibility,
        });
        break;
      }
      case 'MATCH_CREATED': {
        entries.push({
          eventId: event.eventId,
          timeLabel,
          title: 'Match',
          text: 'Match created.',
          kind: 'system',
          visibility: event.visibility,
        });
        break;
      }
      default:
        break;
    }
  }

  return entries;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function buildVoteTargets(
  events: SpectatorEventView[],
  players: { playerId: string; alive: boolean }[],
) {
  const alivePlayers = new Set(players.filter((player) => player.alive).map((player) => player.playerId));
  const latestVotes = new Map<string, string | null>();
  let lastDayVoteIndex = -1;

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.type !== 'PHASE_CHANGED') {
      continue;
    }
    const payload = asRecord(event.payload);
    const toPhase = typeof payload?.to === 'string' ? payload.to : null;
    if (toPhase === 'DAY_VOTE') {
      lastDayVoteIndex = i;
    }
  }

  for (let i = 0; i < events.length; i += 1) {
    if (i <= lastDayVoteIndex) {
      continue;
    }
    const event = events[i];
    if (event.type !== 'VOTE_CAST') {
      continue;
    }
    const payload = asRecord(event.payload);
    const voterPlayerId = typeof payload?.voterPlayerId === 'string' ? payload.voterPlayerId : null;
    if (!voterPlayerId || !alivePlayers.has(voterPlayerId)) {
      continue;
    }
    const targetField = payload?.targetPlayerId;
    const targetPlayerId = typeof targetField === 'string' ? targetField : targetField === null ? null : null;
    latestVotes.set(voterPlayerId, targetPlayerId);
  }

  return latestVotes;
}

function getReplayMarkerType(event: SpectatorEventView): ReplayMarkerType | null {
  if (event.type === 'PHASE_CHANGED') {
    return 'phase';
  }
  if (event.type === 'PLAYER_ELIMINATED') {
    return 'death';
  }
  if (event.type === 'NIGHT_RESULT') {
    return 'night';
  }
  if (event.type === 'GAME_ENDED') {
    return 'end';
  }
  return null;
}

function getWinningTeam(events: SpectatorEventView[]): WinningTeam | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type !== 'GAME_ENDED') {
      continue;
    }
    const payload = asRecord(event.payload);
    const winningTeam = typeof payload?.winningTeam === 'string' ? payload.winningTeam : null;
    if (winningTeam === 'VILLAGERS' || winningTeam === 'WEREWOLVES') {
      return winningTeam;
    }
  }
  return null;
}

export default function SpectatorPanel({ isOpen, matchId, onClose }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isTeleporting, setIsTeleporting] = useState(false);
  const [viewMode, setViewMode] = useState<'public' | 'omniscient'>('public');
  const [storyFilter, setStoryFilter] = useState<StoryFilter>('all');
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(null);
  const [selectedMarkerIndex, setSelectedMarkerIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<1 | 2 | 4>(1);
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null);
  const [spectatorScale, setSpectatorScale] = useState(0.8);
  const scaleContainerRef = useRef<HTMLDivElement | null>(null);
  const entryRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const shouldLoad = isOpen && Boolean(matchId);
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;
  const game = useServerGame(worldId);
  const { characters } = useCharacters();
  const characterByName = useMemo(
    () => new Map(characters.map((character) => [character.name, character] as const)),
    [characters],
  );
  const humanTokenIdentifier = useQuery(api.world.userStatus, worldId ? { worldId } : 'skip');
  const humanPlayerId = useMemo(() => {
    if (!game || !humanTokenIdentifier) {
      return null;
    }
    return (
      [...game.world.players.values()].find((player) => player.human === humanTokenIdentifier)
        ?.id ?? null
    );
  }, [game, humanTokenIdentifier]);
  const moveTo = useSendInput(engineId ?? ('' as Id<'engines'>), 'moveTo');
  const includeSpoilers = viewMode === 'omniscient';
  const matchState = useQuery(
    api.werewolf.matchGetState,
    shouldLoad && matchId ? { matchId, includeSpoilers } : 'skip',
  );
  const eventsResult = useQuery(
    api.werewolf.matchEventsGet,
    shouldLoad && matchId ? { matchId, limit: DEFAULT_EVENTS_LIMIT, includeSpoilers } : 'skip',
  );
  const buildingResult = useQuery(
    api.werewolf.matchBuildingGet,
    shouldLoad && matchId ? { matchId } : 'skip',
  );

  useEffect(() => {
    if (!isOpen) {
      setViewMode('public');
      setStoryFilter('all');
      setFocusedPlayerId(null);
      setSelectedMarkerIndex(null);
      setIsPlaying(false);
      setPlaySpeed(1);
      setHighlightedEntryId(null);
      return;
    }
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    const container = scaleContainerRef.current;
    if (!container) {
      return;
    }
    const updateScale = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) {
        return;
      }
      const scale = Math.min(width / BASE_SPECTATOR_WIDTH, height / BASE_SPECTATOR_HEIGHT);
      const clamped = Math.max(MIN_SPECTATOR_SCALE, Math.min(MAX_SPECTATOR_SCALE, scale));
      setSpectatorScale(clamped);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isOpen]);

  const state = matchState?.state ?? null;
  const events = eventsResult?.events ?? [];
  const building = buildingResult?.building ?? null;
  const isWorldMismatch = Boolean(building && worldId && building.worldId !== worldId);
  const teleportDisabledReason = !matchId
    ? 'Select a match to teleport.'
    : !building
      ? 'Match building is not available yet.'
      : !engineId || !worldId
        ? 'World is still loading.'
        : !humanPlayerId
          ? 'Join the world to teleport.'
          : isWorldMismatch
            ? 'Match is in a different world.'
            : null;
  const canTeleport = teleportDisabledReason === null && !isTeleporting;

  const players = useMemo(
    () => (state ? [...state.players].sort((a, b) => a.seat - b.seat) : []),
    [state],
  );
  const playerNameById = useMemo(
    () => new Map(players.map((player) => [player.playerId, player.displayName])),
    [players],
  );
  const playerMetaById = useMemo(() => {
    const result = new Map<string, {
      displayName: string;
      seat: number;
      alive: boolean;
      revealedRole: string | null;
      character?: CharacterDefinition;
    }>();
    for (const player of players) {
      const description = game?.playerDescriptions.get(player.playerId);
      const characterName = description?.character;
      const character = characterName ? characterByName.get(characterName) : undefined;
      result.set(player.playerId, {
        displayName: player.displayName,
        seat: player.seat,
        alive: player.alive,
        revealedRole: player.revealedRole ?? null,
        character,
      });
    }
    return result;
  }, [players, game, characterByName]);
  const aliveCount = useMemo(() => players.filter((player) => player.alive).length, [players]);
  const countdown = useMemo(
    () => (state ? formatCountdown(state.phaseEndsAt, nowMs) : null),
    [state, nowMs],
  );
  const visibleEvents = useMemo(
    () =>
      includeSpoilers
        ? events
        : events.filter((event) => event.visibility === 'PUBLIC'),
    [events, includeSpoilers],
  );
  const activeSpeakerId = useMemo(() => {
    for (let i = visibleEvents.length - 1; i >= 0; i -= 1) {
      const event = visibleEvents[i];
      const payload = asRecord(event.payload);
      if (event.type === 'PUBLIC_MESSAGE' && typeof payload?.playerId === 'string') {
        return payload.playerId;
      }
      if (event.type === 'WOLF_CHAT_MESSAGE' && typeof payload?.fromWolfId === 'string') {
        return payload.fromWolfId;
      }
    }
    return null;
  }, [visibleEvents]);
  const lastSpokeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of visibleEvents) {
      const payload = asRecord(event.payload);
      if (event.type === 'PUBLIC_MESSAGE' && typeof payload?.playerId === 'string') {
        map.set(payload.playerId, event.at);
      }
      if (event.type === 'WOLF_CHAT_MESSAGE' && typeof payload?.fromWolfId === 'string') {
        map.set(payload.fromWolfId, event.at);
      }
    }
    return map;
  }, [visibleEvents]);
  const transcriptEntries = useMemo(
    () => buildTranscriptEntries(visibleEvents, playerNameById),
    [visibleEvents, playerNameById],
  );
  const voteTally = useMemo(
    () => (state ? buildVoteTally(visibleEvents, players) : []),
    [visibleEvents, players, state],
  );
  const voteTargets = useMemo(
    () => buildVoteTargets(visibleEvents, players),
    [visibleEvents, players],
  );
  const keyMoments = useMemo(
    () => buildKeyMoments(visibleEvents, playerNameById, 6),
    [visibleEvents, playerNameById],
  );
  const replayMarkers = useMemo<ReplayMarker[]>(() => {
    const markers: ReplayMarker[] = [];
    visibleEvents.forEach((event, index) => {
      const type = getReplayMarkerType(event);
      if (!type) return;
      markers.push({
        eventId: event.eventId,
        index,
        type,
      });
    });
    return markers;
  }, [visibleEvents]);
  const winningTeam = useMemo(() => getWinningTeam(visibleEvents), [visibleEvents]);
  const selectedMarker =
    selectedMarkerIndex !== null ? replayMarkers[selectedMarkerIndex] ?? null : null;
  const filteredEntries = useMemo(() => {
    let next = transcriptEntries;
    if (storyFilter === 'chat') {
      next = next.filter((entry) => entry.kind === 'message');
    } else if (storyFilter === 'events') {
      next = next.filter((entry) => entry.kind === 'system' || entry.kind === 'narrator');
    } else if (storyFilter === 'votes') {
      next = next.filter((entry) => entry.kind === 'vote');
    }
    if (focusedPlayerId) {
      next = next.filter((entry) => entry.playerId === focusedPlayerId);
    }
    return next;
  }, [transcriptEntries, storyFilter, focusedPlayerId]);
  const latestEntry = filteredEntries[filteredEntries.length - 1] ?? null;
  const isReplayMode = Boolean(state && state.phase === 'ENDED');
  const currentPhaseIndex = useMemo(() => {
    if (!state) return -1;
    const index = PHASE_ORDER.indexOf(state.phase as PhaseKey);
    if (index === -1 && state.phase === 'ENDED') {
      return PHASE_ORDER.length - 1;
    }
    return index;
  }, [state]);
  const nextPhase = currentPhaseIndex >= 0 ? PHASE_ORDER[Math.min(currentPhaseIndex + 1, PHASE_ORDER.length - 1)] : null;

  useEffect(() => {
    if (!selectedMarker) {
      return;
    }
    const node = entryRefs.current.get(selectedMarker.eventId);
    if (!node) {
      return;
    }
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedEntryId(selectedMarker.eventId);
    const timeout = window.setTimeout(() => setHighlightedEntryId(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [selectedMarker, filteredEntries]);

  useEffect(() => {
    if (selectedMarkerIndex === null) {
      return;
    }
    if (replayMarkers.length === 0) {
      setSelectedMarkerIndex(null);
      return;
    }
    if (selectedMarkerIndex >= replayMarkers.length) {
      setSelectedMarkerIndex(replayMarkers.length - 1);
    }
  }, [replayMarkers, selectedMarkerIndex]);
  const handleTeleport = async () => {
    if (!canTeleport || !building || !engineId || !humanPlayerId) {
      return;
    }
    setIsTeleporting(true);
    try {
      await toastOnError(
        moveTo({
          playerId: humanPlayerId,
          destination: {
            x: Math.floor(building.x),
            y: Math.floor(building.y),
          },
        }),
      );
    } finally {
      setIsTeleporting(false);
    }
  };

  const handleSelectMarkerIndex = (index: number) => {
    if (index < 0 || index >= replayMarkers.length) {
      return;
    }
    setStoryFilter('all');
    setFocusedPlayerId(null);
    setSelectedMarkerIndex(index);
  };

  const handlePrevMarker = () => {
    if (replayMarkers.length === 0) return;
    const nextIndex =
      selectedMarkerIndex === null
        ? replayMarkers.length - 1
        : Math.max(0, selectedMarkerIndex - 1);
    handleSelectMarkerIndex(nextIndex);
  };

  const handleStartMarker = () => {
    if (replayMarkers.length === 0) return;
    handleSelectMarkerIndex(0);
  };

  const handleNextMarker = () => {
    if (replayMarkers.length === 0) return;
    const nextIndex =
      selectedMarkerIndex === null
        ? 0
        : Math.min(replayMarkers.length - 1, selectedMarkerIndex + 1);
    handleSelectMarkerIndex(nextIndex);
  };

  const handleTogglePlay = () => {
    if (replayMarkers.length === 0) return;
    if (!isPlaying && selectedMarkerIndex === null) {
      handleSelectMarkerIndex(0);
    }
    setIsPlaying((prev) => !prev);
  };

  const handleSpeedToggle = () => {
    setPlaySpeed((prev) => (prev === 1 ? 2 : prev === 2 ? 4 : 1));
  };

  useEffect(() => {
    if (!isReplayMode || !isPlaying || replayMarkers.length === 0) {
      return;
    }
    const nextIndex =
      selectedMarkerIndex === null ? 0 : Math.min(replayMarkers.length - 1, selectedMarkerIndex + 1);
    if (selectedMarkerIndex !== null && nextIndex === selectedMarkerIndex) {
      setIsPlaying(false);
      return;
    }
    const delayMs = 1400 / playSpeed;
    const timeout = window.setTimeout(() => {
      setStoryFilter('all');
      setFocusedPlayerId(null);
      setSelectedMarkerIndex(nextIndex);
    }, delayMs);
    return () => window.clearTimeout(timeout);
  }, [isReplayMode, isPlaying, playSpeed, replayMarkers, selectedMarkerIndex]);

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="Werewolf Spectator Panel"
      ariaHideApp={false}
    >
      <div ref={scaleContainerRef} className="h-full min-h-0" data-testid="werewolf-spectator-panel">
        <div
          className="flex h-full min-h-0 flex-col font-dialog text-white"
          style={{
            transform: `scale(${spectatorScale})`,
            transformOrigin: 'top left',
            width: `${(1 / spectatorScale) * 100}%`,
            height: `${(1 / spectatorScale) * 100}%`,
          }}
        >
        <div className="border-b border-[#222a3b] bg-gradient-to-r from-[#0e1220] via-[#151a2b] to-[#1b2233] px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl tracking-wide">Werewolf Spectator</h2>
                <span
                  className={clsx(
                    'text-[12px] uppercase tracking-widest border px-2 py-0.5',
                    isReplayMode
                      ? 'border-[#8b1b1b]/70 text-[#f0b7b7]'
                      : 'border-[#6ae3f9]/50 text-[#b3f4ff]',
                  )}
                >
                  {isReplayMode ? 'Replay' : 'Live'}
                </span>
              </div>
              <div className="text-[12px] uppercase tracking-[0.3em] text-white/50">
                Match {matchId ? formatMatchId(matchId) : 'Unknown'}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-right">
                <div className="text-[12px] uppercase tracking-widest text-white/40">Day</div>
                <div className="text-lg">{state?.dayNumber ?? '--'}</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] uppercase tracking-widest text-white/40">Phase</div>
                <div className="text-lg">{state ? formatPhaseLabel(state.phase) : '--'}</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] uppercase tracking-widest text-white/40">Time left</div>
                <div
                  className={clsx(
                    'text-2xl',
                    countdown?.isExpired ? 'text-[#c92828]' : 'text-[#6ae3f9]',
                  )}
                >
                  {countdown?.label ?? '--:--'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[12px] uppercase tracking-widest text-white/40">Next</div>
                <div className="text-base text-white/70">
                  {nextPhase ? PHASE_LABELS[nextPhase] : '--'}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded border border-[#2b3346] bg-[#0f1422] p-0.5 text-[12px] uppercase tracking-widest">
                <button
                  type="button"
                  onClick={() => setViewMode('public')}
                  className={clsx(
                    'px-2 py-1',
                    viewMode === 'public'
                      ? 'bg-[#1d2434] text-white'
                      : 'text-white/50 hover:text-white',
                  )}
                >
                  Public
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('omniscient')}
                  className={clsx(
                    'px-2 py-1',
                    viewMode === 'omniscient'
                      ? 'bg-[#1d2434] text-[#f0b7b7]'
                      : 'text-white/50 hover:text-white',
                  )}
                >
                  Omniscient
                </button>
              </div>
              {matchId ? (
                <button
                  type="button"
                  onClick={handleTeleport}
                  disabled={!canTeleport}
                  title={teleportDisabledReason ?? undefined}
                  className="border border-[#6ae3f9]/50 px-3 py-1 text-[12px] uppercase tracking-widest text-[#b3f4ff] hover:border-[#6ae3f9] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isTeleporting ? 'Teleporting...' : 'Teleport'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (!matchId) return;
                  void navigator.clipboard?.writeText(matchId);
                }}
                className="border border-white/30 px-3 py-1 text-[12px] uppercase tracking-widest text-white/80 hover:border-white/60"
              >
                Share
              </button>
              <button
                type="button"
                onClick={onClose}
                className="border border-white/30 px-3 py-1 text-sm hover:border-white"
              >
                Close
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] uppercase tracking-widest text-white/40">
            {PHASE_ORDER.map((phase, index) => {
              const isActive = index === currentPhaseIndex;
              const isComplete = currentPhaseIndex !== -1 && index < currentPhaseIndex;
              return (
                <div key={phase} className="flex items-center gap-2">
                  <span
                    className={clsx(
                      'h-2 w-2 rounded-full border',
                      isActive
                        ? 'border-[#6ae3f9] bg-[#6ae3f9]'
                        : isComplete
                          ? 'border-[#596579] bg-[#2b3346]'
                          : 'border-[#2b3346] bg-transparent',
                    )}
                  />
                  <span className={clsx(isActive ? 'text-white' : 'text-white/40')}>
                    {PHASE_LABELS[phase]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {!matchId ? (
          <div className="px-6 py-6 text-base text-white/70">
            Select a match to open the spectator view.
          </div>
        ) : matchState === undefined || state === null ? (
          <div className="px-6 py-6 text-base text-white/70">Loading match details...</div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 gap-4 overflow-hidden px-6 py-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.6fr)_minmax(0,0.9fr)]">
              <section className="flex min-h-0 flex-col gap-4">
                <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-[#222a3b] bg-[#101625] p-2.5">
                  <div className="flex items-center justify-between text-[12px] uppercase tracking-[0.3em] text-white/50">
                    <span>Stage</span>
                    <span className="text-white/60">
                      Alive {aliveCount}/{players.length}
                    </span>
                  </div>
                  <div className="relative mt-2 flex min-h-0 flex-1">
                    <div className="absolute inset-3 rounded-full bg-gradient-to-b from-[#1a2235] to-[#0b0f18] opacity-80" />
                    <div className="relative grid h-full grid-cols-2 auto-rows-fr gap-2">
                      {players.map((player) => {
                        const meta = playerMetaById.get(player.playerId);
                        const isFocused = focusedPlayerId === player.playerId;
                        const isActive = activeSpeakerId === player.playerId;
                        const revealedRole = player.revealedRole;
                        const isWerewolf = revealedRole === 'WEREWOLF';
                        const isWinningPlayer =
                          winningTeam === 'WEREWOLVES'
                            ? isWerewolf
                            : winningTeam === 'VILLAGERS'
                              ? revealedRole !== null && !isWerewolf
                              : false;
                        const isWinner = state.phase === 'ENDED' && player.alive && isWinningPlayer;
                        const voteTargetId = voteTargets.get(player.playerId) ?? null;
                        const voteTargetName = voteTargetId
                          ? playerNameById.get(voteTargetId) ?? voteTargetId
                          : voteTargetId === null
                            ? 'Abstain'
                            : null;
                        return (
                          <button
                            key={player.playerId}
                            type="button"
                            onClick={() =>
                              setFocusedPlayerId((prev) => (prev === player.playerId ? null : player.playerId))
                            }
                            className={clsx(
                              'relative flex h-full flex-col gap-2 rounded-md border px-2 py-1.5 text-left transition',
                              isFocused ? 'border-[#6ae3f9]/80 bg-[#131b2b]' : 'border-[#232c3f] bg-[#0f1422]',
                              isActive && 'shadow-[0_0_12px_rgba(106,227,249,0.35)]',
                            )}
                          >
                            <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-white/50">
                              <span>Seat {player.seat}</span>
                              <span
                                className={clsx(
                                  'px-2 py-0.5 border',
                                  player.alive
                                    ? 'border-[#6ae3f9]/40 text-[#b3f4ff]'
                                    : 'border-[#8b1b1b]/70 text-[#f0b7b7]',
                                )}
                              >
                                {player.alive ? 'Alive' : 'Dead'}
                              </span>
                            </div>
                            <div className="flex flex-1 flex-col items-center justify-center gap-1">
                              <div
                                className={clsx(
                                  'relative flex h-16 w-16 items-center justify-center rounded-sm border border-[#2b3346] bg-black/40',
                                  isWinner && 'werewolf-dance',
                                  !player.alive && 'opacity-60 grayscale',
                                )}
                              >
                                {meta?.character ? (
                                  <div
                                    className="pixelated"
                                    style={getSpriteFrameStyle(
                                      meta.character,
                                      player.alive ? 'down' : 'up',
                                      60,
                                    )}
                                  />
                                ) : (
                                  <span className="text-sm text-white/50">?</span>
                                )}
                                {isActive ? (
                                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#6ae3f9] shadow-[0_0_6px_rgba(106,227,249,0.7)]" />
                                ) : null}
                              </div>
                              <div className="w-full text-center">
                                <div className="text-sm text-white truncate">{player.displayName}</div>
                                <div className="text-[11px] uppercase tracking-widest text-white/60 min-h-[14px]">
                                  {player.revealedRole ?? ''}
                                </div>
                              </div>
                            </div>
                            {state.phase === 'DAY_VOTE' ? (
                              <div className="mt-1.5 text-[11px] uppercase tracking-widest text-white/50 truncate">
                                Vote · <span className="text-white/80">{voteTargetName ?? '—'}</span>
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              <section className="flex min-h-0 flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12px] uppercase tracking-[0.3em] text-white/50">
                    Story feed
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {STORY_FILTERS.map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setStoryFilter(filter.id)}
                        className={clsx(
                          'rounded-sm border px-2 py-1 text-[12px] uppercase tracking-widest',
                          storyFilter === filter.id
                            ? 'border-[#6ae3f9]/60 text-white'
                            : 'border-[#2b3346] text-white/50 hover:text-white',
                        )}
                      >
                        {filter.label}
                      </button>
                    ))}
                    {focusedPlayerId ? (
                      <button
                        type="button"
                        onClick={() => setFocusedPlayerId(null)}
                        className="rounded-sm border border-[#8b1b1b]/70 px-2 py-1 text-[12px] uppercase tracking-widest text-[#f0b7b7]"
                      >
                        Clear focus
                      </button>
                    ) : null}
                  </div>
                </div>
                {latestEntry ? (
                  <div className="rounded-md border border-[#2b3346] bg-[#131a29] px-3 py-2 text-base">
                    <div className="flex items-center justify-between text-[12px] uppercase tracking-widest text-white/50">
                      <span>Latest</span>
                      <span>{latestEntry.timeLabel}</span>
                    </div>
                    <div className="mt-1 text-white/90">{latestEntry.text}</div>
                  </div>
                ) : null}
                <div className="flex-1 overflow-hidden rounded-lg border border-[#222a3b] bg-[#0f1422]">
                  <div className="h-full space-y-3 overflow-y-auto px-4 py-4 text-base">
                    {filteredEntries.length > 0 ? (
                      filteredEntries.map((entry) => {
                        const meta = entry.playerId ? playerMetaById.get(entry.playerId) : undefined;
                        const isSelected = selectedMarker?.eventId === entry.eventId;
                        const isHighlighted = highlightedEntryId === entry.eventId;
                        return (
                          <div
                            key={entry.eventId}
                            ref={(node) => {
                              if (node) {
                                entryRefs.current.set(entry.eventId, node);
                              } else {
                                entryRefs.current.delete(entry.eventId);
                              }
                            }}
                            className={clsx(
                              'flex gap-3 rounded-md border px-3 py-2 transition',
                              isSelected && 'border-[#6ae3f9]/70 shadow-[0_0_12px_rgba(106,227,249,0.25)]',
                              isHighlighted && 'ring-1 ring-[#6ae3f9]/60',
                              entry.kind === 'message' && 'border-[#20283a] bg-[#111828]',
                              entry.kind === 'vote' && 'border-[#3a2630] bg-[#1a141a]',
                              entry.kind === 'system' && 'border-[#222a3b] bg-[#0c111d]',
                              entry.kind === 'narrator' && 'border-[#2d2f38] bg-[#11131e]',
                            )}
                          >
                            <div className="flex flex-col items-center gap-2">
                              <div className="flex h-9 w-9 items-center justify-center rounded-sm border border-[#2b3346] bg-black/40">
                                {meta?.character ? (
                                  <div
                                    className={clsx('pixelated', !meta.alive && 'opacity-60 grayscale')}
                                    style={getSpriteFrameStyle(meta.character, meta.alive ? 'down' : 'up', 28)}
                                  />
                                ) : (
                                  <span className="text-[12px] text-white/40">--</span>
                                )}
                              </div>
                              {entry.visibility === 'PRIVATE' ? (
                                <span className="px-1 text-[11px] uppercase tracking-widest text-[#f0b7b7]">
                                  Spoiler
                                </span>
                              ) : null}
                            </div>
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] uppercase tracking-widest text-white/40">
                                <span>{entry.title}</span>
                                <span>{entry.timeLabel}</span>
                              </div>
                              <div className="mt-1 text-white/90">{entry.text}</div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-white/60">No entries for this filter yet.</div>
                    )}
                  </div>
                </div>
              </section>

              <aside className="flex min-h-0 flex-col gap-4">
                <div className="rounded-lg border border-[#222a3b] bg-[#101625] px-4 py-3">
                  <div className="text-[12px] uppercase tracking-[0.3em] text-white/50">
                    What's happening
                  </div>
                  <div className="mt-2 text-base text-white/80">
                    {state.phase in PHASE_HINTS
                      ? PHASE_HINTS[state.phase as PhaseKey]
                      : 'Stay sharp and follow the story.'}
                  </div>
                </div>

                <div
                  className={clsx(
                    'rounded-lg border px-4 py-3',
                    state.phase === 'DAY_VOTE'
                      ? 'border-[#8b1b1b]/60 bg-[#1a1218]'
                      : 'border-[#222a3b] bg-[#0f1422]',
                  )}
                >
                  <div className="text-[12px] uppercase tracking-[0.3em] text-white/50">Vote tally</div>
                  {state.phase === 'DAY_VOTE' ? (
                    <div className="mt-2 space-y-3 text-base">
                      {voteTally.length > 0 ? (
                        voteTally.map((entry) => (
                          <div key={entry.targetPlayerId ?? 'abstain'} className="space-y-1">
                            <div className="flex items-center justify-between text-white/90">
                              <span>{entry.targetLabel}</span>
                              <span className="text-[#f0b7b7]">{entry.count}</span>
                            </div>
                            <div className="text-[12px] text-white/50">
                              {entry.voters.join(', ') || 'No votes yet'}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-white/60">No votes cast yet.</div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-white/60">
                      Vote tally appears during DAY_VOTE.
                    </div>
                  )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-[#222a3b] bg-[#0f1422] px-4 py-3">
                  <div className="text-[12px] uppercase tracking-[0.3em] text-white/50">Highlights</div>
                  <div className="mt-2 flex min-h-0 flex-1 flex-col space-y-2 overflow-y-auto pr-1 text-base">
                    {keyMoments.length > 0 ? (
                      keyMoments.map((moment) => (
                        <div key={moment.eventId} className="rounded border border-[#1e2638] bg-[#111827] px-2 py-1 text-white/80">
                          <div className="text-[12px] uppercase text-white/50">
                            {formatTimeLabel(moment.at)}
                          </div>
                          <div>{moment.label}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-white/60">No key moments yet.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-[#222a3b] bg-[#0f1422] px-4 py-3">
                  <div className="text-[12px] uppercase tracking-[0.3em] text-white/50">
                    Public summary
                  </div>
                  <div className="mt-2 text-base text-white/80">
                    {state.publicSummary || 'Awaiting the next town crier update.'}
                  </div>
                </div>
              </aside>
            </div>

            {isReplayMode ? (
              <div className="mt-auto shrink-0 border-t border-[#222a3b] bg-[#0f1422] px-6 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] uppercase tracking-widest text-white/50">
                  <span>Replay</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleStartMarker}
                      disabled={replayMarkers.length === 0}
                      className="border border-[#2b3346] px-2 py-1 text-white/70 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Start
                    </button>
                    <button
                      type="button"
                      onClick={handlePrevMarker}
                      disabled={replayMarkers.length === 0}
                      className="border border-[#2b3346] px-2 py-1 text-white/70 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={handleTogglePlay}
                      disabled={replayMarkers.length === 0}
                      className="border border-[#2b3346] px-2 py-1 text-white/70 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                    <button
                      type="button"
                      onClick={handleNextMarker}
                      disabled={replayMarkers.length === 0}
                      className="border border-[#2b3346] px-2 py-1 text-white/70 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={handleSpeedToggle}
                      className="border border-[#2b3346] px-2 py-1 text-white/70"
                    >
                      {playSpeed}x
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="relative h-2 rounded-full bg-[#1a2233]">
                    {replayMarkers.map((marker, markerIndex) => {
                      const left =
                        visibleEvents.length > 1
                          ? (marker.index / (visibleEvents.length - 1)) * 100
                          : 0;
                      const color =
                        marker.type === 'phase'
                          ? '#6ae3f9'
                          : marker.type === 'death'
                            ? '#c92828'
                            : marker.type === 'night'
                              ? '#d7a65d'
                              : '#f0b7b7';
                      const isActive = selectedMarkerIndex === markerIndex;
                      return (
                        <button
                          key={`${marker.eventId}-${marker.type}`}
                          type="button"
                          onClick={() => handleSelectMarkerIndex(markerIndex)}
                          className={clsx(
                            'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border',
                            isActive ? 'border-white' : 'border-transparent',
                          )}
                          style={{ left: `${left}%`, backgroundColor: color }}
                          title={marker.type}
                        />
                      );
                    })}
                  </div>
                  {replayMarkers.length === 0 ? (
                    <div className="mt-2 text-[12px] uppercase tracking-widest text-white/40">
                      No replay markers yet.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
        </div>
      </div>
    </ReactModal>
  );
}

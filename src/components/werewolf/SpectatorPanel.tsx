import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import ReactModal from 'react-modal';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useSendInput } from '../../hooks/sendInput';
import { useServerGame } from '../../hooks/serverGame';
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
    maxWidth: '960px',
    width: '94%',
    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    padding: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};

const DEFAULT_EVENTS_LIMIT = 200;
const SHOW_DEV_TOOLS = Boolean(import.meta.env.VITE_SHOW_DEBUG_UI);

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
};

type SpectatorEventView = {
  eventId: string;
  at: string;
  type: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  payload: Record<string, unknown>;
};

type PlayerDialogMessage = {
  eventId: string;
  timeLabel: string;
  text: string;
  channel: 'public' | 'wolf';
};

type PlayerDialog = {
  playerId: string;
  displayName: string;
  seat: number;
  messages: PlayerDialogMessage[];
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

function buildTranscriptEntries(
  events: SpectatorEventView[],
  playerNameById: Map<string, string>,
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  for (const event of events) {
    const payload = asRecord(event.payload) ?? {};
    const timeLabel = formatTimeLabel(event.at);
    const privateLabel = event.visibility === 'PRIVATE' ? ' (Private)' : '';

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
        });
        break;
      }
      default:
        break;
    }
  }

  return entries;
}

function buildPlayerDialogs(
  events: SpectatorEventView[],
  players: { playerId: string; displayName: string; seat: number }[],
): PlayerDialog[] {
  const dialogs: PlayerDialog[] = players.map((player) => ({
    playerId: player.playerId,
    displayName: player.displayName,
    seat: player.seat,
    messages: [],
  }));
  const dialogById = new Map(dialogs.map((dialog) => [dialog.playerId, dialog]));

  for (const event of events) {
    const payload = asRecord(event.payload) ?? {};
    const timeLabel = formatTimeLabel(event.at);

    switch (event.type) {
      case 'PUBLIC_MESSAGE': {
        const playerId = typeof payload.playerId === 'string' ? payload.playerId : null;
        const text = typeof payload.text === 'string' ? payload.text : null;
        if (!playerId || !text) {
          break;
        }
        const dialog = dialogById.get(playerId);
        if (!dialog) {
          break;
        }
        const kind = typeof payload.kind === 'string' ? payload.kind : null;
        const prefix = kind && kind !== 'DISCUSSION' ? `[${kind}] ` : '';
        dialog.messages.push({
          eventId: event.eventId,
          timeLabel,
          text: `${prefix}${text}`,
          channel: 'public',
        });
        break;
      }
      case 'WOLF_CHAT_MESSAGE': {
        const fromWolfId = typeof payload.fromWolfId === 'string' ? payload.fromWolfId : null;
        const text = typeof payload.text === 'string' ? payload.text : null;
        if (!fromWolfId || !text) {
          break;
        }
        const dialog = dialogById.get(fromWolfId);
        if (!dialog) {
          break;
        }
        dialog.messages.push({
          eventId: event.eventId,
          timeLabel,
          text,
          channel: 'wolf',
        });
        break;
      }
      default:
        break;
    }
  }

  return dialogs;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

export default function SpectatorPanel({ isOpen, matchId, onClose }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isTeleporting, setIsTeleporting] = useState(false);
  const [spoilerMode, setSpoilerMode] = useState(false);
  const shouldLoad = isOpen && Boolean(matchId);
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;
  const game = useServerGame(worldId);
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
  const includeSpoilers = SHOW_DEV_TOOLS && spoilerMode;
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
      setSpoilerMode(false);
      return;
    }
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
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
  const transcriptEntries = useMemo(
    () => buildTranscriptEntries(visibleEvents, playerNameById),
    [visibleEvents, playerNameById],
  );
  const playerDialogs = useMemo(
    () => buildPlayerDialogs(visibleEvents, players),
    [visibleEvents, players],
  );
  const voteTally = useMemo(
    () => (state ? buildVoteTally(visibleEvents, players) : []),
    [visibleEvents, players, state],
  );
  const keyMoments = useMemo(
    () => buildKeyMoments(visibleEvents, playerNameById, 6),
    [visibleEvents, playerNameById],
  );
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

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="Werewolf Spectator Panel"
      ariaHideApp={false}
    >
      <div className="space-y-4 font-dialog" data-testid="werewolf-spectator-panel">
        <div className="flex items-start justify-between gap-6 border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-3xl">Werewolf Spectator</h2>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50 mt-1">
              Match {matchId ? formatMatchId(matchId) : 'Unknown'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {SHOW_DEV_TOOLS ? (
              <label className="flex items-center gap-2 border border-amber-300/40 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-widest text-amber-100">
                <input
                  type="checkbox"
                  checked={spoilerMode}
                  onChange={(event) => setSpoilerMode(event.target.checked)}
                  className="h-3 w-3 accent-amber-300"
                />
                Spoiler mode
              </label>
            ) : null}
            {matchId ? (
              <button
                type="button"
                onClick={handleTeleport}
                disabled={!canTeleport}
                title={teleportDisabledReason ?? undefined}
                className="border border-emerald-300/60 px-3 py-1 text-[10px] uppercase tracking-widest text-emerald-100 hover:border-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isTeleporting ? 'Teleporting...' : 'Teleport to match'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="border border-white/30 px-3 py-1 text-xs hover:border-white"
            >
              Close
            </button>
          </div>
        </div>

        {!matchId ? (
          <div className="px-6 pb-6 text-sm text-white/70">
            Select a match to open the spectator view.
          </div>
        ) : matchState === undefined || state === null ? (
          <div className="px-6 pb-6 text-sm text-white/70">Loading match details...</div>
        ) : (
          <div className="space-y-4 px-6 pb-6">
            {includeSpoilers ? (
              <div className="border border-amber-300/40 bg-amber-500/10 px-4 py-2 text-[10px] uppercase tracking-widest text-amber-100">
                Spoiler mode enabled
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-white/50">Phase</div>
                <div className="text-lg mt-1" data-testid="werewolf-spectator-phase">
                  {state.phase}
                </div>
                <div className="text-xs text-white/60 mt-1" data-testid="werewolf-spectator-day">
                  Day {state.dayNumber}
                </div>
              </div>
              <div className="border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-white/50">Time remaining</div>
                <div
                  className={clsx(
                    'text-lg mt-1',
                    countdown?.isExpired ? 'text-red-200' : 'text-emerald-200',
                  )}
                  data-testid="werewolf-spectator-countdown"
                >
                  {countdown?.label ?? '--:--'}
                </div>
                <div className="text-xs text-white/60 mt-1" data-testid="werewolf-spectator-ends">
                  Ends {formatTimeLabel(state.phaseEndsAt)}
                </div>
              </div>
              <div className="border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-white/50">Players</div>
                <div className="text-lg mt-1" data-testid="werewolf-spectator-players-alive">
                  {aliveCount}/{players.length} alive
                </div>
                <div className="text-xs text-white/60 mt-1" data-testid="werewolf-spectator-match-id">
                  Match {formatMatchId(state.matchId)}
                </div>
              </div>
            </div>

            <div className="rounded border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-white/50">
                Public summary
              </div>
              <p className="mt-2 text-sm text-white/80" data-testid="werewolf-spectator-summary">
                {state.publicSummary || 'Awaiting the next town crier update.'}
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]">
              <div className="space-y-4">
                <div className="rounded border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-widest text-white/50">Roster</div>
                  <div className="mt-2 space-y-2 text-sm" data-testid="werewolf-roster">
                    {players.map((player) => (
                      <div
                        key={player.playerId}
                        className="flex items-center justify-between border-b border-white/10 pb-2 last:border-b-0 last:pb-0"
                        data-testid={`werewolf-roster-player-${player.playerId}`}
                        data-player-id={player.playerId}
                        data-seat={player.seat}
                      >
                        <div>
                          <div className="text-white/90">
                            Seat {player.seat} - {player.displayName}
                          </div>
                          <div className="text-xs text-white/50">{player.playerId}</div>
                        </div>
                        <div className="text-right text-xs">
                          <span
                            className={clsx(
                              'uppercase tracking-widest',
                              player.alive ? 'text-emerald-200' : 'text-red-200',
                            )}
                          >
                            {player.alive ? 'Alive' : 'Dead'}
                          </span>
                          {player.revealedRole ? (
                            <div className="text-white/70 mt-1">{player.revealedRole}</div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-widest text-white/50">Vote tally</div>
                  {state.phase === 'DAY_VOTE' ? (
                    <div className="mt-2 space-y-2 text-sm" data-testid="werewolf-vote-tally">
                      {voteTally.length > 0 ? (
                        voteTally.map((entry) => (
                          <div
                            key={entry.targetPlayerId ?? 'abstain'}
                            className="space-y-1"
                            data-testid="werewolf-vote-entry"
                            data-target-id={entry.targetPlayerId ?? 'abstain'}
                          >
                            <div className="flex items-center justify-between">
                              <span>{entry.targetLabel}</span>
                              <span className="text-white/70">{entry.count}</span>
                            </div>
                            <div className="text-[10px] text-white/50">
                              {entry.voters.join(', ') || 'No votes yet'}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-white/60">No votes cast yet.</div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-white/60">
                      Vote tally appears during DAY_VOTE.
                    </div>
                  )}
                </div>

                <div className="rounded border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-widest text-white/50">
                    Key moments
                  </div>
                  <div className="mt-2 space-y-2 text-sm" data-testid="werewolf-key-moments">
                    {keyMoments.length > 0 ? (
                      keyMoments.map((moment) => (
                        <div key={moment.eventId} className="text-white/80">
                          <div className="text-[10px] uppercase text-white/50">
                            {formatTimeLabel(moment.at)}
                          </div>
                          <div>{moment.label}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-white/60">No key moments yet.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-white/50">Transcript</div>
                <div
                  className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-2 text-sm"
                  data-testid="werewolf-transcript"
                >
                  {transcriptEntries.length > 0 ? (
                    transcriptEntries.map((entry) => (
                      <div
                        key={entry.eventId}
                        className={clsx(
                          'border border-white/10 px-3 py-2',
                          entry.kind === 'message' && 'bg-white/10',
                          entry.kind === 'vote' && 'bg-white/5',
                          entry.kind === 'system' && 'bg-black/20',
                          entry.kind === 'narrator' && 'bg-emerald-500/10',
                        )}
                        data-testid="werewolf-transcript-entry"
                        data-event-id={entry.eventId}
                      >
                        <div className="flex items-center justify-between text-[10px] uppercase text-white/50">
                          <span>{entry.title}</span>
                          <span>{entry.timeLabel}</span>
                        </div>
                        <div className="text-white/90">{entry.text}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-white/60">No public events yet.</div>
                  )}
                </div>
              </div>

              <div className="rounded border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-white/50">
                  Player dialogs
                </div>
                <div className="mt-1 text-[10px] text-white/50">
                  Public messages by player. Wolf chat appears in spoiler mode.
                </div>
                <div
                  className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-2 text-sm"
                  data-testid="werewolf-player-dialogs"
                >
                  {playerDialogs.map((dialog) => (
                    <div
                      key={dialog.playerId}
                      className="border border-white/10 bg-black/20 px-3 py-2"
                      data-testid={`werewolf-player-dialog-${dialog.playerId}`}
                      data-player-id={dialog.playerId}
                      data-seat={dialog.seat}
                    >
                      <div className="flex items-center justify-between text-[10px] uppercase text-white/50">
                        <span>
                          Seat {dialog.seat} - {dialog.displayName}
                        </span>
                        <span>{dialog.messages.length} msgs</span>
                      </div>
                      {dialog.messages.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {dialog.messages.map((message) => (
                            <div
                              key={message.eventId}
                              className={clsx(
                                'border-l-2 pl-2',
                                message.channel === 'wolf'
                                  ? 'border-amber-200/60'
                                  : 'border-emerald-200/60',
                              )}
                              data-testid="werewolf-player-dialog-message"
                              data-event-id={message.eventId}
                            >
                              <div className="flex items-center justify-between text-[10px] uppercase text-white/50">
                                <span>{message.channel === 'wolf' ? 'Wolf chat' : 'Public'}</span>
                                <span>{message.timeLabel}</span>
                              </div>
                              <div className="text-white/90">{message.text}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-white/60">No messages yet.</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ReactModal>
  );
}

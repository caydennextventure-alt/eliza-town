import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import ReactModal from 'react-modal';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { toast } from 'react-toastify';
import { api } from 'convex/_generated/api';
import { useServerGame } from '../../hooks/serverGame';
import { CharacterDefinition, useCharacters } from '../../lib/characterRegistry';
import agentAvatar from '../../../assets/ui/agent-avatar.svg';

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
    maxWidth: '720px',
    width: '90%',
    height: '85vh',
    maxHeight: '85vh',
    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    boxSizing: 'border-box',
    padding: '20px',
    overflow: 'hidden',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onOpenSpectator: (matchId: string) => void;
};

type TabKey = 'queue' | 'matches';
type MatchesFilter = 'ACTIVE' | 'ENDED' | 'ALL';

const tabButtonBase =
  'rounded-sm border border-white/20 px-3 py-1 text-xs uppercase tracking-widest transition-colors';
const MATCH_PLAYER_COUNT = 8;
const matchesFilters: Array<{ id: MatchesFilter; label: string }> = [
  { id: 'ACTIVE', label: 'Live' },
  { id: 'ENDED', label: 'Replay' },
  { id: 'ALL', label: 'All' },
];

type QueueAgent = {
  agentId: string;
  playerId: string;
  name: string;
  character: CharacterDefinition;
};

type QueueAgentRowProps = {
  agent: QueueAgent;
};

function formatMatchId(matchId: string): string {
  if (matchId.length <= 8) {
    return matchId;
  }
  return `${matchId.slice(0, 6)}…${matchId.slice(-4)}`;
}

function formatIsoTimestamp(isoTimestamp: string): string {
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) {
    return isoTimestamp;
  }
  return new Date(parsed).toLocaleString();
}

function QueueAgentRow({ agent }: QueueAgentRowProps) {
  const queueStatus = useQuery(api.werewolf.queueStatus, { playerId: agent.playerId });
  const queueJoin = useMutation(api.werewolf.queueJoin);
  const queueLeave = useMutation(api.werewolf.queueLeave);
  const [pendingAction, setPendingAction] = useState<'join' | 'leave' | null>(null);

  const isInMatch = !!queueStatus?.matchAssignment;
  const queuePosition = queueStatus?.queue.position ?? null;
  const isQueued = queuePosition !== null;
  const isLoading = queueStatus === undefined;
  const isBusy = pendingAction !== null;

  const statusLabel = isLoading
    ? 'Loading...'
    : isInMatch
      ? 'In match'
      : isQueued
        ? `Queued (#${queuePosition})`
        : 'Not queued';

  const statusTone = isInMatch
    ? 'border-emerald-300/60 text-emerald-200'
    : isQueued
      ? 'border-amber-300/60 text-amber-200'
      : 'border-white/20 text-white/60';

  const queueDetails =
    queueStatus?.queue &&
    `Queue ${queueStatus.queue.size}/${queueStatus.queue.requiredPlayers} - ${queueStatus.queue.status}`;

  const handleJoin = async () => {
    setPendingAction('join');
    try {
      await queueJoin({
        playerId: agent.playerId,
        preferredDisplayName: agent.name,
      });
    } catch (error: any) {
      if (error instanceof ConvexError) {
        toast.error(String(error.data));
      } else {
        toast.error(error?.message ?? 'Failed to join queue.');
      }
    } finally {
      setPendingAction(null);
    }
  };

  const handleLeave = async () => {
    setPendingAction('leave');
    try {
      await queueLeave({ playerId: agent.playerId });
    } catch (error: any) {
      if (error instanceof ConvexError) {
        toast.error(String(error.data));
      } else {
        toast.error(error?.message ?? 'Failed to leave queue.');
      }
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div
      className="flex items-center gap-4 border border-white/10 bg-white/5 px-4 py-3"
      data-testid={`werewolf-queue-agent-${agent.agentId}`}
    >
      <div className="box shrink-0">
        <div className="bg-brown-200 p-1">
          <img
            src={agentAvatar}
            alt={agent.name}
            className="h-14 w-14 rounded-sm object-cover object-top"
            loading="lazy"
          />
        </div>
      </div>
      <div className="flex-1 text-sm text-white/80">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg">{agent.name}</div>
          <span className={['text-[10px] uppercase px-2 py-0.5 border', statusTone].join(' ')}>
            {statusLabel}
          </span>
        </div>
        <div className="text-xs text-white/60">
          Sprite: {agent.character.displayName ?? agent.character.name}
        </div>
        <div className="text-[10px] uppercase text-white/50 mt-1">
          {queueDetails ?? 'Queue status loading'}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        {isInMatch ? (
          <button
            type="button"
            disabled
            className="border border-emerald-300/40 px-3 py-1 text-xs text-emerald-200/80 opacity-60 cursor-not-allowed"
          >
            In match
          </button>
        ) : isQueued ? (
          <button
            type="button"
            onClick={handleLeave}
            disabled={isBusy || isLoading}
            className="border border-red-300/60 px-3 py-1 text-xs text-red-200 hover:border-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid={`werewolf-queue-leave-${agent.agentId}`}
          >
            {pendingAction === 'leave' ? 'Leaving...' : 'Leave queue'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleJoin}
            disabled={isBusy || isLoading}
            className="bg-emerald-500/80 hover:bg-emerald-500 px-3 py-1 text-xs font-bold border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid={`werewolf-queue-join-${agent.agentId}`}
          >
            {pendingAction === 'join' ? 'Joining...' : 'Join queue'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function WerewolfPanel({ isOpen, onClose, onOpenSpectator }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('queue');
  const [matchesFilter, setMatchesFilter] = useState<MatchesFilter>('ACTIVE');
  const { characters } = useCharacters();
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const game = useServerGame(worldId);
  const humanTokenIdentifier = useQuery(api.world.userStatus, worldId ? { worldId } : 'skip');
  const matchesList = useQuery(
    api.werewolf.matchesList,
    activeTab === 'matches' ? { status: matchesFilter } : 'skip',
  );

  const characterByName = useMemo(
    () => new Map(characters.map((character) => [character.name, character] as const)),
    [characters],
  );

  const queueAgents = useMemo<QueueAgent[]>(() => {
    if (!game) return [];
    const userToken =
      humanTokenIdentifier && humanTokenIdentifier !== 'skip' ? humanTokenIdentifier : null;
    return [...game.world.agents.values()].flatMap((agent) => {
      const agentDescription = game.agentDescriptions.get(agent.id);
      if (!agentDescription || agentDescription.isCustom !== true) return [];
      if (userToken && agentDescription.ownerId && agentDescription.ownerId !== userToken) {
        return [];
      }
      const playerDescription = game.playerDescriptions.get(agent.playerId);
      if (!playerDescription) return [];
      const character = characterByName.get(playerDescription.character);
      if (!character) return [];
      return [
        {
          agentId: agent.id,
          playerId: agent.playerId,
          name: playerDescription.name,
          character,
        },
      ];
    });
  }, [game, characterByName, humanTokenIdentifier]);

  const isLoadingAgents = worldStatus === undefined || game === undefined;
  const matchesLoading = activeTab === 'matches' && matchesList === undefined;
  const matches = matchesList?.matches ?? [];

  useEffect(() => {
    if (isOpen) {
      setActiveTab('queue');
      setMatchesFilter('ACTIVE');
    }
  }, [isOpen]);

  return (
    <>
      <ReactModal
        isOpen={isOpen}
        onRequestClose={onClose}
        style={modalStyles}
        contentLabel="Werewolf Panel"
        ariaHideApp={false}
      >
        <div className="flex h-full min-h-0 flex-col space-y-4 font-dialog" data-testid="werewolf-panel">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2 className="text-3xl">Werewolf</h2>
              <p className="text-sm text-white/70 mt-1">
                Queue agents or watch live matches from the Town Hall.
              </p>
            </div>
            <button
              onClick={onClose}
              className="border border-white/30 px-3 py-1 text-xs hover:border-white"
              data-testid="werewolf-panel-close"
            >
              Close
            </button>
          </div>

          <div className="flex gap-2 border-b border-white/10 pb-2" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'queue'}
              className={clsx(
                tabButtonBase,
                activeTab === 'queue'
                  ? 'bg-white/20 text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
              )}
              onClick={() => setActiveTab('queue')}
              data-testid="werewolf-tab-queue"
            >
              Queue
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'matches'}
              className={clsx(
                tabButtonBase,
                activeTab === 'matches'
                  ? 'bg-white/20 text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
              )}
              onClick={() => setActiveTab('matches')}
              data-testid="werewolf-tab-matches"
            >
              Matches
            </button>
          </div>

          {activeTab === 'queue' ? (
            <div className="flex min-h-0 flex-1 flex-col space-y-3" role="tabpanel">
              <h3 className="text-xl">Queue</h3>
              <p className="text-sm text-white/70">
                Add one of your agents to the 8-player queue and wait for a match to form.
              </p>
              <div className="rounded border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                <div className="text-xs uppercase tracking-widest text-white/50">Queue basics</div>
                <p className="mt-2">
                  Matches start as soon as eight players are ready. Your agent keeps their seat and
                  role for the full game.
                </p>
                <p className="mt-2">
                  Watch the action here or jump to the map marker when the Town Hall appears.
                </p>
              </div>
              <div className="flex min-h-0 flex-1 flex-col space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg">Your agents</h4>
                  <span className="text-[10px] uppercase text-white/40">Custom agents only</span>
                </div>
                {isLoadingAgents ? (
                  <div className="rounded border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                    Loading agents...
                  </div>
                ) : queueAgents.length > 0 ? (
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" data-testid="werewolf-queue-list">
                    {queueAgents.map((agent) => (
                      <QueueAgentRow key={agent.agentId} agent={agent} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/70">
                    <p>No custom agents available.</p>
                    <p className="text-xs text-white/50 mt-1">
                      Create a custom agent, then return here to queue them.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col space-y-3" role="tabpanel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl">Matches</h3>
                <div className="flex flex-wrap gap-2">
                  {matchesFilters.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setMatchesFilter(filter.id)}
                      className={clsx(
                        tabButtonBase,
                        matchesFilter === filter.id
                          ? 'bg-white/20 text-white'
                          : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
                      )}
                      data-testid={`werewolf-matches-filter-${filter.id.toLowerCase()}`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-sm text-white/70">
                Browse live matches and replays to relive the story.
              </p>
              <div className="rounded border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                <div className="text-xs uppercase tracking-widest text-white/50">
                  Spectator highlights
                </div>
                <p className="mt-2">
                  Follow the phase timer, track votes, and catch the key moments as the story
                  unfolds.
                </p>
                <p className="mt-2">
                  Dead players reveal their roles publicly, keeping the mystery alive.
                </p>
              </div>
              <div className="flex min-h-0 flex-1 flex-col space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg">
                    {matchesFilter === 'ACTIVE'
                      ? 'Live matches'
                      : matchesFilter === 'ENDED'
                        ? 'Replay matches'
                        : 'All matches'}
                  </h4>
                  <span className="text-[10px] uppercase text-white/40">Newest first</span>
                </div>
                {matchesLoading ? (
                  <div className="rounded border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                    Loading matches...
                  </div>
                ) : matches.length > 0 ? (
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" data-testid="werewolf-matches-list">
                    {matches.map((match) => (
                      <div
                        key={match.matchId}
                        className="border border-white/10 bg-white/5 px-4 py-3"
                        data-testid={`werewolf-match-${match.matchId}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-lg">Match {formatMatchId(match.matchId)}</div>
                            <div className="text-xs text-white/50">
                              Started {formatIsoTimestamp(match.startedAt)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={clsx(
                                'text-[10px] uppercase px-2 py-0.5 border',
                                match.phase === 'ENDED'
                                  ? 'border-amber-300/50 text-amber-200'
                                  : 'border-emerald-300/50 text-emerald-200',
                              )}
                            >
                              {match.phase === 'ENDED' ? 'Replay' : 'Live'}
                            </span>
                            <span className="text-[10px] uppercase px-2 py-0.5 border border-white/20 text-white/70">
                              {match.phase}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onOpenSpectator(match.matchId);
                                onClose();
                              }}
                              className="border border-white/30 px-3 py-1 text-[10px] uppercase tracking-widest text-white/80 hover:border-white/60 hover:text-white"
                              data-testid={`werewolf-watch-${match.matchId}`}
                            >
                              {match.phase === 'ENDED' ? 'Replay' : 'Watch'}
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-4 text-xs text-white/70">
                          <span>Day {match.dayNumber}</span>
                          <span>
                            Alive {match.playersAlive}/{MATCH_PLAYER_COUNT}
                          </span>
                          <span className="text-white/40">
                            Building {formatMatchId(match.buildingInstanceId)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70" data-testid="werewolf-matches-empty">
                    {matchesFilter === 'ACTIVE'
                      ? 'No live matches yet. Queue eight agents to start a new game.'
                      : matchesFilter === 'ENDED'
                        ? 'No replays yet. Finish a match to view it here.'
                        : 'No matches yet. Queue eight agents to start a new game.'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </ReactModal>
    </>
  );
}

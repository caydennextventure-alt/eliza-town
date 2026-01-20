import { useEffect, useMemo, useState } from 'react';
import ReactModal from 'react-modal';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { toast } from 'react-toastify';
import { api } from '../../convex/_generated/api';
import { waitForInput } from '../hooks/sendInput';
import { useServerGame } from '../hooks/serverGame';
import { CharacterDefinition, useCharacters } from '../lib/characterRegistry';
import agentAvatar from '../../assets/ui/agent-avatar.svg';

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
    maxWidth: '60%',
    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreateAgent?: () => void;
};

type AgentEntry = {
  agentId: string;
  name: string;
  character: CharacterDefinition;
  isControlled: boolean;
  isControlledByUser: boolean;
};

export default function AgentListDialog({ isOpen, onClose, onCreateAgent }: Props) {
  const { characters } = useCharacters();
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const game = useServerGame(worldId);
  const humanTokenIdentifier = useQuery(api.world.userStatus, worldId ? { worldId } : 'skip');
  const removeAgent = useMutation(api.world.removeAgent);
  const leaveWorld = useMutation(api.world.leaveWorld);
  const convex = useConvex();
  const [removingAgentId, setRemovingAgentId] = useState<string | null>(null);
  const [confirmingAgentId, setConfirmingAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setRemovingAgentId(null);
      setConfirmingAgentId(null);
    }
  }, [isOpen]);

  const characterByName = useMemo(
    () => new Map(characters.map((character) => [character.name, character] as const)),
    [characters],
  );

  const userPlayerId = useMemo(() => {
    if (!game || !humanTokenIdentifier || humanTokenIdentifier === 'skip') {
      return null;
    }
    return [...game.world.players.values()].find((player) => player.human === humanTokenIdentifier)
      ?.id;
  }, [game, humanTokenIdentifier]);

  const agents = useMemo<AgentEntry[]>(() => {
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
      const player = game.world.players.get(agent.playerId);
      return [
        {
          agentId: agent.id,
          name: playerDescription.name,
          character,
          isControlled: !!player?.human,
          isControlledByUser: !!userPlayerId && agent.playerId === userPlayerId,
        },
      ];
    });
  }, [game, characterByName, humanTokenIdentifier, userPlayerId]);

  const handleRemove = async (agent: AgentEntry) => {
    if (!worldId) {
      toast.error('World is not ready yet.');
      return;
    }
    if (agent.isControlled && !agent.isControlledByUser) {
      toast.error('This agent is controlled by someone else.');
      return;
    }
    setRemovingAgentId(agent.agentId);
    try {
      if (agent.isControlledByUser) {
        const releaseInputId = await leaveWorld({ worldId });
        if (releaseInputId) {
          await waitForInput(convex, releaseInputId, {
            timeoutMs: 15000,
            timeoutMessage: 'World is still processing. Try again in a moment.',
          });
        }
      }
      const inputId = await removeAgent({ worldId, agentId: agent.agentId });
      await waitForInput(convex, inputId, {
        timeoutMs: 15000,
        timeoutMessage: 'World is still processing. Try again in a moment.',
      });
      setConfirmingAgentId(null);
    } catch (error: any) {
      if (error instanceof ConvexError) {
        toast.error(String(error.data));
      } else {
        toast.error(error?.message ?? 'Failed to remove agent.');
      }
    } finally {
      setRemovingAgentId(null);
    }
  };

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="Agent List"
      ariaHideApp={false}
    >
      <div className="space-y-4 font-dialog">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-3xl">My Agents</h2>
            <p className="text-sm text-white/70 mt-1">Custom agents in this world.</p>
            <p className="text-xs text-white/50 mt-1">
              {agents.length > 0 ? 'Showing your custom agents.' : 'No custom agents yet.'}
            </p>
            <p className="text-xs text-white/50 mt-1">
              Removing an agent despawns it from this world. Your character sprite stays available.
            </p>
          </div>
          <button
            onClick={onClose}
            className="border border-white/30 px-3 py-1 text-xs hover:border-white"
          >
            Close
          </button>
        </div>

        {agents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {agents.map((agent) => {
              const isRemoving = removingAgentId === agent.agentId;
              const isConfirming = confirmingAgentId === agent.agentId;
              const removeLabel = agent.isControlledByUser ? 'Release & Remove' : 'Remove';
              const confirmMessage = agent.isControlledByUser
                ? 'Releases your control and removes the agent from this world.'
                : 'Removes the agent from this world.';
              const confirmLabel = agent.isControlledByUser
                ? 'Confirm Release & Remove'
                : 'Confirm Remove';
              const isBlocked = agent.isControlled && !agent.isControlledByUser;
              return (
                <div
                  key={agent.agentId}
                  className="flex items-center gap-4 border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="box shrink-0">
                    <div className="bg-brown-200 p-1">
                      <img
                        src={agentAvatar}
                        alt={agent.name}
                        className="h-16 w-16 rounded-sm object-cover object-top"
                      />
                    </div>
                  </div>
                  <div className="flex-1 text-sm text-white/80">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-lg">{agent.name}</div>
                      <span
                        className={[
                          'text-[10px] uppercase px-2 py-0.5 border',
                          agent.isControlled
                            ? 'border-amber-300/60 text-amber-200'
                            : 'border-emerald-300/60 text-emerald-200',
                        ].join(' ')}
                      >
                        {agent.isControlled ? 'Controlled' : 'AI'}
                      </span>
                    </div>
                    <div className="text-xs text-white/60">
                      Sprite: {agent.character.displayName ?? agent.character.name}
                    </div>
                    {agent.isControlledByUser && (
                      <div className="text-[10px] uppercase text-amber-200 mt-1">
                        You are controlling this agent.
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {isConfirming ? (
                      <>
                        <div className="text-[10px] text-white/60 text-right">
                          {confirmMessage}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemove(agent)}
                          disabled={isRemoving}
                          className="bg-red-500/80 hover:bg-red-500 px-3 py-1 text-xs font-bold border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isRemoving ? 'Removing...' : confirmLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingAgentId(null)}
                          disabled={isRemoving}
                          className="border border-white/30 px-3 py-1 text-xs hover:border-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingAgentId(agent.agentId)}
                        disabled={isRemoving || isBlocked}
                        className="border border-red-300/60 px-3 py-1 text-xs text-red-200 hover:border-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={
                          isBlocked
                            ? 'This agent is controlled by someone else.'
                            : 'Remove agent from world'
                        }
                      >
                        {removeLabel}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/70">
            <p>No custom agents available.</p>
            <p className="text-xs text-white/50 mt-1">
              Create a custom agent, then manage it here.
            </p>
            {onCreateAgent && (
              <button
                onClick={() => {
                  onClose();
                  onCreateAgent();
                }}
                className="mt-3 border border-white/30 px-3 py-1 text-xs hover:border-white"
              >
                Create Agent
              </button>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="border border-white/30 px-4 py-2 text-sm hover:border-white"
          >
            Done
          </button>
        </div>
      </div>
    </ReactModal>
  );
}

import { useEffect, useMemo, useState } from 'react';
import ReactModal from 'react-modal';
import { CharacterDefinition } from '../lib/characterRegistry';
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
  isJoining: boolean;
  onClose: () => void;
  onTakeOver: (agentId: string) => void;
  onCreateAgent?: () => void;
  agents: AgentOption[];
};

type AgentOption = {
  agentId: string;
  name: string;
  character: CharacterDefinition;
};

export default function JoinWorldDialog({
  isOpen,
  isJoining,
  onClose,
  onTakeOver,
  onCreateAgent,
  agents,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (agents.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !agents.some((agent) => agent.agentId === selectedId)) {
      setSelectedId(agents[0].agentId);
    }
  }, [agents, selectedId]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.agentId === selectedId) ?? null,
    [agents, selectedId],
  );

  const handleTakeOver = () => {
    if (!selectedId) {
      setError('Pick an agent first.');
      return;
    }
    setError(null);
    onTakeOver(selectedId);
  };

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="Join World"
      ariaHideApp={false}
    >
      <div className="space-y-4 font-dialog" data-testid="join-world-dialog">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-3xl">Take Over an Agent</h2>
            <p className="text-sm text-white/70 mt-1">
              Take control of an agent you created.
            </p>
            <p className="text-xs text-white/50 mt-1">
              {agents.length > 0
                ? 'Showing your custom agents.'
                : 'No custom agents available yet.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="border border-white/30 px-3 py-1 text-xs hover:border-white"
            data-testid="join-world-close"
          >
            Close
          </button>
        </div>

        {selectedAgent && (
          <div className="flex items-center gap-4">
            <div className="box shrink-0">
              <div className="bg-brown-200 p-1">
                <img
                  src={agentAvatar}
                  alt={selectedAgent.name}
                  className="h-20 w-20 rounded-sm object-cover object-top"
                />
              </div>
            </div>
            <div className="text-sm text-white/80">
              <div className="text-lg">
                {selectedAgent.name}
              </div>
              <div className="text-xs">
                {selectedAgent.character.displayName ?? selectedAgent.character.name}
              </div>
            </div>
          </div>
        )}

        {agents.length > 0 ? (
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
            {agents.map((agent) => {
              const isSelected = selectedId === agent.agentId;
              return (
                <button
                  key={agent.agentId}
                  type="button"
                  onClick={() => {
                    setSelectedId(agent.agentId);
                    setError(null);
                  }}
                  className={[
                    'border-2 px-2 py-2 text-left transition',
                    isSelected
                      ? 'border-emerald-400'
                      : 'border-white/20 hover:border-white/60',
                  ].join(' ')}
                  data-testid={`join-world-agent-${agent.agentId}`}
                >
                  <div className="bg-brown-200 p-1">
                    <img
                      src={agentAvatar}
                      alt={agent.name}
                      className="h-14 w-14 sm:h-16 sm:w-16 rounded-sm object-cover object-top"
                      loading="lazy"
                    />
                  </div>
                  <div className="mt-2 text-[10px] uppercase text-white/80 truncate">
                    {agent.name}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/70">
            <p>No custom agents available.</p>
            <p className="text-xs text-white/50 mt-1">
              Create a custom agent first, then take it over here.
            </p>
            {onCreateAgent && (
              <button
                onClick={() => {
                  onClose();
                  onCreateAgent();
                }}
                className="mt-3 border border-white/30 px-3 py-1 text-xs hover:border-white"
                data-testid="join-world-create-agent"
              >
                Create Agent
              </button>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-300" data-testid="join-world-error">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="border border-white/30 px-4 py-2 text-sm hover:border-white"
            data-testid="join-world-cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleTakeOver}
            disabled={agents.length === 0 || isJoining}
            className="bg-emerald-500/80 hover:bg-emerald-500 px-4 py-2 text-sm font-bold border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="join-world-takeover"
          >
            {isJoining ? 'Taking over...' : 'Take Over'}
          </button>
        </div>
      </div>
    </ReactModal>
  );
}

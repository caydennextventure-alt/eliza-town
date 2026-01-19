import { useEffect, useMemo, useState } from 'react';
import ReactModal from 'react-modal';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { toast } from 'react-toastify';
import { api } from '../../convex/_generated/api';
import { waitForInput } from '../hooks/sendInput';
import { useCharacters } from '../lib/characterRegistry';
import CharacterSelectGrid from './CharacterSelectGrid';

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

const DEFAULT_PLAN = 'You want to explore the town and meet new people.';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function CreateAgentDialog({ isOpen, onClose }: Props) {
  const { characters } = useCharacters();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [identity, setIdentity] = useState('');
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const createAgent = useMutation(api.world.createAgent);
  const convex = useConvex();

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setName('');
      setIdentity('');
      setPlan(DEFAULT_PLAN);
      return;
    }
    if (!selectedId && characters.length > 0) {
      setSelectedId(characters[0].name);
    }
  }, [isOpen, characters, selectedId]);

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.name === selectedId) ?? null,
    [characters, selectedId],
  );

  const handleCreate = async () => {
    if (!worldId) {
      setError('World is not ready yet.');
      return;
    }
    if (!selectedId) {
      setError('Pick a character first.');
      return;
    }
    if (!name.trim()) {
      setError('Enter a character name.');
      return;
    }
    if (!identity.trim()) {
      setError('Add an identity description.');
      return;
    }
    if (!plan.trim()) {
      setError('Add an activity plan.');
      return;
    }

    setError(null);
    setIsCreating(true);
    try {
      const inputId = await createAgent({
        worldId,
        name: name.trim(),
        character: selectedId,
        identity: identity.trim(),
        plan: plan.trim(),
      });
      await waitForInput(convex, inputId);
      onClose();
    } catch (error: any) {
      if (error instanceof ConvexError) {
        setError(error.data);
      } else {
        setError(error?.message ?? 'Failed to create agent.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="Create Agent"
      ariaHideApp={false}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-3xl font-display">Create AI Agent</h2>
            <p className="text-sm text-white/70 mt-1">Define a character and drop them into the world.</p>
          </div>
          <button
            onClick={onClose}
            className="border border-white/30 px-3 py-1 text-xs hover:border-white"
          >
            Close
          </button>
        </div>

        {selectedCharacter && (
          <div className="flex items-center gap-4">
            <div className="box shrink-0">
              <div className="bg-brown-200 p-1">
                <img
                  src={selectedCharacter.portraitUrl ?? selectedCharacter.textureUrl}
                  alt={selectedCharacter.displayName ?? selectedCharacter.name}
                  className="h-20 w-20 rounded-sm object-cover object-top"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </div>
            <div className="text-sm text-white/80">
              <div className="text-lg font-display">
                {selectedCharacter.displayName ?? selectedCharacter.name}
              </div>
              <div className="text-xs">
                {selectedCharacter.isCustom ? 'Custom character' : 'Default character'}
              </div>
            </div>
          </div>
        )}

        <CharacterSelectGrid
          characters={characters}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setError(null);
          }}
        />

        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/70">Name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Eliza"
              className="w-full bg-gray-900 border border-gray-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-white/70">Identity</label>
            <textarea
              value={identity}
              onChange={(event) => setIdentity(event.target.value)}
              placeholder="Describe who this agent is."
              rows={3}
              className="w-full bg-gray-900 border border-gray-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-white/70">Plan</label>
            <textarea
              value={plan}
              onChange={(event) => setPlan(event.target.value)}
              placeholder={DEFAULT_PLAN}
              rows={2}
              className="w-full bg-gray-900 border border-gray-700 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-300">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="border border-white/30 px-4 py-2 text-sm hover:border-white"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="bg-emerald-500/80 hover:bg-emerald-500 px-4 py-2 text-sm font-bold border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : 'Create Agent'}
          </button>
        </div>
      </div>
    </ReactModal>
  );
}

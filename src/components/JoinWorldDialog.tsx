import { useEffect, useMemo, useState } from 'react';
import ReactModal from 'react-modal';
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

type Props = {
  isOpen: boolean;
  isJoining: boolean;
  onClose: () => void;
  onJoin: (characterId: string) => void;
};

export default function JoinWorldDialog({ isOpen, isJoining, onClose, onJoin }: Props) {
  const { characters } = useCharacters();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (characters.length === 0) return;
    if (!selectedId) {
      setSelectedId(characters[0].name);
    }
  }, [characters, selectedId]);

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.name === selectedId) ?? null,
    [characters, selectedId],
  );

  const handleJoin = () => {
    if (!selectedId) {
      setError('Pick a character first.');
      return;
    }
    setError(null);
    onJoin(selectedId);
  };

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="Join World"
      ariaHideApp={false}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-3xl font-display">Choose Your Character</h2>
            <p className="text-sm text-white/70 mt-1">Choose a look before you join the world.</p>
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

        {error && <p className="text-xs text-red-300">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="border border-white/30 px-4 py-2 text-sm hover:border-white"
          >
            Cancel
          </button>
          <button
            onClick={handleJoin}
            disabled={isJoining}
            className="bg-emerald-500/80 hover:bg-emerald-500 px-4 py-2 text-sm font-bold border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isJoining ? 'Joining...' : 'Join World'}
          </button>
        </div>
      </div>
    </ReactModal>
  );
}

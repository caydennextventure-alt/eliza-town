import { useEffect, useMemo, useState } from 'react';
import ReactModal from 'react-modal';
import { useAction, useConvex, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import agentAvatar from '../../assets/ui/agent-avatar.svg';
import { waitForInput } from '../hooks/sendInput';
import { useCharacters } from '../lib/characterRegistry';
import CharacterSelectGrid from './CharacterSelectGrid';

const modalStyles = {
  overlay: {
    backgroundColor: 'rgb(0, 0, 0, 85%)',
    zIndex: 20,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '850px', // Wider to accommodate 2 columns
    width: '90%',
    border: '4px solid #4a3b5b',
    borderRadius: '4px',
    padding: '0',
    background: '#23202b',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
    boxShadow: '0 0 0 4px #2d2438, 0 10px 20px rgba(0,0,0,0.5)',
  },
};

const DEFAULT_PLAN = 'You want to explore the town and meet new people.';

const PERSONALITY_OPTIONS = [
  'Friendly', 'Curious', 'Mysterious', 'Wise', 
  'Cheerful', 'Calm', 'Adventurous', 'Creative'
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreateCharacter?: () => void;
};

export default function CreateAgentDialog({ isOpen, onClose, onCreateCharacter }: Props) {
  const { characters } = useCharacters();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [identity, setIdentity] = useState('');
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [personality, setPersonality] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const userTokenIdentifier = useQuery(api.world.userStatus, worldId ? { worldId } : 'skip');
  
  const createElizaAgent = useAction(api.elizaAgent.actions.createElizaAgent);
  const convex = useConvex();

  const customCharacters = useMemo(() => {
    const filtered = characters.filter((character) => character.isCustom);
    if (!userTokenIdentifier || userTokenIdentifier === 'skip') {
      return filtered;
    }
    return filtered.filter((character) => character.ownerId === userTokenIdentifier);
  }, [characters, userTokenIdentifier]);
  
  const hasCustomCharacters = customCharacters.length > 0;
  const hasMultipleCharacters = customCharacters.length > 1;
  const selectableCharacters = customCharacters;

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setName('');
      setIdentity('');
      setPlan(DEFAULT_PLAN);
      setPersonality([]);
      return;
    }
    if (selectableCharacters.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !selectableCharacters.some((character) => character.name === selectedId)) {
      setSelectedId(selectableCharacters[0].name);
    }
  }, [isOpen, selectableCharacters, selectedId]);

  const selectedCharacter = useMemo(
    () => selectableCharacters.find((character) => character.name === selectedId) ?? null,
    [selectableCharacters, selectedId],
  );

  const handleCreate = async () => {
    if (!worldId) {
      setError('World is not ready yet.');
      return;
    }
    if (!hasCustomCharacters) {
      setError('Create a custom character before adding an agent.');
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
      setError('Add an identity/bio.');
      return;
    }
    if (!plan.trim()) {
      setError('Add an activity plan.');
      return;
    }

    setError(null);
    setIsCreating(true);
    
    try {
      const result = await createElizaAgent({
        worldId,
        name: name.trim(),
        character: selectedId,
        identity: identity.trim(),
        plan: plan.trim(),
        personality,
      });
      
      const { inputId } = result;
      
      await waitForInput(convex, inputId as Id<'inputs'>, {
        timeoutMs: 15000,
        timeoutMessage: 'World is still processing. Try again in a moment.',
      });
      
      onClose();
    } catch (error: any) {
      console.error(error);
      if (error instanceof ConvexError) {
        setError(error.data);
      } else {
        setError(error?.message ?? 'Failed to create agent.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const togglePersonality = (trait: string) => {
    setPersonality(prev => 
      prev.includes(trait) ? prev.filter(t => t !== trait) : [...prev, trait]
    );
  };

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="Create Eliza Agent"
      ariaHideApp={false}
    >
      <div className="flex flex-col h-full bg-[#23202b] text-white font-dialog">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-4 border-[#4a3b5b] bg-[#2d2438]">
          <div className="flex items-center gap-3">
             <div className="p-1.5 bg-[#4a3b5b] rounded-sm">
               <img src={agentAvatar} className="w-5 h-5 opacity-80" alt="" />
             </div>
             <div>
               <h2 className="text-xl leading-none text-[#a395b8] uppercase tracking-wide">Create Eliza Agent</h2>
             </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#a395b8] hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="flex flex-1 p-4 gap-4 overflow-hidden">
            
            {/* Left Column: Preview & Selector */}
            <div className="w-1/3 flex flex-col gap-2 min-w-[180px]">
                {/* Portrait Carousel */}
                <div className="flex flex-col gap-1 relative">
                    <label className="text-[9px] uppercase tracking-widest text-[#6d607d] font-bold">Character</label>
                    <div className="h-28 bg-[#1a1821] border-4 border-[#2d2438] flex items-center justify-center relative group">
                        {selectedCharacter ? (
                            <>
                                <img
                                  src={selectedCharacter.portraitUrl || selectedCharacter.textureUrl} 
                                  alt={selectedCharacter.displayName ?? selectedCharacter.name}
                                  className="w-full h-full object-contain pixelated"
                                  style={{ imageRendering: 'pixelated' }}
                                />
                                
                                {/* Arrows */}
                                {hasMultipleCharacters && (
                                    <>
                                        <button 
                                            onClick={() => {
                                                const currentIndex = selectableCharacters.findIndex(c => c.name === selectedId);
                                                const prevIndex = (currentIndex - 1 + selectableCharacters.length) % selectableCharacters.length;
                                                setSelectedId(selectableCharacters[prevIndex].name);
                                            }}
                                            className="absolute left-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center bg-[#2d2438] text-[#a395b8] hover:bg-[#4a3b5b] hover:text-white border-2 border-[#4a3b5b] rounded-sm transition-colors"
                                        >
                                            ◄
                                        </button>
                                        <button 
                                            onClick={() => {
                                                const currentIndex = selectableCharacters.findIndex(c => c.name === selectedId);
                                                const nextIndex = (currentIndex + 1) % selectableCharacters.length;
                                                setSelectedId(selectableCharacters[nextIndex].name);
                                            }}
                                            className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center bg-[#2d2438] text-[#a395b8] hover:bg-[#4a3b5b] hover:text-white border-2 border-[#4a3b5b] rounded-sm transition-colors"
                                        >
                                            ►
                                        </button>
                                    </>
                                )}
                                
                                <div className="absolute bottom-1 left-0 right-0 text-center">
                                    <span className="bg-[#2d2438]/90 px-1 py-0.5 text-[8px] text-white rounded-sm uppercase tracking-wider backdrop-blur-sm border border-white/10">
                                        {selectedCharacter.displayName ?? selectedCharacter.name}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <div className="text-center p-2">
                                <div className="text-[#4a3b5b] text-xl mb-1">?</div>
                                <p className="text-[#6d607d] text-[10px]">None</p>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Sprite Sheet Preview */}
                <div className="flex flex-col gap-1 flex-1 min-h-0">
                     <label className="text-[9px] uppercase tracking-widest text-[#6d607d] font-bold">Sprite Sheet</label>
                     <div className="bg-[#1a1821] p-2 border-4 border-[#2d2438] flex-1 flex items-center justify-center relative overflow-hidden">
                         {selectedCharacter ? (
                            <img 
                                src={selectedCharacter.textureUrl} 
                                className="w-full h-full object-contain pixelated opacity-90"
                                style={{ imageRendering: 'pixelated' }}
                                alt="Sprite Sheet"
                            />
                         ) : (
                            <div className="text-[#6d607d] text-[10px]">No Sprite</div>
                         )}
                     </div>
                </div>
            </div>

            {/* Right Column: Form Fields */}
            <div className="w-2/3 flex flex-col gap-4 overflow-y-auto pr-2">
                 <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[#6d607d] font-bold">Name</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Luna"
                      className="w-full bg-[#1a1821] border-2 border-[#2d2438] focus:border-[#4a3b5b] px-3 py-2 text-sm text-[#e0dce6] outline-none transition-colors placeholder:text-[#4a3b5b]"
                    />
                 </div>
                 
                 <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[#6d607d] font-bold">Personality</label>
                    <div className="flex flex-wrap gap-1.5">
                        {PERSONALITY_OPTIONS.map(trait => (
                            <button
                                key={trait}
                                onClick={() => togglePersonality(trait)}
                                className={`px-2 py-1 text-[10px] uppercase border-2 transition-all ${
                                    personality.includes(trait)
                                    ? 'bg-[#3b8f6e] border-[#5ec29d] text-white shadow-[0_2px_0_#23634a] translate-y-[-1px]'
                                    : 'bg-[#2d2438] border-[#4a3b5b] text-[#a395b8] hover:border-[#6d607d] hover:text-white'
                                }`}
                            >
                                {trait}{personality.includes(trait) && ' ✓'}
                            </button>
                        ))}
                    </div>
                 </div>

                <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[#6d607d] font-bold">Bio / Identity</label>
                    <textarea
                      value={identity}
                      onChange={(e) => setIdentity(e.target.value)}
                      placeholder="Describe who this agent is, their background..."
                      rows={4}
                      className="w-full bg-[#1a1821] border-2 border-[#2d2438] focus:border-[#4a3b5b] px-3 py-2 text-sm text-[#e0dce6] outline-none transition-colors placeholder:text-[#4a3b5b] resize-none"
                    />
                </div>
                
                <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[#6d607d] font-bold">Initial Plan</label>
                    <textarea
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      placeholder={DEFAULT_PLAN}
                      rows={2}
                      className="w-full bg-[#1a1821] border-2 border-[#2d2438] focus:border-[#4a3b5b] px-3 py-2 text-sm text-[#e0dce6] outline-none transition-colors placeholder:text-[#4a3b5b] resize-none"
                    />
                </div>
            </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 mt-auto shrink-0">
            {error && (
                <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
                    <span>⚠️</span> {error}
                </div>
            )}
            
            <div className="flex justify-end gap-3 pt-4 border-t-2 border-[#2d2438]">
                <button
                    onClick={onClose}
                    className="px-6 py-2 text-xs uppercase font-bold tracking-wider text-[#a395b8] hover:text-white transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={handleCreate}
                    disabled={isCreating}
                    className={`px-6 py-2 bg-[#3b8f6e] border-b-4 border-[#23634a] text-white text-xs uppercase font-bold tracking-widest hover:bg-[#46a881] hover:translate-y-[-1px] active:translate-y-[1px] active:border-b-0 transition-all ${
                        isCreating ? 'opacity-50 cursor-wait' : ''
                    }`}
                >
                    {isCreating ? 'Summoning...' : 'Create Agent'}
                </button>
            </div>
        </div>
      </div>
    </ReactModal>
  );
}

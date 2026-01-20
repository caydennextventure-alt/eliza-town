import { useEffect, useState, type ChangeEvent } from 'react';
import ReactModal from 'react-modal';
import { useMutation, useQuery, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';

const modalStyles = {
  overlay: {
    backgroundColor: 'rgb(0, 0, 0, 75%)',
    zIndex: 200, // High z-index to be on top of everything
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

const REQUIRED_WIDTH = 96;
const REQUIRED_HEIGHT = 128;
const FRAME_WIDTH = 32;
const FRAME_HEIGHT = 32;
const FRAMES_PER_DIRECTION = 3;
const DIRECTIONS = 4;

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function CreateCharacterDialog({ isOpen, onClose }: Props) {
  const [displayName, setDisplayName] = useState('');
  
  // Generation state
  const [step, setStep] = useState<'concept' | 'sprite'>('concept');
  const [prompt, setPrompt] = useState('');
  const [conceptUrl, setConceptUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedStorageId, setGeneratedStorageId] = useState<string | null>(null);
  
  // Existing upload fallback
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  
  const [error, setError] = useState<string | null>(null);

  const generateCharacterConcept = useAction(api.characterGeneration.generateCharacterConcept);
  const generateCharacter = useAction(api.characterGeneration.generate);
  const createSprite = useMutation(api.characterSprites.create);
  const removeSprite = useMutation(api.characterSprites.remove);
  const mySprites = useQuery(api.characterSprites.listMine) ?? [];
  const generatedPreviewUrl = useQuery(api.characterSprites.getUrl, generatedStorageId ? { storageId: generatedStorageId } : "skip");

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setDisplayName('');
      setPrompt('');
      setStep('concept');
      setConceptUrl(null);
      setReferenceFile(null);
      setGeneratedStorageId(null);
      setError(null);
      setIsGenerating(false);
    }
  }, [isOpen]);

  const handleReferenceFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file) {
        setReferenceFile(file);
    }
  };

  // Helper to convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
    });
  };

  // Helper to fetch valid image blob from URL
  const urlToBase64 = async (url: string): Promise<string> => {
      // Replicate URLs usually support CORS. If this fails, we might need a backend proxy.
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
      });
  };

  const handleGenerateConcept = async () => {
      if (!prompt.trim() && !referenceFile) {
          setError("Please enter a character description or upload an image.");
          return;
      }
      setIsGenerating(true);
      setError(null);
      try {
          let imageUrl = undefined;
          if (referenceFile) {
              imageUrl = await fileToBase64(referenceFile);
          }

          const result = await generateCharacterConcept({ prompt, image: imageUrl });
          if (result.imageUrl) {
              setConceptUrl(result.imageUrl);
              setStep('sprite');
          }
      } catch (e: any) {
          console.error(e);
          setError(e.message ?? "Concept generation failed");
      } finally {
          setIsGenerating(false);
      }
  };

  const handleGenerateSprite = async () => {
    setIsGenerating(true);
    setError(null);
    try {
        let imageUrl = undefined;
        // Use concept URL if available, otherwise check reference file
        if (conceptUrl) {
            imageUrl = await urlToBase64(conceptUrl);
        } else if (referenceFile) {
            imageUrl = await fileToBase64(referenceFile);
        } else if (!prompt) {
             setError("Please enter a prompt or upload a reference image.");
             return;
        }

        const result = await generateCharacter({ prompt, image: imageUrl });
        
        if (result.storageId) {
            setGeneratedStorageId(result.storageId);
        }
    } catch (e: any) {
        console.error(e);
        setError(e.message ?? "Generation failed");
    } finally {
        setIsGenerating(false);
    }
  };

  const storeImage = useAction(api.characterSprites.storeImage);

  const handleSave = async () => {
    if (!generatedStorageId) return;
    
    try {
        let portraitStorageId = undefined;
        if (conceptUrl) {
           const result = await storeImage({ imageUrl: conceptUrl });
           portraitStorageId = result.storageId;
        }

        await createSprite({
            storageId: generatedStorageId,
            portraitStorageId,
            displayName: displayName.trim() || 'AI Character',
            frameWidth: FRAME_WIDTH,
            frameHeight: FRAME_HEIGHT,
            framesPerDirection: FRAMES_PER_DIRECTION,
            directions: DIRECTIONS,
        });
        onClose();
    } catch (e: any) {
        console.error("Save failed:", e);
        setError("Failed to save character: " + e.message);
    }
  };

  const handleRemove = async (spriteId: string) => {
    await removeSprite({ spriteId });
  };

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="Create Character"
      ariaHideApp={false}
    >
      <div className="space-y-4 font-dialog text-white">
        <div className="flex items-start justify-between gap-6">
          <h2 className="text-2xl font-bold">Create Character (AI)</h2>
          <button
            onClick={onClose}
            className="border border-white/30 px-3 py-1 text-xs hover:border-white text-gray-400 hover:text-white"
          >
            Close
          </button>
        </div>

        {/* Generation Form */}
        {!generatedStorageId ? (
            <div className="space-y-4">
                {/* Step Indicator */}
                <div className="flex gap-2 text-xs uppercase tracking-wider mb-4">
                    <div className={`flex-1 py-2 text-center border-b-2 ${step === 'concept' ? 'border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-500'}`}>1. Design</div>
                    <div className={`flex-1 py-2 text-center border-b-2 ${step === 'sprite' ? 'border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-500'}`}>2. Sprite Sheet</div>
                </div>

                {step === 'concept' && (
                    <div className="fade-in">
                        <label className="block text-sm text-gray-400 mb-1">Describe your character (Pixel Art Concept)</label>
                         <textarea 
                            className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-emerald-500 outline-none"
                            rows={3}
                            placeholder="A futuristic cyber-ninja with a glowing katana..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                        />
                         
                         {/* Fallback Reference Upload (Optional) */}
                         <div className="mt-2">
                             <label className="block text-xs text-gray-500 mb-1">Or upload reference (Optional)</label>
                             <input 
                                 type="file" 
                                 accept="image/*"
                                 className="w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-800 file:text-white hover:file:bg-gray-700"
                                 onChange={handleReferenceFileChange}
                             />
                         </div>

                         <button 
                             onClick={handleGenerateConcept}
                             disabled={isGenerating}
                             className={`w-full mt-4 font-bold py-2 px-4 rounded transition-all flex items-center justify-center gap-2 ${
                                isGenerating ? 'bg-indigo-800 text-indigo-200 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                             }`}
                         >
                             {isGenerating ? (
                                <span className="animate-spin">⟳</span>
                             ) : null}
                             {isGenerating ? 'Designing...' : referenceFile ? 'Generate Concept from Image' : 'Generate Concept Art'}
                         </button>
                    </div>
                )}

                {step === 'sprite' && (conceptUrl || referenceFile) && (
                    <div className="fade-in space-y-4">
                        <div className="flex justify-center bg-gray-900 border border-gray-700 rounded p-4">
                            {conceptUrl ? (
                                <img src={conceptUrl} alt="Concept" className="h-48 object-contain bg-[url('/assets/bg_pattern.png')]" />
                            ) : (
                                <p className="text-xs text-gray-400">Reference: {referenceFile?.name}</p>
                            )}
                        </div>
                        <div className="flex gap-2">
                             <button 
                                 onClick={() => setStep('concept')}
                                 disabled={isGenerating}
                                 className="flex-1 px-4 border border-gray-600 hover:bg-gray-800 text-white py-2 rounded text-sm"
                             >
                                Back
                             </button>
                             <button 
                                 onClick={handleGenerateSprite}
                                 disabled={isGenerating}
                                 className={`flex-2 w-full font-bold py-2 px-4 rounded transition-all flex items-center justify-center gap-2 ${
                                    isGenerating ? 'bg-emerald-800 text-emerald-200 cursor-wait' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                 }`}
                             >
                                 {isGenerating ? (
                                    <span className="animate-spin">⟳</span>
                                 ) : null}
                                 {isGenerating ? 'Animating...' : 'Generate Sprite Sheet'}
                             </button>
                        </div>
                    </div>
                )}

                 {error && (
                     <div className="text-red-400 text-sm bg-red-900/20 p-2 rounded">
                         {error}
                     </div>
                 )}
            </div>
        ) : (
            // Preview & Save
            <div className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    {/* Generated Result */}
                    <div className="bg-gray-900 border border-gray-700 rounded p-4 flex flex-col items-center">
                        <p className="text-emerald-400 mb-2 font-bold text-xs uppercase tracking-wide">Your Result</p>
                        {generatedPreviewUrl ? (
                             <>
                                <img 
                                    src={generatedPreviewUrl}
                                    className="w-24 h-32 border border-emerald-500/30 bg-gray-800 object-contain"
                                    style={{ imageRendering: 'pixelated' }}
                                    alt="Generated Sprite"
                                />
                                 <p className="text-xs text-gray-500 mt-2">Background Removed</p>
                             </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-32">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-2"></div>
                                <p className="text-xs text-gray-400">Loading...</p>
                            </div>
                        )}
                    </div>

                    {/* Standard Reference */}
                    <div className="bg-gray-900 border border-gray-700 rounded p-4 flex flex-col items-center opacity-70 hover:opacity-100 transition-opacity">
                        <p className="text-gray-400 mb-2 font-bold text-xs uppercase tracking-wide">Standard Format</p>
                        <img 
                            src="/assets/characters/char-f1.png"
                            className="w-24 h-32 border border-gray-600 bg-gray-800 object-contain"
                            style={{ imageRendering: 'pixelated' }}
                            alt="Standard Reference"
                        />
                        <div className="text-[10px] text-gray-500 mt-2 text-center leading-tight">
                            <p>Row 1: Front</p>
                            <p>Row 2: Left</p>
                            <p>Row 3: Right</p>
                            <p>Row 4: Back</p>
                        </div>
                    </div>
                 </div>
                
                {/* Save Form */}
                <div>
                     <label className="block text-sm text-gray-400 mb-1">Character Name</label>
                     <input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="My Character"
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-emerald-500 outline-none"
                     />
                </div>

                <div className="flex gap-2">
                     <button
                        onClick={() => setGeneratedStorageId(null)} // Back to edit
                        className="px-4 border border-gray-600 hover:bg-gray-800 text-white py-2 rounded text-sm"
                     >
                        Back
                     </button>
                     <button
                        onClick={handleGenerateSprite} // Regenerate using same prompt/concept
                        disabled={isGenerating}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2 rounded text-sm flex items-center justify-center gap-2"
                     >
                        {isGenerating ? (
                            <span className="animate-spin">⟳</span>
                        ) : (
                            <span>⟳ Regenerate</span>
                        )}
                     </button>
                     <button
                        onClick={handleSave}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded text-sm"
                     >
                        Save Character
                     </button>
                </div>

                <div className="text-xs text-gray-500 bg-gray-900/50 p-2 rounded border border-gray-700/50">
                    <p><strong>Check:</strong> Your sprite should have <strong>4 rows × 3 columns = 12 frames</strong>. Directions: Front, Left, Right, Back. If not, Regenerate.</p>
                </div>
            </div>
        )}


        {/* List of existing characters */}
        <div className="border-t border-gray-800 pt-4 mt-6">
           <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Your Characters</h3>
           <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
              {mySprites.map((sprite) => (
                <div key={sprite.spriteId} className="flex items-center gap-3 bg-gray-800/50 p-2 rounded border border-gray-700">
                  <div
                    className="shrink-0 bg-gray-900 w-8 h-8 rounded overflow-hidden relative"
                  >
                     <div 
                        style={{
                            width: 32,
                            height: 32,
                            backgroundImage: sprite.textureUrl ? `url(${sprite.textureUrl})` : undefined,
                            backgroundPosition: '0px 0px',
                            backgroundSize: `${FRAME_WIDTH * FRAMES_PER_DIRECTION}px ${FRAME_HEIGHT * DIRECTIONS}px`,
                            imageRendering: 'pixelated',
                        }}
                     />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{sprite.displayName}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(sprite.spriteId)}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                  >
                    Delete
                  </button>
                </div>
              ))}
              {mySprites.length === 0 && (
                <p className="text-sm text-gray-500 italic">No custom characters created yet.</p>
              )}
           </div>
        </div>
      </div>
    </ReactModal>
  );
}

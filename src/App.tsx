import Game from './components/Game.tsx';
import { ToastContainer } from 'react-toastify';
import a16zImg from '../assets/a16z.png';
import convexImg from '../assets/convex.svg';
import starImg from '../assets/star.svg';
import helpImg from '../assets/help.svg';
import { useState, useEffect } from 'react';
import ReactModal from 'react-modal';
import MusicButton from './components/buttons/MusicButton.tsx';
import Button from './components/buttons/Button.tsx';
import FreezeButton from './components/FreezeButton.tsx';
import PoweredByConvex from './components/PoweredByConvex.tsx';
import MapEditor from './components/MapEditor.tsx';

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
  const [gameStarted, setGameStarted] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    // Simple way to access editor: add ?editor=true to URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('editor') === 'true') {
      setShowEditor(true);
    }
  }, []);

  if (showEditor) {
    return <MapEditor />;
  }

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
            <Button href="https://github.com/a16z-infra/ai-town" imgUrl={starImg}>
              Star
            </Button>
            <MusicButton />
          </div>
          
           <div className="absolute bottom-2 right-4 text-white/50 text-sm">
            Powered by Convex
          </div>
        </div>
      ) : (
        // GAME STATE
        <div className="w-full h-screen flex flex-col">
          {/* Game area fills remaining space */}
          <div className="flex-grow relative overflow-hidden">
            <Game />
          </div>

          {/* Minimal Overlay Controls for Game Mode */}
          <div className="absolute top-4 right-4 flex gap-2 pointer-events-auto">
             <FreezeButton />
             <MusicButton />
             <Button imgUrl={helpImg} onClick={() => setHelpModalOpen(true)}>
              Help
            </Button>
             <button 
               onClick={() => setGameStarted(false)}
               className="bg-red-500/80 hover:bg-red-600 text-white px-3 py-1 rounded border-2 border-white/20 font-display text-xs"
             >
               EXIT
             </button>
          </div>
        </div>
      )}
      
      <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
    </main>
  );
}

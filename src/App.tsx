import Game from './components/Game.tsx';
import { ToastContainer } from 'react-toastify';
import a16zImg from '../assets/a16z.png';
import convexImg from '../assets/convex.svg';
import starImg from '../assets/star.svg';
import helpImg from '../assets/help.svg';
import closeImg from '../assets/close.svg';
import charactersImg from '../assets/ui/icon-characters.svg';
import newAgentImg from '../assets/ui/icon-new-agent.svg';
import agentsImg from '../assets/ui/icon-agents.svg';
import werewolfImg from '../assets/ui/chats.svg';
import { useState, useEffect } from 'react';
import ReactModal from 'react-modal';
import MusicButton from './ui/buttons/MusicButton.tsx';
import Button from './ui/buttons/Button.tsx';
import PoweredByConvex from './components/PoweredByConvex.tsx';
import MapEditor from './components/MapEditor.tsx';
import CreateCharacterDialog from './components/CreateCharacterDialog.tsx';
import CreateAgentDialog from './components/CreateAgentDialog.tsx';
import WorldJoinControls from './components/WorldJoinControls.tsx';
import AgentListDialog from './components/AgentListDialog.tsx';
import WerewolfPanel from './components/werewolf/WerewolfPanel.tsx';
import SpectatorPanel from './components/werewolf/SpectatorPanel.tsx';

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
  const [createCharacterOpen, setCreateCharacterOpen] = useState(false);
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [agentListOpen, setAgentListOpen] = useState(false);
  const [werewolfPanelOpen, setWerewolfPanelOpen] = useState(false);
  const [spectatorMatchId, setSpectatorMatchId] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showVisualTest, setShowVisualTest] = useState(false);

  useEffect(() => {
    // Simple way to access editor: add ?editor=true to URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('editor') === 'true') {
      setShowEditor(true);
    }
    // Visual layout test: ?visual-test=true
    if (params.get('visual-test') === 'true') {
      setShowVisualTest(true);
    }
  }, []);

  if (showVisualTest) {
    return <MapEditor />;
  }

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
          <div className="font-body" data-testid="help-modal">
            <div className="flex justify-end">
              <button
                onClick={() => setHelpModalOpen(false)}
                className="border border-white/30 px-3 py-1 text-xs hover:border-white"
                data-testid="help-close"
              >
                Close
              </button>
            </div>
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
      <CreateCharacterDialog
        isOpen={createCharacterOpen}
        onClose={() => setCreateCharacterOpen(false)}
      />
      <CreateAgentDialog
        isOpen={createAgentOpen}
        onClose={() => setCreateAgentOpen(false)}
        onCreateCharacter={() => {
          setCreateAgentOpen(false);
          setCreateCharacterOpen(true);
        }}
      />
      <AgentListDialog
        isOpen={agentListOpen}
        onClose={() => setAgentListOpen(false)}
        onCreateAgent={() => {
          setAgentListOpen(false);
          setCreateAgentOpen(true);
        }}
      />
      <WerewolfPanel
        isOpen={werewolfPanelOpen}
        onClose={() => setWerewolfPanelOpen(false)}
        onOpenSpectator={(matchId) => setSpectatorMatchId(matchId)}
      />
      <SpectatorPanel
        isOpen={spectatorMatchId !== null}
        matchId={spectatorMatchId}
        onClose={() => setSpectatorMatchId(null)}
      />

      {!gameStarted ? (
        // LANDING PAGE STATE
        <div className="w-full h-screen flex flex-col items-center justify-center relative z-10">
          <h1 className="text-6xl sm:text-9xl font-bold font-display game-title mb-8 tracking-wider text-center">
            ELIZA TOWN
          </h1>
          
          <button
            onClick={() => setGameStarted(true)}
            className="px-12 py-6 bg-white/10 hover:bg-white/20 border-4 border-white text-white text-4xl font-bold font-display rounded-xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            data-testid="enter-world"
          >
             ENTER WORLD 
          </button>

          <div className="absolute bottom-10 flex gap-6">
             <Button
              imgUrl={helpImg}
              onClick={() => setHelpModalOpen(true)}
              dataTestId="help-button"
            >
              Help
            </Button>
            <Button
              href="https://github.com/cayden970207/eliza-town"
              imgUrl={starImg}
              dataTestId="star-link"
              ariaLabel="Star Eliza Town on GitHub"
            >
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
        <div className="w-full h-screen flex flex-col" data-testid="game-view">
          {/* Game area fills remaining space */}
          <div className="flex-grow relative overflow-hidden">
            <Game
              onOpenSpectator={(matchId) => setSpectatorMatchId(matchId)}
              hideTestControls={werewolfPanelOpen || spectatorMatchId !== null}
            />
          </div>

          {/* Minimal Overlay Controls for Game Mode */}
          <div className="absolute top-4 left-4 z-10 flex flex-wrap items-start gap-3 pointer-events-auto max-w-[calc(100%-2rem)]">
            <WorldJoinControls onCreateAgent={() => setCreateAgentOpen(true)} />
            <Button
              imgUrl={werewolfImg}
              onClick={() => setWerewolfPanelOpen(true)}
              title="Open the Werewolf panel"
              dataTestId="open-werewolf-panel"
            >
              Werewolf
            </Button>
            <Button
              imgUrl={charactersImg}
              onClick={() => setCreateCharacterOpen(true)}
              title="Upload a custom character sprite"
              dataTestId="open-characters"
            >
              Characters
            </Button>
            <Button
              imgUrl={newAgentImg}
              onClick={() => setCreateAgentOpen(true)}
              title="Create a new AI agent in this world"
              dataTestId="open-create-agent"
            >
              New Agent
            </Button>
            <Button
              imgUrl={agentsImg}
              onClick={() => setAgentListOpen(true)}
              title="Manage your custom agents"
              dataTestId="open-agent-list"
            >
              Agents
            </Button>
            <Button imgUrl={closeImg} onClick={() => setGameStarted(false)} dataTestId="exit-world">
              Exit
            </Button>
          </div>
        </div>
      )}
      
      <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
    </main>
  );
}

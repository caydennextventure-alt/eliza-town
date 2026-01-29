import { useEffect, useMemo, useState } from 'react';
import ReactModal from 'react-modal';
import { useAction, useConvex, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from 'convex/_generated/api';
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
    height: '90vh',
    maxHeight: '90vh',
    border: '4px solid #4a3b5b',
    borderRadius: '4px',
    padding: '0',
    overflow: 'hidden',
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

const COMMUNICATION_MODE_LABELS: Record<string, string> = {
  legacy: 'Legacy API',
  'messaging-stream': 'Streaming (SSE)',
  'messaging-poll': 'Message Queue (Polling)',
};

type ElizaAgentSummary = {
  id?: string;
  name?: string;
  username?: string;
  bio?: string;
  personality?: string[];
  plan?: string;
};

type CommunicationDiagnostics = {
  ok: boolean;
  message?: string;
};

type CommunicationTestMessage = {
  role: 'user' | 'agent';
  text: string;
};

type CommunicationTestResult = {
  ok: boolean;
  message?: string;
  preferredMode?: string;
  diagnostics?: {
    legacy: CommunicationDiagnostics;
    streaming: CommunicationDiagnostics;
    queue: CommunicationDiagnostics;
  };
  conversation?: {
    conversationId: string;
    senderId: string;
    messages: CommunicationTestMessage[];
  };
};

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
  const [elizaServerUrl, setElizaServerUrl] = useState('');
  const [elizaAgentId, setElizaAgentId] = useState('');
  const [elizaAuthToken, setElizaAuthToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<ElizaAgentSummary[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [checkStatus, setCheckStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [agentMetadata, setAgentMetadata] = useState('');
  const [connectionTest, setConnectionTest] = useState<CommunicationTestResult | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testChatMessages, setTestChatMessages] = useState<CommunicationTestMessage[]>([]);
  const [testChatInput, setTestChatInput] = useState('');
  const [testChatError, setTestChatError] = useState<string | null>(null);
  const [isSendingTestChat, setIsSendingTestChat] = useState(false);
  const [testConversationId, setTestConversationId] = useState<string | null>(null);
  const [testSenderId, setTestSenderId] = useState<string | null>(null);
  
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const userTokenIdentifier = useQuery(api.world.userStatus, worldId ? { worldId } : 'skip');
  
  const connectExistingElizaAgent = useAction(api.elizaAgent.actions.connectExistingElizaAgent);
  const fetchElizaAgentInfo = useAction(api.elizaAgent.actions.fetchElizaAgentInfo);
  const fetchElizaAgents = useAction(api.elizaAgent.actions.fetchElizaAgents);
  const testElizaAgentCommunication = useAction(api.elizaAgent.actions.testElizaAgentCommunication);
  const sendElizaTestMessage = useAction(api.elizaAgent.actions.sendElizaTestMessage);
  const convex = useConvex();

  const customCharacters = useMemo(() => {
    const filtered = characters.filter((character) => character.isCustom);
    if (!userTokenIdentifier || userTokenIdentifier === 'skip') {
      return filtered;
    }
    return filtered.filter((character) => character.ownerId === userTokenIdentifier);
  }, [characters, userTokenIdentifier]);
  
  const isE2E = import.meta.env.VITE_E2E === '1' || import.meta.env.VITE_E2E === 'true';
  const selectableCharacters = isE2E ? characters : customCharacters;
  const hasCustomCharacters = selectableCharacters.length > 0;
  const hasMultipleCharacters = selectableCharacters.length > 1;

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setName('');
      setIdentity('');
      setPlan(DEFAULT_PLAN);
      setPersonality([]);
      setElizaServerUrl('');
      setElizaAgentId('');
      setElizaAuthToken('');
      setAvailableAgents([]);
      setSelectedAgentId('');
      setCheckStatus(null);
      setAgentMetadata('');
      setConnectionTest(null);
      setIsTestingConnection(false);
      setConnectionStatus(null);
      setTestChatMessages([]);
      setTestChatInput('');
      setTestChatError(null);
      setIsSendingTestChat(false);
      setTestConversationId(null);
      setTestSenderId(null);
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

  useEffect(() => {
    setConnectionTest(null);
    setConnectionStatus(null);
    setTestChatMessages([]);
    setTestChatInput('');
    setTestChatError(null);
    setTestConversationId(null);
    setTestSenderId(null);
  }, [elizaServerUrl, elizaAgentId, elizaAuthToken]);

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
      setError(
        isE2E
          ? 'No characters available yet.'
          : 'Create a custom character before adding an agent.',
      );
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
    if (!elizaServerUrl.trim()) {
      setError('Enter the Eliza server URL.');
      return;
    }
    if (!elizaAgentId.trim()) {
      setError('Select an Eliza agent.');
      return;
    }
    if (!connectionTest?.ok || !connectionTest.preferredMode) {
      setError('Run the connection test before adding this agent.');
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      const resolvedName = name.trim();
      if (!resolvedName) {
        setError('Selected agent is missing a name.');
        return;
      }
      const resolvedIdentity =
        identity.trim() || `${resolvedName} is an ElizaOS agent.`;
      const resolvedPlan = plan.trim() || DEFAULT_PLAN;
      const trimmedElizaServerUrl = elizaServerUrl.trim();
      const trimmedElizaAuthToken = elizaAuthToken.trim();
      const result = await connectExistingElizaAgent({
        worldId,
        name: resolvedName,
        character: selectedId,
        identity: resolvedIdentity,
        plan: resolvedPlan,
        personality,
        elizaAgentId: elizaAgentId.trim(),
        elizaServerUrl: trimmedElizaServerUrl ? trimmedElizaServerUrl : undefined,
        elizaAuthToken: trimmedElizaAuthToken ? trimmedElizaAuthToken : undefined,
        communicationMode: connectionTest.preferredMode,
      });
      
      const { inputId } = result;
      
      await waitForInput(convex, inputId, {
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

  const formatAgentMetadata = (payload: unknown) => {
    if (payload === null || payload === undefined) {
      return '';
    }
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (!trimmed) {
        return '';
      }
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return payload;
      }
    }
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return '';
    }
  };

  const applyAgentMetadata = (payload: unknown) => {
    setAgentMetadata(formatAgentMetadata(payload));
  };

  const applyAgentSummary = (agent?: ElizaAgentSummary) => {
    if (!agent) {
      return;
    }
    if (!name.trim() && agent.name) {
      setName(agent.name);
    }
    if (!identity.trim() && agent.bio) {
      setIdentity(agent.bio);
    }
    if (personality.length === 0 && agent.personality?.length) {
      const normalized = agent.personality
        .map((trait) => trait.trim().toLowerCase())
        .filter((trait) => trait.length > 0);
      const matched = PERSONALITY_OPTIONS.filter((trait) =>
        normalized.includes(trait.toLowerCase()),
      );
      if (matched.length > 0) {
        setPersonality(matched);
      }
    }
    if (!plan.trim() && agent.plan) {
      setPlan(agent.plan);
    }
  };

  const handleLoadAgents = async () => {
    const trimmedElizaServerUrl = elizaServerUrl.trim();
    const trimmedElizaAuthToken = elizaAuthToken.trim();
    if (!trimmedElizaServerUrl) {
      setCheckStatus({
        ok: false,
        message: 'Enter the Eliza server URL to load agents.',
      });
      return;
    }
    setIsLoadingAgents(true);
    setCheckStatus(null);
    try {
      const result = await fetchElizaAgents({
        elizaServerUrl: trimmedElizaServerUrl,
        elizaAuthToken: trimmedElizaAuthToken ? trimmedElizaAuthToken : undefined,
      });
      if (result.ok && result.agents?.length) {
        setAvailableAgents(result.agents);
        const defaultAgent = result.agents[0];
        if (defaultAgent?.id) {
          void handleSelectAgent(defaultAgent.id, defaultAgent);
        }
        setCheckStatus({
          ok: true,
          message: `Loaded ${result.agents.length} agents.`,
        });
      } else {
        const statusLabel = result.status ? `HTTP ${result.status}` : 'Request failed';
        const detail = result.message ? ` ${result.message}` : '';
        setCheckStatus({
          ok: false,
          message: `Unable to load agents (${statusLabel}).${detail}`,
        });
      }
    } catch (lookupError: any) {
      setCheckStatus({
        ok: false,
        message: lookupError?.message ?? 'Unable to reach the Eliza server.',
      });
    } finally {
      setIsLoadingAgents(false);
    }
  };

  const handleCheckElizaAgent = async () => {
    const trimmedElizaServerUrl = elizaServerUrl.trim();
    const trimmedElizaAgentId = elizaAgentId.trim();
    const trimmedElizaAuthToken = elizaAuthToken.trim();
    if (!trimmedElizaServerUrl) {
      setCheckStatus({
        ok: false,
        message: 'Enter the Eliza server URL to verify.',
      });
      return;
    }
    if (!trimmedElizaAgentId) {
      setCheckStatus({
        ok: false,
        message: 'Select an agent to verify.',
      });
      return;
    }
    setIsChecking(true);
    setCheckStatus(null);
    try {
      const result = await fetchElizaAgentInfo({
        elizaAgentId: trimmedElizaAgentId,
        elizaServerUrl: trimmedElizaServerUrl,
        elizaAuthToken: trimmedElizaAuthToken ? trimmedElizaAuthToken : undefined,
      });
      if (result.ok) {
        const agentName = result.agent?.name ?? 'agent';
        const agentId = result.agent?.id ?? trimmedElizaAgentId;
        applyAgentSummary(result.agent ?? undefined);
        if (result.raw !== null && result.raw !== undefined) {
          applyAgentMetadata(result.raw);
        } else if (result.agent) {
          applyAgentMetadata(result.agent);
        }
        setCheckStatus({
          ok: true,
          message: `Connected to ${agentName} (${agentId}).`,
        });
      } else {
        const statusLabel = result.status ? `HTTP ${result.status}` : 'Request failed';
        const detail = result.message ? ` ${result.message}` : '';
        setCheckStatus({
          ok: false,
          message: `Unable to fetch agent info (${statusLabel}).${detail}`,
        });
      }
    } catch (checkError: any) {
      setCheckStatus({
        ok: false,
        message: checkError?.message ?? 'Unable to reach the Eliza server.',
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleRunConnectionTest = async () => {
    const trimmedElizaServerUrl = elizaServerUrl.trim();
    const trimmedElizaAgentId = elizaAgentId.trim();
    const trimmedElizaAuthToken = elizaAuthToken.trim();
    if (!trimmedElizaServerUrl) {
      setConnectionStatus({
        ok: false,
        message: 'Enter the Eliza server URL to run the connection test.',
      });
      return;
    }
    if (!trimmedElizaAgentId) {
      setConnectionStatus({
        ok: false,
        message: 'Select an agent to test.',
      });
      return;
    }
    setIsTestingConnection(true);
    setConnectionStatus(null);
    setTestChatError(null);
    setTestChatInput('');
    try {
      const result = await testElizaAgentCommunication({
        elizaAgentId: trimmedElizaAgentId,
        elizaServerUrl: trimmedElizaServerUrl,
        elizaAuthToken: trimmedElizaAuthToken ? trimmedElizaAuthToken : undefined,
      });
      setConnectionTest(result);
      setTestChatMessages(result.conversation?.messages ?? []);
      setTestConversationId(result.conversation?.conversationId ?? null);
      setTestSenderId(result.conversation?.senderId ?? null);
      const modeLabel = result.preferredMode
        ? COMMUNICATION_MODE_LABELS[result.preferredMode] ?? result.preferredMode
        : 'Unknown';
      if (result.ok) {
        setConnectionStatus({
          ok: true,
          message: `Connection verified (${modeLabel}).`,
        });
      } else {
        const detail = result.message ? ` ${result.message}` : '';
        setConnectionStatus({
          ok: false,
          message: `Connection test failed.${detail}`,
        });
      }
    } catch (testError: any) {
      setConnectionStatus({
        ok: false,
        message: testError?.message ?? 'Unable to run connection test.',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSelectAgent = async (agentId: string, agentOverride?: ElizaAgentSummary) => {
    setSelectedAgentId(agentId);
    setElizaAgentId(agentId);
    const selected = agentOverride ?? availableAgents.find((agent) => agent.id === agentId);
    if (selected?.name || selected?.username || selected?.id) {
      setName(selected.name ?? selected.username ?? selected.id ?? '');
    }
    applyAgentSummary(selected);
    if (selected) {
      applyAgentMetadata(selected);
    } else {
      setAgentMetadata('');
    }
    if (!elizaServerUrl.trim()) {
      return;
    }
    try {
      const result = await fetchElizaAgentInfo({
        elizaAgentId: agentId,
        elizaServerUrl: elizaServerUrl.trim(),
        elizaAuthToken: elizaAuthToken.trim() ? elizaAuthToken.trim() : undefined,
      });
      if (result.ok && result.agent) {
        applyAgentSummary(result.agent);
      }
      if (result.ok) {
        if (result.raw !== null && result.raw !== undefined) {
          applyAgentMetadata(result.raw);
        } else if (result.agent) {
          applyAgentMetadata(result.agent);
        }
      }
    } catch {
      // silent: verification button can be used to surface errors
    }
  };

  const handleSendTestMessage = async () => {
    const message = testChatInput.trim();
    if (!message) {
      return;
    }
    if (!connectionTest?.preferredMode || !testConversationId || !testSenderId) {
      setTestChatError('Run the connection test before sending messages.');
      return;
    }
    setIsSendingTestChat(true);
    setTestChatError(null);
    setTestChatInput('');
    setTestChatMessages((prev) => [...prev, { role: 'user', text: message }]);
    try {
      const result = await sendElizaTestMessage({
        elizaAgentId: elizaAgentId.trim(),
        elizaServerUrl: elizaServerUrl.trim(),
        elizaAuthToken: elizaAuthToken.trim() ? elizaAuthToken.trim() : undefined,
        message,
        senderId: testSenderId,
        conversationId: testConversationId,
        preferredMode: connectionTest.preferredMode,
      });
      if (result.ok && result.reply) {
        setTestChatMessages((prev) => [...prev, { role: 'agent', text: result.reply }]);
      } else {
        setTestChatError(result.message ?? 'No reply from agent.');
      }
    } catch (sendError: any) {
      setTestChatError(sendError?.message ?? 'Unable to send test message.');
    } finally {
      setIsSendingTestChat(false);
    }
  };

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="Connect Eliza Agent"
      ariaHideApp={false}
    >
      <div
        className="flex flex-col h-full bg-[#23202b] text-white font-dialog"
        data-testid="create-agent-dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-4 border-[#4a3b5b] bg-[#2d2438]">
          <div className="flex items-center gap-3">
             <div className="p-1.5 bg-[#4a3b5b] rounded-sm">
               <img src={agentAvatar} className="w-5 h-5 opacity-80" alt="" />
             </div>
             <div>
               <h2 className="text-xl leading-none text-[#a395b8] uppercase tracking-wide">Connect Eliza Agent</h2>
             </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#a395b8] hover:text-white transition-colors"
            data-testid="create-agent-close"
          >
            ✕
          </button>
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="flex flex-1 p-4 gap-4 overflow-hidden min-h-0">
            
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
                                            data-testid="agent-character-prev"
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
                                            data-testid="agent-character-next"
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
            <div className="w-2/3 flex flex-col gap-4 overflow-y-auto pr-2 min-h-0">
                 <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[#6d607d] font-bold">Eliza Server URL</label>
                    <input
                      value={elizaServerUrl}
                      onChange={(e) => setElizaServerUrl(e.target.value)}
                      placeholder="https://your-eliza-server.com"
                      className="w-full bg-[#1a1821] border-2 border-[#2d2438] focus:border-[#4a3b5b] px-3 py-2 text-sm text-[#e0dce6] outline-none transition-colors placeholder:text-[#4a3b5b]"
                      data-testid="agent-eliza-url"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[#6d607d] font-bold">Eliza API Key (Optional)</label>
                    <input
                      type="password"
                      value={elizaAuthToken}
                      onChange={(e) => setElizaAuthToken(e.target.value)}
                      placeholder="X-API-KEY"
                      autoComplete="off"
                      className="w-full bg-[#1a1821] border-2 border-[#2d2438] focus:border-[#4a3b5b] px-3 py-2 text-sm text-[#e0dce6] outline-none transition-colors placeholder:text-[#4a3b5b]"
                      data-testid="agent-eliza-api-key"
                    />
                </div>

                <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleLoadAgents}
                      disabled={isLoadingAgents || !elizaServerUrl.trim()}
                      className={`w-full border-2 border-[#4a3b5b] px-3 py-2 text-xs uppercase tracking-widest transition-colors ${
                        isLoadingAgents
                          ? 'cursor-wait text-white/60'
                          : 'text-[#a395b8] hover:border-[#6d607d] hover:text-white'
                      }`}
                      data-testid="agent-eliza-load"
                    >
                      {isLoadingAgents ? 'Loading...' : 'Load Agents'}
                    </button>
                    <div className="space-y-1">
                      <label className="text-xs uppercase tracking-widest text-[#6d607d] font-bold">Choose Agent</label>
                      <select
                        value={selectedAgentId}
                        onChange={(e) => void handleSelectAgent(e.target.value)}
                        className="w-full bg-[#1a1821] border-2 border-[#2d2438] focus:border-[#4a3b5b] px-3 py-2 text-sm text-[#e0dce6] outline-none transition-colors"
                        data-testid="agent-eliza-select"
                        disabled={availableAgents.length === 0}
                      >
                        <option value="" disabled>
                          {availableAgents.length === 0 ? 'No agents loaded' : 'Select an agent'}
                        </option>
                        {availableAgents.map((agent) => {
                          if (!agent.id) {
                            return null;
                          }
                          const label =
                            agent.username && agent.name
                              ? `${agent.name} (${agent.username})`
                              : agent.name ?? agent.username ?? agent.id;
                          return (
                            <option key={agent.id} value={agent.id}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                </div>

                <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleCheckElizaAgent}
                      disabled={isChecking || !elizaServerUrl.trim() || !elizaAgentId.trim()}
                      className={`w-full border-2 border-[#4a3b5b] px-3 py-2 text-xs uppercase tracking-widest transition-colors ${
                        isChecking
                          ? 'cursor-wait text-white/60'
                          : 'text-[#a395b8] hover:border-[#6d607d] hover:text-white'
                      }`}
                      data-testid="agent-eliza-verify"
                    >
                      {isChecking ? 'Checking...' : 'Verify Agent'}
                    </button>
                    {checkStatus ? (
                      <div
                        className={`px-3 py-2 text-xs border ${
                          checkStatus.ok
                            ? 'border-emerald-400/40 bg-emerald-900/20 text-emerald-200'
                            : 'border-red-500/40 bg-red-900/20 text-red-200'
                        }`}
                        data-testid="agent-eliza-verify-result"
                      >
                        {checkStatus.message}
                      </div>
                    ) : null}
                </div>

                <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleRunConnectionTest}
                      disabled={isTestingConnection || !elizaServerUrl.trim() || !elizaAgentId.trim()}
                      className={`w-full border-2 border-[#4a3b5b] px-3 py-2 text-xs uppercase tracking-widest transition-colors ${
                        isTestingConnection
                          ? 'cursor-wait text-white/60'
                          : 'text-[#a395b8] hover:border-[#6d607d] hover:text-white'
                      }`}
                      data-testid="agent-connection-test"
                    >
                      {isTestingConnection ? 'Testing...' : 'Run Connection Test'}
                    </button>
                    {connectionStatus ? (
                      <div
                        className={`px-3 py-2 text-xs border ${
                          connectionStatus.ok
                            ? 'border-emerald-400/40 bg-emerald-900/20 text-emerald-200'
                            : 'border-red-500/40 bg-red-900/20 text-red-200'
                        }`}
                        data-testid="agent-connection-status"
                      >
                        {connectionStatus.message}
                      </div>
                    ) : null}
                    {connectionTest?.diagnostics ? (
                      <div className="grid grid-cols-1 gap-2 text-xs" data-testid="agent-connection-diagnostics">
                        {([
                          { key: 'legacy', label: 'Legacy' },
                          { key: 'streaming', label: 'Streaming' },
                          { key: 'queue', label: 'Message Queue' },
                        ] as const).map((entry) => {
                          const diag = connectionTest.diagnostics?.[entry.key];
                          if (!diag) {
                            return null;
                          }
                          return (
                            <div
                              key={entry.key}
                              className={`border px-3 py-2 break-words ${
                                diag.ok
                                  ? 'border-emerald-400/30 bg-emerald-900/10 text-emerald-200'
                                  : 'border-red-500/30 bg-red-900/10 text-red-200'
                              }`}
                              data-testid={`agent-connection-${entry.key}`}
                            >
                              <span className="font-bold">{entry.label}:</span>{' '}
                              {diag.ok ? 'OK' : 'Failed'}
                              {diag.message ? ` - ${diag.message}` : ''}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-widest text-[#6d607d] font-bold">
                        Test Conversation
                      </label>
                      <div
                        className="bg-[#1a1821] border-2 border-[#2d2438] p-2 text-xs text-[#e0dce6] max-h-40 overflow-y-auto space-y-2"
                        data-testid="agent-test-chat"
                      >
                        {testChatMessages.length > 0 ? (
                          testChatMessages.map((message, index) => (
                            <div key={`${message.role}-${index}`} className="flex gap-2 min-w-0">
                              <span className="text-[#6d607d] uppercase text-[10px]">
                                {message.role === 'user' ? 'You' : 'Agent'}
                              </span>
                              <span className="break-words whitespace-pre-wrap">{message.text}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[#6d607d] text-[10px]">
                            Run the connection test to see the greeting and introduction replies.
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={testChatInput}
                          onChange={(e) => setTestChatInput(e.target.value)}
                          placeholder="Send a test message..."
                          className="flex-1 bg-[#1a1821] border-2 border-[#2d2438] focus:border-[#4a3b5b] px-3 py-2 text-xs text-[#e0dce6] outline-none transition-colors placeholder:text-[#4a3b5b]"
                          data-testid="agent-test-input"
                          disabled={!connectionTest?.ok || isSendingTestChat}
                        />
                        <button
                          type="button"
                          onClick={handleSendTestMessage}
                          disabled={!connectionTest?.ok || isSendingTestChat || !testChatInput.trim()}
                          className={`border-2 border-[#4a3b5b] px-3 py-2 text-xs uppercase tracking-widest transition-colors ${
                            isSendingTestChat
                              ? 'cursor-wait text-white/60'
                              : 'text-[#a395b8] hover:border-[#6d607d] hover:text-white'
                          }`}
                          data-testid="agent-test-send"
                        >
                          {isSendingTestChat ? 'Sending...' : 'Send'}
                        </button>
                      </div>
                      {testChatError ? (
                        <div className="text-xs text-red-300" data-testid="agent-test-error">
                          {testChatError}
                        </div>
                      ) : null}
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[#6d607d] font-bold">Agent Metadata</label>
                    <textarea
                      value={agentMetadata}
                      onChange={(e) => setAgentMetadata(e.target.value)}
                      placeholder="Load or verify an agent to populate metadata."
                      rows={8}
                      spellCheck={false}
                      className="w-full bg-[#1a1821] border-2 border-[#2d2438] focus:border-[#4a3b5b] px-3 py-2 text-xs text-[#e0dce6] outline-none transition-colors placeholder:text-[#4a3b5b] font-mono"
                      data-testid="agent-eliza-metadata"
                    />
                </div>
            </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 mt-auto shrink-0">
            {error && (
                <div
                  className="mb-4 px-3 py-2 bg-red-900/30 border border-red-500/30 text-red-200 text-xs flex items-center gap-2"
                  data-testid="agent-error"
                >
                    <span>⚠️</span> {error}
                </div>
            )}
            
            <div className="flex justify-end gap-3 pt-4 border-t-2 border-[#2d2438]">
                <button
                    onClick={onClose}
                    className="px-6 py-2 text-xs uppercase font-bold tracking-wider text-[#a395b8] hover:text-white transition-colors"
                    data-testid="agent-cancel"
                >
                    Cancel
                </button>
                <button
                    onClick={handleCreate}
                    disabled={isCreating || !connectionTest?.ok}
                    className={`px-6 py-2 bg-[#3b8f6e] border-b-4 border-[#23634a] text-white text-xs uppercase font-bold tracking-widest hover:bg-[#46a881] hover:translate-y-[-1px] active:translate-y-[1px] active:border-b-0 transition-all ${
                        isCreating || !connectionTest?.ok ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    data-testid="agent-create"
                >
                    {isCreating ? 'Connecting...' : 'Connect Agent'}
                </button>
            </div>
        </div>
      </div>
    </ReactModal>
  );
}

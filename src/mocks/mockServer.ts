import { ConvexError } from 'convex/values';
import { allocGameId } from '../../convex/aiTown/ids';
import type { SerializedAgent } from '../../convex/aiTown/agent';
import type { SerializedAgentDescription } from '../../convex/aiTown/agentDescription';
import type { SerializedConversation } from '../../convex/aiTown/conversation';
import type { SerializedPlayer } from '../../convex/aiTown/player';
import type { SerializedPlayerDescription } from '../../convex/aiTown/playerDescription';
import type { SerializedWorld } from '../../convex/aiTown/world';
import type { SerializedWorldMap } from '../../convex/aiTown/worldMap';

type CharacterRegistryEntry = {
  spriteId: string;
  displayName: string;
  textureUrl: string | null;
  portraitUrl?: string | null;
  frameWidth: number;
  frameHeight: number;
  framesPerDirection: number;
  directions: number;
  storageId: string;
  isCustom: boolean;
  ownerId: string;
  createdAt: number;
};

type MockMessage = {
  _id: string;
  _creationTime: number;
  author: string;
  authorName?: string;
  messageUuid: string;
  text: string;
};

type ArchivedConversationDoc = {
  id: string;
  creator: string;
  created: number;
  ended: number;
  lastMessage?: { author: string; timestamp: number };
  numMessages: number;
  participants: string[];
};

export type MockState = {
  scenario: string;
  worldId: string;
  engineId: string;
  humanToken: string;
  worldStatus: {
    _id: string;
    worldId: string;
    engineId: string;
    status: string;
    lastViewed: number;
    isDefault: boolean;
  };
  engine: {
    _id: string;
    currentTime: number;
    lastStepTs: number;
    generationNumber: number;
    running: boolean;
  };
  world: SerializedWorld;
  worldMap: SerializedWorldMap;
  playerDescriptions: SerializedPlayerDescription[];
  agentDescriptions: SerializedAgentDescription[];
  messagesByConversationId: Record<string, MockMessage[]>;
  archivedConversations: ArchivedConversationDoc[];
  characterSprites: CharacterRegistryEntry[];
  storageUrls: Record<string, string>;
  musicUrl: string;
  inputCounter: number;
  storageCounter: number;
  spriteCounter: number;
};

type MockStoreAccess = {
  getState: () => MockState;
  setState: (next: MockState) => void;
};

const DEFAULT_TOKEN = 'TestUser';
const BASE_URL = import.meta.env.BASE_URL || '/';
const DEFAULT_SPRITE_URL = `${BASE_URL}assets/characters/char-f1.png`;
const DEFAULT_CONCEPT_URL = `${BASE_URL}assets/eliza.jpg`;
const DEFAULT_MUSIC_URL = `${BASE_URL}assets/background.mp3`;
const TILESET_URL = `${BASE_URL}assets/gentle-obj.png`;

const createTileLayer = (width: number, height: number, value: number) =>
  Array.from({ length: width }, () => Array.from({ length: height }, () => value));

const createWorldMap = (): SerializedWorldMap => {
  const width = 10;
  const height = 6;
  const tileDim = 32;
  return {
    width,
    height,
    tileSetUrl: TILESET_URL,
    tileSetDimX: tileDim,
    tileSetDimY: tileDim,
    tileDim,
    bgTiles: [createTileLayer(width, height, 0)],
    objectTiles: [],
    animatedSprites: [],
  };
};

const createPlayer = (id: string, position: { x: number; y: number }, human?: string) => {
  const now = Date.now();
  const player: SerializedPlayer = {
    id,
    human,
    lastInput: now,
    position,
    facing: { dx: 0, dy: 1 },
    speed: 0,
  };
  return player;
};

const createAgent = (id: string, playerId: string): SerializedAgent => ({
  id,
  playerId,
});

const createConversation = (
  id: string,
  creator: string,
  participants: SerializedConversation['participants'],
  overrides?: Partial<SerializedConversation>,
): SerializedConversation => {
  return {
    id,
    creator,
    created: Date.now(),
    numMessages: 0,
    participants,
    ...overrides,
  };
};

const createBaseState = (scenario: string): MockState => {
  const now = Date.now();
  const worldId = 'world:mock';
  const engineId = 'engine:mock';
  const customPlayerId = 'p:1';
  const npcPlayerId = 'p:2';
  const customAgentId = 'a:1';
  const npcAgentId = 'a:2';
  const customSprite: CharacterRegistryEntry = {
    spriteId: 'custom_1',
    displayName: 'Test Sprite',
    textureUrl: DEFAULT_SPRITE_URL,
    portraitUrl: DEFAULT_SPRITE_URL,
    frameWidth: 32,
    frameHeight: 32,
    framesPerDirection: 3,
    directions: 4,
    storageId: 'storage-1',
    isCustom: true,
    ownerId: DEFAULT_TOKEN,
    createdAt: now - 1000,
  };

  return {
    scenario,
    worldId,
    engineId,
    humanToken: DEFAULT_TOKEN,
    worldStatus: {
      _id: 'worldStatus:mock',
      worldId,
      engineId,
      status: 'running',
      lastViewed: now,
      isDefault: true,
    },
    engine: {
      _id: engineId,
      currentTime: now,
      lastStepTs: now - 100,
      generationNumber: 1,
      running: true,
    },
    worldMap: createWorldMap(),
    world: {
      nextId: 3,
      conversations: [],
      players: [
        createPlayer(customPlayerId, { x: 2, y: 2 }),
        createPlayer(npcPlayerId, { x: 6, y: 2 }),
      ],
      agents: [createAgent(customAgentId, customPlayerId), createAgent(npcAgentId, npcPlayerId)],
    },
    playerDescriptions: [
      {
        playerId: customPlayerId,
        name: 'Nova',
        description: 'Custom agent in town.',
        character: customSprite.spriteId,
      },
      {
        playerId: npcPlayerId,
        name: 'Quinn',
        description: 'A friendly townsperson.',
        character: 'f1',
      },
    ],
    agentDescriptions: [
      {
        agentId: customAgentId,
        identity: 'A custom agent.',
        plan: 'Explore the town.',
        ownerId: DEFAULT_TOKEN,
        isCustom: true,
      },
      {
        agentId: npcAgentId,
        identity: 'A townsperson.',
        plan: 'Wander around.',
        isCustom: false,
      },
    ],
    messagesByConversationId: {},
    archivedConversations: [],
    characterSprites: [customSprite],
    storageUrls: {
      'storage-1': DEFAULT_SPRITE_URL,
    },
    musicUrl: DEFAULT_MUSIC_URL,
    inputCounter: 1,
    storageCounter: 1,
    spriteCounter: 2,
  };
};

const recalculateNextId = (state: MockState) => {
  const ids = [
    ...state.world.players.map((p) => p.id),
    ...state.world.agents.map((a) => a.id),
    ...state.world.conversations.map((c) => c.id),
  ];
  let max = 0;
  for (const id of ids) {
    const parts = id.split(':');
    const value = Number(parts[1]);
    if (Number.isFinite(value) && value >= max) {
      max = value;
    }
  }
  state.world.nextId = max + 1;
};

const removeCustomAgents = (state: MockState) => {
  const customAgentIds = new Set(
    state.agentDescriptions.filter((agent) => agent.isCustom).map((agent) => agent.agentId),
  );
  const customPlayerIds = new Set(
    state.world.agents
      .filter((agent) => customAgentIds.has(agent.id))
      .map((agent) => agent.playerId),
  );
  state.world.agents = state.world.agents.filter((agent) => !customAgentIds.has(agent.id));
  state.agentDescriptions = state.agentDescriptions.filter(
    (agent) => !customAgentIds.has(agent.agentId),
  );
  state.world.players = state.world.players.filter((player) => !customPlayerIds.has(player.id));
  state.playerDescriptions = state.playerDescriptions.filter(
    (player) => !customPlayerIds.has(player.playerId),
  );
  recalculateNextId(state);
};

const getCustomPlayerId = (state: MockState) => {
  const customAgent = state.agentDescriptions.find((agent) => agent.isCustom);
  if (!customAgent) {
    return undefined;
  }
  const match = state.world.agents.find((agent) => agent.id === customAgent.agentId);
  return match?.playerId;
};

const getNpcPlayerId = (state: MockState) => {
  const customPlayerId = getCustomPlayerId(state);
  return state.world.players.find((player) => player.id !== customPlayerId)?.id;
};

const setHumanControlled = (state: MockState) => {
  const customPlayerId = getCustomPlayerId(state);
  if (!customPlayerId) {
    return;
  }
  const player = state.world.players.find((p) => p.id === customPlayerId);
  if (player) {
    player.human = state.humanToken;
    player.lastInput = Date.now();
  }
};

const addConversation = (state: MockState, status: 'invited' | 'participating') => {
  const humanPlayerId = getCustomPlayerId(state);
  const npcPlayerId = getNpcPlayerId(state);
  if (!humanPlayerId || !npcPlayerId) {
    return;
  }
  const now = Date.now();
  const conversationId = 'c:1';
  const participants =
    status === 'participating'
      ? [
          { playerId: humanPlayerId, invited: now, status: { kind: 'participating', started: now } },
          { playerId: npcPlayerId, invited: now, status: { kind: 'participating', started: now } },
        ]
      : [
          { playerId: humanPlayerId, invited: now, status: { kind: 'invited' } },
          { playerId: npcPlayerId, invited: now, status: { kind: 'walkingOver' } },
        ];
  state.world.conversations = [
    createConversation(conversationId, npcPlayerId, participants, {
      created: now - 2000,
    }),
  ];
};

const applyScenarioOverrides = (state: MockState, scenario: string) => {
  switch (scenario) {
    case 'no-custom':
      state.characterSprites = [];
      removeCustomAgents(state);
      break;
    case 'with-character': {
      removeCustomAgents(state);
      state.characterSprites.push({
        spriteId: 'custom_2',
        displayName: 'Test Sprite Two',
        textureUrl: DEFAULT_SPRITE_URL,
        portraitUrl: DEFAULT_SPRITE_URL,
        frameWidth: 32,
        frameHeight: 32,
        framesPerDirection: 3,
        directions: 4,
        storageId: 'storage-2',
        isCustom: true,
        ownerId: DEFAULT_TOKEN,
        createdAt: Date.now(),
      });
      state.storageUrls['storage-2'] = DEFAULT_SPRITE_URL;
      state.spriteCounter = 3;
      break;
    }
    case 'no-agents':
      removeCustomAgents(state);
      break;
    case 'controlled':
      setHumanControlled(state);
      break;
    case 'invited':
      setHumanControlled(state);
      addConversation(state, 'invited');
      break;
    case 'conversation': {
      setHumanControlled(state);
      addConversation(state, 'participating');
      const humanPlayerId = getCustomPlayerId(state);
      const npcPlayerId = getNpcPlayerId(state);
      if (humanPlayerId && npcPlayerId) {
        const conversationId = state.world.conversations[0]?.id;
        if (conversationId) {
          state.messagesByConversationId[conversationId] = [
            {
              _id: 'm1',
              _creationTime: Date.now() - 1500,
              author: npcPlayerId,
              messageUuid: 'msg-1',
              text: 'Hello there.',
            },
            {
              _id: 'm2',
              _creationTime: Date.now() - 900,
              author: humanPlayerId,
              messageUuid: 'msg-2',
              text: 'Nice to meet you.',
            },
          ];
          state.world.conversations[0].numMessages = 2;
          state.world.conversations[0].lastMessage = {
            author: humanPlayerId,
            timestamp: Date.now() - 900,
          };
        }
      }
      break;
    }
    default:
      break;
  }
};

export const getScenario = () => {
  if (typeof window === 'undefined') {
    return 'base';
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('mock') || 'base';
};

export const createMockState = (scenario: string): MockState => {
  const normalized = scenario.trim() || 'base';
  const state = createBaseState(normalized);
  applyScenarioOverrides(state, normalized);
  return state;
};

export const runQuery = (state: MockState, ref: string, args: any) => {
  switch (ref) {
    case 'world.defaultWorldStatus':
      return state.worldStatus;
    case 'world.worldState':
      if (!args || args.worldId !== state.worldId) {
        throw new Error('World not found.');
      }
      return { world: state.world, engine: state.engine };
    case 'world.gameDescriptions':
      return {
        worldMap: state.worldMap,
        playerDescriptions: state.playerDescriptions,
        agentDescriptions: state.agentDescriptions,
      };
    case 'world.userStatus':
      return state.humanToken;
    case 'world.previousConversation': {
      const matches = state.archivedConversations.filter((conversation) =>
        conversation.participants.includes(args.playerId),
      );
      if (matches.length === 0) {
        return null;
      }
      return matches.sort((a, b) => b.ended - a.ended)[0];
    }
    case 'messages.listMessages': {
      return state.messagesByConversationId[args.conversationId] ?? [];
    }
    case 'characterSprites.list':
      return state.characterSprites;
    case 'characterSprites.listMine':
      return state.characterSprites.filter((sprite) => sprite.ownerId === state.humanToken);
    case 'characterSprites.getUrl':
      return state.storageUrls[args.storageId] ?? null;
    case 'music.getBackgroundMusic':
      return state.musicUrl;
    case 'testing.stopAllowed':
      return false;
    case 'aiTown.main.inputStatus':
      return { kind: 'success', value: null };
    default:
      throw new Error(`Unhandled query: ${ref}`);
  }
};

const updateState = <T>(store: MockStoreAccess, updater: (draft: MockState) => T) => {
  const next = structuredClone(store.getState()) as MockState;
  const result = updater(next);
  store.setState(next);
  return result;
};

const nextInputId = (state: MockState) => {
  const inputId = `input:${state.inputCounter}`;
  state.inputCounter += 1;
  return inputId;
};

const nextStorageId = (state: MockState) => {
  const storageId = `storage-${state.storageCounter}`;
  state.storageCounter += 1;
  return storageId;
};

const archiveConversation = (state: MockState, conversation: SerializedConversation) => {
  state.archivedConversations.push({
    id: conversation.id,
    creator: conversation.creator,
    created: conversation.created,
    ended: Date.now(),
    lastMessage: conversation.lastMessage,
    numMessages: conversation.numMessages,
    participants: conversation.participants.map((p) => p.playerId),
  });
};

const applyWorldInput = (state: MockState, name: string, args: any) => {
  const now = Date.now();
  switch (name) {
    case 'moveTo': {
      const player = state.world.players.find((p) => p.id === args.playerId);
      if (!player) {
        throw new ConvexError('Player not found.');
      }
      player.position = { x: args.destination.x, y: args.destination.y };
      player.speed = 0;
      player.lastInput = now;
      return;
    }
    case 'startConversation': {
      const conversationId = allocGameId('conversations', state.world.nextId);
      state.world.nextId += 1;
      state.world.conversations = [
        createConversation(conversationId, args.playerId, [
          { playerId: args.playerId, invited: now, status: { kind: 'walkingOver' } },
          { playerId: args.invitee, invited: now, status: { kind: 'invited' } },
        ]),
      ];
      return;
    }
    case 'acceptInvite': {
      const conversation = state.world.conversations.find((c) => c.id === args.conversationId);
      if (!conversation) {
        throw new ConvexError('Conversation not found.');
      }
      for (const participant of conversation.participants) {
        participant.status = { kind: 'participating', started: now };
      }
      return;
    }
    case 'rejectInvite': {
      const idx = state.world.conversations.findIndex((c) => c.id === args.conversationId);
      if (idx >= 0) {
        const [conversation] = state.world.conversations.splice(idx, 1);
        archiveConversation(state, conversation);
      }
      return;
    }
    case 'leaveConversation': {
      const idx = state.world.conversations.findIndex((c) => c.id === args.conversationId);
      if (idx >= 0) {
        const [conversation] = state.world.conversations.splice(idx, 1);
        archiveConversation(state, conversation);
      }
      return;
    }
    case 'startTyping': {
      const conversation = state.world.conversations.find((c) => c.id === args.conversationId);
      if (!conversation) {
        throw new ConvexError('Conversation not found.');
      }
      conversation.isTyping = {
        playerId: args.playerId,
        messageUuid: args.messageUuid,
        since: now,
      };
      return;
    }
    case 'finishSendingMessage': {
      const conversation = state.world.conversations.find((c) => c.id === args.conversationId);
      if (!conversation) {
        return;
      }
      if (conversation.isTyping && conversation.isTyping.playerId === args.playerId) {
        conversation.isTyping = undefined;
      }
      conversation.lastMessage = { author: args.playerId, timestamp: args.timestamp };
      conversation.numMessages += 1;
      return;
    }
    default:
      throw new Error(`Unhandled input: ${name}`);
  }
};

export const runMutation = async (
  store: MockStoreAccess,
  ref: string,
  args: any,
) => {
  switch (ref) {
    case 'world.heartbeatWorld':
      return updateState(store, (state) => {
        state.worldStatus.lastViewed = Date.now();
        return null;
      });
    case 'world.takeOverAgent':
      return updateState(store, (state) => {
        const agent = state.world.agents.find((a) => a.id === args.agentId);
        if (!agent) {
          throw new ConvexError('Agent not found.');
        }
        const player = state.world.players.find((p) => p.id === agent.playerId);
        if (!player) {
          throw new ConvexError('Player not found.');
        }
        player.human = state.humanToken;
        player.lastInput = Date.now();
        return nextInputId(state);
      });
    case 'world.leaveWorld':
      return updateState(store, (state) => {
        const player = state.world.players.find((p) => p.human === state.humanToken);
        if (!player) {
          throw new ConvexError('You are not controlling an agent.');
        }
        player.human = undefined;
        player.lastInput = Date.now();
        return nextInputId(state);
      });
    case 'world.removeAgent':
      return updateState(store, (state) => {
        const agentIndex = state.world.agents.findIndex((agent) => agent.id === args.agentId);
        if (agentIndex < 0) {
          throw new ConvexError('Agent not found.');
        }
        const [agent] = state.world.agents.splice(agentIndex, 1);
        state.agentDescriptions = state.agentDescriptions.filter(
          (desc) => desc.agentId !== agent.id,
        );
        state.world.players = state.world.players.filter((p) => p.id !== agent.playerId);
        state.playerDescriptions = state.playerDescriptions.filter(
          (desc) => desc.playerId !== agent.playerId,
        );
        recalculateNextId(state);
        return nextInputId(state);
      });
    case 'world.sendWorldInput':
      return updateState(store, (state) => {
        applyWorldInput(state, args.name, args.args);
        return nextInputId(state);
      });
    case 'world.joinWorld':
      return updateState(store, (state) => {
        const player = state.world.players[0];
        if (player) {
          player.human = state.humanToken;
          player.lastInput = Date.now();
        }
        return nextInputId(state);
      });
    case 'messages.writeMessage':
      return updateState(store, (state) => {
        const conversationId = args.conversationId;
        const list = state.messagesByConversationId[conversationId] ?? [];
        const message: MockMessage = {
          _id: `m${list.length + 1}-${Date.now()}`,
          _creationTime: Date.now(),
          author: args.playerId,
          messageUuid: args.messageUuid,
          text: args.text,
        };
        state.messagesByConversationId[conversationId] = [...list, message];
        applyWorldInput(state, 'finishSendingMessage', {
          conversationId,
          playerId: args.playerId,
          timestamp: message._creationTime,
        });
        return null;
      });
    case 'characterSprites.create':
      return updateState(store, (state) => {
        const textureUrl = state.storageUrls[args.storageId];
        if (!textureUrl) {
          throw new ConvexError('Invalid storage ID.');
        }
        const spriteId = `custom_${state.spriteCounter}`;
        state.spriteCounter += 1;
        state.characterSprites.push({
          spriteId,
          displayName: args.displayName.trim() || 'Custom Sprite',
          textureUrl,
          portraitUrl: args.portraitStorageId
            ? state.storageUrls[args.portraitStorageId] ?? textureUrl
            : textureUrl,
          frameWidth: args.frameWidth,
          frameHeight: args.frameHeight,
          framesPerDirection: args.framesPerDirection,
          directions: args.directions,
          storageId: args.storageId,
          isCustom: true,
          ownerId: state.humanToken,
          createdAt: Date.now(),
        });
        return { spriteId };
      });
    case 'characterSprites.remove':
      return updateState(store, (state) => {
        state.characterSprites = state.characterSprites.filter(
          (sprite) => sprite.spriteId !== args.spriteId,
        );
        return null;
      });
    default:
      throw new Error(`Unhandled mutation: ${ref}`);
  }
};

export const runAction = async (
  store: MockStoreAccess,
  ref: string,
  args: any,
) => {
  switch (ref) {
    case 'characterGeneration.generateCharacterConcept':
      return { imageUrl: DEFAULT_CONCEPT_URL };
    case 'characterGeneration.generate':
      return updateState(store, (state) => {
        const storageId = nextStorageId(state);
        state.storageUrls[storageId] = DEFAULT_SPRITE_URL;
        return { storageId };
      });
    case 'characterSprites.storeImage':
      return updateState(store, (state) => {
        const storageId = nextStorageId(state);
        state.storageUrls[storageId] = args.imageUrl || DEFAULT_CONCEPT_URL;
        return { storageId };
      });
    case 'elizaAgent.actions.createElizaAgent':
      return updateState(store, (state) => {
        const playerId = allocGameId('players', state.world.nextId);
        state.world.nextId += 1;
        const agentId = allocGameId('agents', state.world.nextId);
        state.world.nextId += 1;
        state.world.players.push(createPlayer(playerId, { x: 3, y: 3 }));
        state.world.agents.push(createAgent(agentId, playerId));
        state.playerDescriptions.push({
          playerId,
          name: args.name,
          description: args.identity,
          character: args.character,
        });
        state.agentDescriptions.push({
          agentId,
          identity: args.identity,
          plan: args.plan,
          ownerId: state.humanToken,
          isCustom: true,
        });
        return { inputId: nextInputId(state), elizaAgentId: `mock-${agentId}` };
      });
    default:
      throw new Error(`Unhandled action: ${ref}`);
  }
};

export const api = {
  world: {
    defaultWorldStatus: 'world.defaultWorldStatus',
    worldState: 'world.worldState',
    gameDescriptions: 'world.gameDescriptions',
    userStatus: 'world.userStatus',
    heartbeatWorld: 'world.heartbeatWorld',
    takeOverAgent: 'world.takeOverAgent',
    leaveWorld: 'world.leaveWorld',
    removeAgent: 'world.removeAgent',
    sendWorldInput: 'world.sendWorldInput',
    previousConversation: 'world.previousConversation',
    joinWorld: 'world.joinWorld',
  },
  messages: {
    listMessages: 'messages.listMessages',
    writeMessage: 'messages.writeMessage',
  },
  characterSprites: {
    list: 'characterSprites.list',
    listMine: 'characterSprites.listMine',
    getUrl: 'characterSprites.getUrl',
    create: 'characterSprites.create',
    remove: 'characterSprites.remove',
    storeImage: 'characterSprites.storeImage',
  },
  characterGeneration: {
    generateCharacterConcept: 'characterGeneration.generateCharacterConcept',
    generate: 'characterGeneration.generate',
  },
  elizaAgent: {
    actions: {
      createElizaAgent: 'elizaAgent.actions.createElizaAgent',
    },
  },
  music: {
    getBackgroundMusic: 'music.getBackgroundMusic',
  },
  aiTown: {
    main: {
      inputStatus: 'aiTown.main.inputStatus',
    },
  },
  testing: {
    stopAllowed: 'testing.stopAllowed',
    stop: 'testing.stop',
    resume: 'testing.resume',
  },
} as const;

export const internal = api;

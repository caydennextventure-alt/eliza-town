/**
 * Character definitions for AI Town.
 * 
 * Each character now uses an individual sprite image (96 x 128 px)
 * instead of a shared sprite sheet. This enables:
 * - Easier management of individual characters
 * - Future support for user-uploaded custom characters
 * - Dynamic character loading via Convex
 */

import { standard32x32 } from './spritesheets/standard32x32';

// Agent descriptions - personality and behavior
export const Descriptions = [
  {
    name: 'Lucky',
    character: 'f1',
    identity: `Lucky is always happy and curious, and he loves cheese. He spends most of his time reading about the history of science and traveling through the galaxy on whatever ship will take him. He's very articulate and infinitely patient, except when he sees a squirrel. He's also incredibly loyal and brave.  Lucky has just returned from an amazing space adventure to explore a distant planet and he's very excited to tell people about it.`,
    plan: 'You want to hear all the gossip.',
  },
  {
    name: 'Bob',
    character: 'f4',
    identity: `Bob is always grumpy and he loves trees. He spends most of his time gardening by himself. When spoken to he'll respond but try and get out of the conversation as quickly as possible. Secretly he resents that he never went to college.`,
    plan: 'You want to avoid people as much as possible.',
  },
  {
    name: 'Stella',
    character: 'f6',
    identity: `Stella can never be trusted. she tries to trick people all the time. normally into giving her money, or doing things that will make her money. she's incredibly charming and not afraid to use her charm. she's a sociopath who has no empathy. but hides it well.`,
    plan: 'You want to take advantage of others as much as possible.',
  },
  {
    name: 'Alice',
    character: 'f3',
    identity: `Alice is a famous scientist. She is smarter than everyone else and has discovered mysteries of the universe no one else can understand. As a result she often speaks in oblique riddles. She comes across as confused and forgetful.`,
    plan: 'You want to figure out how the world works.',
  },
  {
    name: 'Pete',
    character: 'f7',
    identity: `Pete is deeply religious and sees the hand of god or of the work of the devil everywhere. He can't have a conversation without bringing up his deep faith. Or warning others about the perils of hell.`,
    plan: 'You want to convert everyone to your religion.',
  },
];

// Character sprite definitions - now using individual images
export const characters = [
  {
    name: 'f1',
    textureUrl: '/ai-town/assets/characters/char-f1.png',
    spritesheetData: standard32x32,
    speed: 0.1,
  },
  {
    name: 'f2',
    textureUrl: '/ai-town/assets/characters/char-f2.png',
    spritesheetData: standard32x32,
    speed: 0.1,
  },
  {
    name: 'f3',
    textureUrl: '/ai-town/assets/characters/char-f3.png',
    spritesheetData: standard32x32,
    speed: 0.1,
  },
  {
    name: 'f4',
    textureUrl: '/ai-town/assets/characters/char-f4.png',
    spritesheetData: standard32x32,
    speed: 0.1,
  },
  {
    name: 'f5',
    textureUrl: '/ai-town/assets/characters/char-f5.png',
    spritesheetData: standard32x32,
    speed: 0.1,
  },
  {
    name: 'f6',
    textureUrl: '/ai-town/assets/characters/char-f6.png',
    spritesheetData: standard32x32,
    speed: 0.1,
  },
  {
    name: 'f7',
    textureUrl: '/ai-town/assets/characters/char-f7.png',
    spritesheetData: standard32x32,
    speed: 0.1,
  },
  {
    name: 'f8',
    textureUrl: '/ai-town/assets/characters/char-f8.png',
    spritesheetData: standard32x32,
    speed: 0.1,
  },
];

// Characters move at 0.75 tiles per second.
export const movementSpeed = 0.75;

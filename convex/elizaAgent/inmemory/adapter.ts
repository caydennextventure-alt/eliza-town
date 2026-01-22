/**
 * In-Memory Database Adapter for ElizaOS
 * Adapted from @elizaos/plugin-inmemorydb for Convex use
 * 
 * This adapter provides ephemeral storage for ElizaOS runtime within Convex actions.
 * Each action invocation creates a fresh adapter - no persistence between calls.
 * Use Convex's native database for persistent storage.
 */

import { EphemeralHNSW } from './hnsw';
import { COLLECTIONS, type IStorage } from './types';

// Simplified types that match ElizaOS core
type UUID = string;

interface Content {
  text?: string;
  source?: string;
  [key: string]: unknown;
}

interface Memory {
  id?: UUID;
  entityId: UUID;
  agentId?: UUID;
  createdAt?: number;
  content: Content;
  embedding?: number[];
  roomId: UUID;
  worldId?: UUID;
  unique?: boolean;
  similarity?: number;
  metadata?: MemoryMetadata;
}

interface MemoryMetadata {
  type?: string;
  source?: string;
  scope?: string;
  timestamp?: number;
  tags?: string[];
  [key: string]: unknown;
}

interface StoredMemory {
  id?: string;
  entityId: string;
  agentId?: string;
  createdAt?: number;
  content: Content;
  embedding?: number[];
  roomId: string;
  worldId?: string;
  unique?: boolean;
  similarity?: number;
  metadata?: MemoryMetadata;
}

function toMemory(stored: StoredMemory): Memory {
  return {
    id: stored.id as UUID | undefined,
    entityId: stored.entityId as UUID,
    agentId: stored.agentId as UUID | undefined,
    createdAt: stored.createdAt,
    content: stored.content,
    embedding: stored.embedding,
    roomId: stored.roomId as UUID,
    worldId: stored.worldId as UUID | undefined,
    unique: stored.unique,
    similarity: stored.similarity,
    metadata: stored.metadata,
  };
}

function toMemories(stored: StoredMemory[]): Memory[] {
  return stored.map(toMemory);
}

interface Agent {
  id: UUID;
  name: string;
  [key: string]: unknown;
}

interface Room {
  id?: UUID;
  worldId?: UUID;
  [key: string]: unknown;
}

interface World {
  id?: UUID;
  [key: string]: unknown;
}

interface Log {
  id: UUID;
  entityId: UUID;
  roomId: UUID;
  body: unknown;
  type: string;
  createdAt: Date;
}

/**
 * In-Memory Database Adapter
 * Provides ElizaOS-compatible database interface using ephemeral storage
 */
export class InMemoryDatabaseAdapter {
  private storage: IStorage;
  private vectorIndex: EphemeralHNSW;
  private embeddingDimension = 384;
  private ready = false;
  private agentId: UUID;

  constructor(storage: IStorage, agentId: UUID) {
    this.storage = storage;
    this.agentId = agentId;
    this.vectorIndex = new EphemeralHNSW();
  }

  async init(): Promise<void> {
    await this.storage.init();
    await this.vectorIndex.init(this.embeddingDimension);
    this.ready = true;
  }

  async isReady(): Promise<boolean> {
    return this.ready && (await this.storage.isReady());
  }

  async close(): Promise<void> {
    await this.vectorIndex.clear();
    await this.storage.close();
    this.ready = false;
  }

  // Agent methods
  async getAgent(agentId: UUID): Promise<Agent | null> {
    return this.storage.get<Agent>(COLLECTIONS.AGENTS, agentId);
  }

  async createAgent(agent: Partial<Agent>): Promise<boolean> {
    if (!agent.id) return false;
    await this.storage.set(COLLECTIONS.AGENTS, agent.id, agent);
    return true;
  }

  // Memory methods
  async getMemories(params: {
    entityId?: UUID;
    agentId?: UUID;
    count?: number;
    offset?: number;
    unique?: boolean;
    tableName: string;
    start?: number;
    end?: number;
    roomId?: UUID;
    worldId?: UUID;
  }): Promise<Memory[]> {
    let memories = await this.storage.getWhere<StoredMemory>(COLLECTIONS.MEMORIES, (m) => {
      if (params.entityId && m.entityId !== params.entityId) return false;
      if (params.agentId && m.agentId !== params.agentId) return false;
      if (params.roomId && m.roomId !== params.roomId) return false;
      if (params.worldId && m.worldId !== params.worldId) return false;
      if (params.tableName && m.metadata?.type !== params.tableName) return false;
      if (params.start && m.createdAt && m.createdAt < params.start) return false;
      if (params.end && m.createdAt && m.createdAt > params.end) return false;
      if (params.unique && !m.unique) return false;
      return true;
    });

    memories.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    if (params.offset) {
      memories = memories.slice(params.offset);
    }
    if (params.count) {
      memories = memories.slice(0, params.count);
    }

    return toMemories(memories);
  }

  async getMemoryById(id: UUID): Promise<Memory | null> {
    return this.storage.get<Memory>(COLLECTIONS.MEMORIES, id);
  }

  async createMemory(memory: Memory, tableName: string, unique = false): Promise<UUID> {
    const id = memory.id ?? (crypto.randomUUID() as UUID);
    const now = Date.now();

    const storedMemory: StoredMemory = {
      ...memory,
      id,
      agentId: memory.agentId ?? this.agentId,
      unique: unique || memory.unique,
      createdAt: memory.createdAt ?? now,
      metadata: {
        ...(memory.metadata ?? {}),
        type: tableName,
      },
    };

    await this.storage.set(COLLECTIONS.MEMORIES, id, storedMemory);

    if (memory.embedding && memory.embedding.length > 0) {
      await this.vectorIndex.add(id, memory.embedding);
    }

    return id;
  }

  async searchMemories(params: {
    tableName: string;
    embedding: number[];
    match_threshold?: number;
    count?: number;
    unique?: boolean;
    roomId?: UUID;
    worldId?: UUID;
    entityId?: UUID;
  }): Promise<Memory[]> {
    const threshold = params.match_threshold ?? 0.5;
    const count = params.count ?? 10;

    const results = await this.vectorIndex.search(params.embedding, count * 2, threshold);

    const memories: Memory[] = [];
    for (const result of results) {
      const memory = await this.storage.get<StoredMemory>(COLLECTIONS.MEMORIES, result.id);
      if (!memory) continue;

      if (params.tableName && memory.metadata?.type !== params.tableName) continue;
      if (params.roomId && memory.roomId !== params.roomId) continue;
      if (params.worldId && memory.worldId !== params.worldId) continue;
      if (params.entityId && memory.entityId !== params.entityId) continue;
      if (params.unique && !memory.unique) continue;

      memories.push({
        ...toMemory(memory),
        similarity: result.similarity,
      });
    }

    return memories.slice(0, count);
  }

  // Room methods
  async createRooms(rooms: Room[]): Promise<UUID[]> {
    const ids: UUID[] = [];
    for (const room of rooms) {
      const id = room.id ?? (crypto.randomUUID() as UUID);
      await this.storage.set(COLLECTIONS.ROOMS, id, { ...room, id });
      ids.push(id);
    }
    return ids;
  }

  async getRoomsByIds(roomIds: UUID[]): Promise<Room[] | null> {
    const rooms: Room[] = [];
    for (const id of roomIds) {
      const room = await this.storage.get<Room>(COLLECTIONS.ROOMS, id);
      if (room) rooms.push(room);
    }
    return rooms.length > 0 ? rooms : null;
  }

  // World methods
  async createWorld(world: World): Promise<UUID> {
    const id = world.id ?? (crypto.randomUUID() as UUID);
    await this.storage.set(COLLECTIONS.WORLDS, id, { ...world, id });
    return id;
  }

  async getWorld(id: UUID): Promise<World | null> {
    return this.storage.get<World>(COLLECTIONS.WORLDS, id);
  }

  // Log methods
  async log(params: { body: unknown; entityId: UUID; roomId: UUID; type: string }): Promise<void> {
    const id = crypto.randomUUID() as UUID;
    const log: Log = {
      id,
      entityId: params.entityId,
      roomId: params.roomId,
      body: params.body,
      type: params.type,
      createdAt: new Date(),
    };
    await this.storage.set(COLLECTIONS.LOGS, id, log);
  }

  // Cache methods
  async getCache<T>(key: string): Promise<T | undefined> {
    const cached = await this.storage.get<{ value: T; expiresAt?: number }>(COLLECTIONS.CACHE, key);
    if (!cached) return undefined;

    if (cached.expiresAt && Date.now() > cached.expiresAt) {
      await this.deleteCache(key);
      return undefined;
    }

    return cached.value;
  }

  async setCache<T>(key: string, value: T): Promise<boolean> {
    await this.storage.set(COLLECTIONS.CACHE, key, { value });
    return true;
  }

  async deleteCache(key: string): Promise<boolean> {
    return this.storage.delete(COLLECTIONS.CACHE, key);
  }
}

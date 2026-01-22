/**
 * ElizaOS In-Memory Storage for Convex
 * 
 * This module provides ephemeral in-memory storage for running ElizaOS
 * directly within Convex actions, without requiring an external server.
 */

export { MemoryStorage } from './storage';
export { EphemeralHNSW } from './hnsw';
export { InMemoryDatabaseAdapter } from './adapter';
export { COLLECTIONS } from './types';
export type { IStorage, IVectorStorage, VectorSearchResult, CollectionName } from './types';

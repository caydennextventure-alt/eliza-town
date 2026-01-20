import { ObjectType, v } from 'convex/values';
import { GameId, agentId, parseGameId } from './ids';

export class AgentDescription {
  agentId: GameId<'agents'>;
  identity: string;
  plan: string;
  ownerId?: string;
  isCustom?: boolean;

  constructor(serialized: SerializedAgentDescription) {
    const { agentId, identity, plan, ownerId, isCustom } = serialized;
    this.agentId = parseGameId('agents', agentId);
    this.identity = identity;
    this.plan = plan;
    this.ownerId = ownerId;
    this.isCustom = isCustom;
  }

  serialize(): SerializedAgentDescription {
    const { agentId, identity, plan, ownerId, isCustom } = this;
    const serialized: SerializedAgentDescription = { agentId, identity, plan };
    if (ownerId !== undefined) {
      serialized.ownerId = ownerId;
    }
    if (isCustom !== undefined) {
      serialized.isCustom = isCustom;
    }
    return serialized;
  }
}

export const serializedAgentDescription = {
  agentId,
  identity: v.string(),
  plan: v.string(),
  ownerId: v.optional(v.string()),
  isCustom: v.optional(v.boolean()),
};
export type SerializedAgentDescription = ObjectType<typeof serializedAgentDescription>;

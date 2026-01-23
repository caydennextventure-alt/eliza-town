/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_conversation from "../agent/conversation.js";
import type * as agent_embeddingsCache from "../agent/embeddingsCache.js";
import type * as agent_memory from "../agent/memory.js";
import type * as aiTown_agent from "../aiTown/agent.js";
import type * as aiTown_agentDescription from "../aiTown/agentDescription.js";
import type * as aiTown_agentInputs from "../aiTown/agentInputs.js";
import type * as aiTown_agentOperations from "../aiTown/agentOperations.js";
import type * as aiTown_characterSprite from "../aiTown/characterSprite.js";
import type * as aiTown_conversation from "../aiTown/conversation.js";
import type * as aiTown_conversationMembership from "../aiTown/conversationMembership.js";
import type * as aiTown_game from "../aiTown/game.js";
import type * as aiTown_ids from "../aiTown/ids.js";
import type * as aiTown_inputHandler from "../aiTown/inputHandler.js";
import type * as aiTown_inputs from "../aiTown/inputs.js";
import type * as aiTown_insertInput from "../aiTown/insertInput.js";
import type * as aiTown_location from "../aiTown/location.js";
import type * as aiTown_main from "../aiTown/main.js";
import type * as aiTown_movement from "../aiTown/movement.js";
import type * as aiTown_player from "../aiTown/player.js";
import type * as aiTown_playerDescription from "../aiTown/playerDescription.js";
import type * as aiTown_world from "../aiTown/world.js";
import type * as aiTown_worldMap from "../aiTown/worldMap.js";
import type * as characterGeneration from "../characterGeneration.js";
import type * as characterSprites from "../characterSprites.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as elizaAgent_actions from "../elizaAgent/actions.js";
import type * as elizaAgent_mutations from "../elizaAgent/mutations.js";
import type * as elizaAgent_queries from "../elizaAgent/queries.js";
import type * as engine_abstractGame from "../engine/abstractGame.js";
import type * as engine_historicalObject from "../engine/historicalObject.js";
import type * as http from "../http.js";
import type * as init from "../init.js";
import type * as maintenance from "../maintenance.js";
import type * as messages from "../messages.js";
import type * as music from "../music.js";
import type * as testing from "../testing.js";
import type * as util_FastIntegerCompression from "../util/FastIntegerCompression.js";
import type * as util_assertNever from "../util/assertNever.js";
import type * as util_asyncMap from "../util/asyncMap.js";
import type * as util_compression from "../util/compression.js";
import type * as util_geometry from "../util/geometry.js";
import type * as util_isSimpleObject from "../util/isSimpleObject.js";
import type * as util_llm from "../util/llm.js";
import type * as util_minheap from "../util/minheap.js";
import type * as util_object from "../util/object.js";
import type * as util_sleep from "../util/sleep.js";
import type * as util_types from "../util/types.js";
import type * as util_xxhash from "../util/xxhash.js";
import type * as werewolf from "../werewolf.js";
import type * as werewolf_advancePhase from "../werewolf/advancePhase.js";
import type * as werewolf_db from "../werewolf/db.js";
import type * as werewolf_engine_day from "../werewolf/engine/day.js";
import type * as werewolf_engine_earlyAdvance from "../werewolf/engine/earlyAdvance.js";
import type * as werewolf_engine_events from "../werewolf/engine/events.js";
import type * as werewolf_engine_narrator from "../werewolf/engine/narrator.js";
import type * as werewolf_engine_night from "../werewolf/engine/night.js";
import type * as werewolf_engine_roleAssign from "../werewolf/engine/roleAssign.js";
import type * as werewolf_engine_state from "../werewolf/engine/state.js";
import type * as werewolf_engine_transitions from "../werewolf/engine/transitions.js";
import type * as werewolf_engine_win from "../werewolf/engine/win.js";
import type * as werewolf_idempotency from "../werewolf/idempotency.js";
import type * as werewolf_match from "../werewolf/match.js";
import type * as werewolf_matchmaking from "../werewolf/matchmaking.js";
import type * as werewolf_queries from "../werewolf/queries.js";
import type * as werewolf_queue from "../werewolf/queue.js";
import type * as werewolf_types from "../werewolf/types.js";
import type * as world from "../world.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/conversation": typeof agent_conversation;
  "agent/embeddingsCache": typeof agent_embeddingsCache;
  "agent/memory": typeof agent_memory;
  "aiTown/agent": typeof aiTown_agent;
  "aiTown/agentDescription": typeof aiTown_agentDescription;
  "aiTown/agentInputs": typeof aiTown_agentInputs;
  "aiTown/agentOperations": typeof aiTown_agentOperations;
  "aiTown/characterSprite": typeof aiTown_characterSprite;
  "aiTown/conversation": typeof aiTown_conversation;
  "aiTown/conversationMembership": typeof aiTown_conversationMembership;
  "aiTown/game": typeof aiTown_game;
  "aiTown/ids": typeof aiTown_ids;
  "aiTown/inputHandler": typeof aiTown_inputHandler;
  "aiTown/inputs": typeof aiTown_inputs;
  "aiTown/insertInput": typeof aiTown_insertInput;
  "aiTown/location": typeof aiTown_location;
  "aiTown/main": typeof aiTown_main;
  "aiTown/movement": typeof aiTown_movement;
  "aiTown/player": typeof aiTown_player;
  "aiTown/playerDescription": typeof aiTown_playerDescription;
  "aiTown/world": typeof aiTown_world;
  "aiTown/worldMap": typeof aiTown_worldMap;
  characterGeneration: typeof characterGeneration;
  characterSprites: typeof characterSprites;
  constants: typeof constants;
  crons: typeof crons;
  "elizaAgent/actions": typeof elizaAgent_actions;
  "elizaAgent/mutations": typeof elizaAgent_mutations;
  "elizaAgent/queries": typeof elizaAgent_queries;
  "engine/abstractGame": typeof engine_abstractGame;
  "engine/historicalObject": typeof engine_historicalObject;
  http: typeof http;
  init: typeof init;
  maintenance: typeof maintenance;
  messages: typeof messages;
  music: typeof music;
  testing: typeof testing;
  "util/FastIntegerCompression": typeof util_FastIntegerCompression;
  "util/assertNever": typeof util_assertNever;
  "util/asyncMap": typeof util_asyncMap;
  "util/compression": typeof util_compression;
  "util/geometry": typeof util_geometry;
  "util/isSimpleObject": typeof util_isSimpleObject;
  "util/llm": typeof util_llm;
  "util/minheap": typeof util_minheap;
  "util/object": typeof util_object;
  "util/sleep": typeof util_sleep;
  "util/types": typeof util_types;
  "util/xxhash": typeof util_xxhash;
  werewolf: typeof werewolf;
  "werewolf/advancePhase": typeof werewolf_advancePhase;
  "werewolf/db": typeof werewolf_db;
  "werewolf/engine/day": typeof werewolf_engine_day;
  "werewolf/engine/earlyAdvance": typeof werewolf_engine_earlyAdvance;
  "werewolf/engine/events": typeof werewolf_engine_events;
  "werewolf/engine/narrator": typeof werewolf_engine_narrator;
  "werewolf/engine/night": typeof werewolf_engine_night;
  "werewolf/engine/roleAssign": typeof werewolf_engine_roleAssign;
  "werewolf/engine/state": typeof werewolf_engine_state;
  "werewolf/engine/transitions": typeof werewolf_engine_transitions;
  "werewolf/engine/win": typeof werewolf_engine_win;
  "werewolf/idempotency": typeof werewolf_idempotency;
  "werewolf/match": typeof werewolf_match;
  "werewolf/matchmaking": typeof werewolf_matchmaking;
  "werewolf/queries": typeof werewolf_queries;
  "werewolf/queue": typeof werewolf_queue;
  "werewolf/types": typeof werewolf_types;
  world: typeof world;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

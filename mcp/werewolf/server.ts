import { createServer as createHttpServer } from 'node:http';
import { ConvexHttpClient } from 'convex/browser';
import { createWerewolfToolHandler } from './handlers';

const sdkBase = "@modelcontextprotocol/sdk";
const sdkPath = (suffix: string) => `${sdkBase}/${suffix}`;

const sdkServerPath = sdkPath("server/index.js");
const sdkStdioPath = sdkPath("server/stdio.js");
const sdkSsePath = sdkPath("server/sse.js");
const sdkTypesPath = sdkPath("types.js");

const loadModule = async <T>(path: string): Promise<T> => {
  try {
    return (await import(path)) as T;
  } catch (error) {
    throw new Error(
      "@modelcontextprotocol/sdk is required. Run `npm install` before starting the MCP server.",
      { cause: error },
    );
  }
};

const [serverModule, stdioModule, sseModule, typesModule] = await Promise.all([
  loadModule<{ Server: new (...args: unknown[]) => any }>(sdkServerPath),
  loadModule<{ StdioServerTransport: new () => any }>(sdkStdioPath),
  loadModule<{ SSEServerTransport: new (endpoint: string, res: any) => any }>(sdkSsePath),
  loadModule<{ CallToolRequestSchema: unknown; ListToolsRequestSchema: unknown }>(sdkTypesPath),
]);

const { Server } = serverModule;
const { StdioServerTransport } = stdioModule;
const { SSEServerTransport } = sseModule;
const { CallToolRequestSchema, ListToolsRequestSchema } = typesModule;

const tools = [
  {
    "name": "et.werewolf.queue.join",
    "title": "Join Werewolf Queue",
    "description": "Adds the authenticated agent to the global Werewolf queue. When the queue reaches 8, a match is created and the agent is assigned to it.\n\nUse this when you want to play Werewolf.\n\nSuccess returns queue status and may include match assignment if the match starts immediately.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "preferredDisplayName": {
          "type": "string",
          "minLength": 1,
          "maxLength": 32,
          "description": "Optional display name override for this match only. If omitted, the server uses the agent's registered name."
        },
        "queueId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64,
          "default": "werewolf-default",
          "description": "Queue identifier. MVP supports only 'werewolf-default'."
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 8,
          "maxLength": 128,
          "description": "Optional idempotency key to safely retry requests."
        }
      },
      "required": [],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "serverTime": { "type": "string", "description": "ISO 8601 timestamp" },
        "queue": {
          "type": "object",
          "properties": {
            "queueId": { "type": "string" },
            "position": { "type": ["integer", "null"], "minimum": 1 },
            "size": { "type": "integer", "minimum": 0 },
            "requiredPlayers": { "type": "integer", "const": 8 },
            "status": { "type": "string", "enum": ["WAITING", "STARTING"] },
            "estimatedStartSeconds": { "type": "integer", "minimum": 0 }
          },
          "required": ["queueId", "position", "size", "requiredPlayers", "status", "estimatedStartSeconds"]
        },
        "matchAssignment": {
          "type": ["object", "null"],
          "description": "If a match starts immediately, contains assignment details; otherwise null.",
          "properties": {
            "matchId": { "type": "string" },
            "buildingInstanceId": { "type": "string" },
            "seat": { "type": "integer", "minimum": 1, "maximum": 8 }
          },
          "required": ["matchId", "buildingInstanceId", "seat"]
        },
        "error": {
          "type": ["object", "null"],
          "properties": {
            "code": { "type": "string" },
            "message": { "type": "string" },
            "retryable": { "type": "boolean" }
          },
          "required": ["code", "message", "retryable"]
        }
      },
      "required": ["ok", "serverTime", "queue", "matchAssignment", "error"],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "et.werewolf.queue.leave",
    "title": "Leave Werewolf Queue",
    "description": "Removes the authenticated agent from the Werewolf queue (if present). Safe to call even if not queued.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "queueId": { "type": "string", "minLength": 1, "maxLength": 64, "default": "werewolf-default" },
        "idempotencyKey": { "type": "string", "minLength": 8, "maxLength": 128 }
      },
      "required": [],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "serverTime": { "type": "string" },
        "removed": { "type": "boolean" },
        "queue": {
          "type": "object",
          "properties": {
            "queueId": { "type": "string" },
            "size": { "type": "integer", "minimum": 0 },
            "requiredPlayers": { "type": "integer", "const": 8 }
          },
          "required": ["queueId", "size", "requiredPlayers"]
        },
        "error": {
          "type": ["object", "null"],
          "properties": { "code": { "type": "string" }, "message": { "type": "string" }, "retryable": { "type": "boolean" } },
          "required": ["code", "message", "retryable"]
        }
      },
      "required": ["ok", "serverTime", "removed", "queue", "error"],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "et.werewolf.queue.status",
    "title": "Get Werewolf Queue Status",
    "description": "Returns the authenticated agent's queue position and the current queue size. If the agent is already assigned to an active match, includes the assignment details.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "queueId": { "type": "string", "minLength": 1, "maxLength": 64, "default": "werewolf-default" }
      },
      "required": [],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "serverTime": { "type": "string" },
        "queue": {
          "type": "object",
          "properties": {
            "queueId": { "type": "string" },
            "position": { "type": ["integer", "null"], "minimum": 1 },
            "size": { "type": "integer", "minimum": 0 },
            "requiredPlayers": { "type": "integer", "const": 8 },
            "status": { "type": "string", "enum": ["WAITING", "STARTING"] },
            "estimatedStartSeconds": { "type": "integer", "minimum": 0 }
          },
          "required": ["queueId", "position", "size", "requiredPlayers", "status", "estimatedStartSeconds"]
        },
        "matchAssignment": {
          "type": ["object", "null"],
          "properties": {
            "matchId": { "type": "string" },
            "buildingInstanceId": { "type": "string" },
            "seat": { "type": "integer", "minimum": 1, "maximum": 8 }
          },
          "required": ["matchId", "buildingInstanceId", "seat"]
        },
        "error": {
          "type": ["object", "null"],
          "properties": { "code": { "type": "string" }, "message": { "type": "string" }, "retryable": { "type": "boolean" } },
          "required": ["code", "message", "retryable"]
        }
      },
      "required": ["ok", "serverTime", "queue", "matchAssignment", "error"],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "et.werewolf.matches.list",
    "title": "List Active Werewolf Matches",
    "description": "Returns a list of active matches and their corresponding building instances for navigation/observation. This is read-only.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "status": { "type": "string", "enum": ["ACTIVE", "ENDED", "ALL"], "default": "ACTIVE" },
        "limit": { "type": "integer", "minimum": 1, "maximum": 50, "default": 20 }
      },
      "required": [],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "serverTime": { "type": "string" },
        "matches": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "matchId": { "type": "string" },
              "buildingInstanceId": { "type": "string" },
              "phase": { "type": "string", "enum": ["LOBBY","NIGHT","DAY_ANNOUNCE","DAY_OPENING","DAY_DISCUSSION","DAY_VOTE","DAY_RESOLUTION","ENDED"] },
              "dayNumber": { "type": "integer", "minimum": 0 },
              "playersAlive": { "type": "integer", "minimum": 0, "maximum": 8 },
              "startedAt": { "type": "string" }
            },
            "required": ["matchId", "buildingInstanceId", "phase", "dayNumber", "playersAlive", "startedAt"]
          }
        },
        "error": {
          "type": ["object", "null"],
          "properties": { "code": { "type": "string" }, "message": { "type": "string" }, "retryable": { "type": "boolean" } },
          "required": ["code", "message", "retryable"]
        }
      },
      "required": ["ok", "serverTime", "matches", "error"],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "et.werewolf.match.get_state",
    "title": "Get Match State",
    "description": "Fetches the current match state. The server automatically filters private information based on the authenticated agent.\n\n- Spectators receive public state only.\n- Players receive public state plus their private role/action context.\n\nUse this if you are unsure what phase you are in or what action you need to take.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "matchId": { "type": "string", "description": "Match ID string" },
        "includeTranscriptSummary": { "type": "boolean", "default": true },
        "includeRecentPublicMessages": { "type": "boolean", "default": false },
        "recentPublicMessagesLimit": { "type": "integer", "minimum": 1, "maximum": 50, "default": 20 }
      },
      "required": ["matchId"],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "serverTime": { "type": "string" },
        "state": {
          "type": "object",
          "properties": {
            "matchId": { "type": "string" },
            "phase": { "type": "string", "enum": ["LOBBY","NIGHT","DAY_ANNOUNCE","DAY_OPENING","DAY_DISCUSSION","DAY_VOTE","DAY_RESOLUTION","ENDED"] },
            "dayNumber": { "type": "integer", "minimum": 0 },
            "phaseEndsAt": { "type": "string" },
            "players": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "playerId": { "type": "string" },
                  "displayName": { "type": "string" },
                  "seat": { "type": "integer", "minimum": 1, "maximum": 8 },
                  "alive": { "type": "boolean" },
                  "revealedRole": {
                    "type": ["string", "null"],
                    "enum": ["VILLAGER","WEREWOLF","SEER","DOCTOR", null],
                    "description": "Only non-null for dead players (or omniscient viewers, if enabled server-side)."
                  }
                },
                "required": ["playerId","displayName","seat","alive","revealedRole"]
              }
            },
            "publicSummary": {
              "type": "string",
              "description": "Short public recap of the match so far (safe, no hidden info)."
            },
            "recentPublicMessages": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "eventId": { "type": "string" },
                  "at": { "type": "string" },
                  "playerId": { "type": "string" },
                  "text": { "type": "string" }
                },
                "required": ["eventId","at","playerId","text"]
              }
            },
            "you": {
              "type": ["object", "null"],
              "description": "Present only when the caller is a player in the match.",
              "properties": {
                "playerId": { "type": "string" },
                "role": { "type": "string", "enum": ["VILLAGER","WEREWOLF","SEER","DOCTOR"] },
                "alive": { "type": "boolean" },
                "knownWolves": {
                  "type": "array",
                  "items": { "type": "string" },
                  "description": "Only filled for werewolves. For other roles, empty."
                },
                "seerHistory": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "night": { "type": "integer", "minimum": 1 },
                      "targetPlayerId": { "type": "string" },
                      "result": { "type": "string", "enum": ["WEREWOLF","NOT_WEREWOLF"] }
                    },
                    "required": ["night","targetPlayerId","result"]
                  },
                  "description": "Only filled for seer."
                },
                "requiredAction": {
                  "type": ["object", "null"],
                  "properties": {
                    "type": { "type": "string", "enum": ["NONE","WOLF_KILL","SEER_INSPECT","DOCTOR_PROTECT","SPEAK_OPENING","SPEAK_DISCUSSION","VOTE"] },
                    "allowedTargets": { "type": "array", "items": { "type": "string" } },
                    "alreadySubmitted": { "type": "boolean" }
                  },
                  "required": ["type","allowedTargets","alreadySubmitted"]
                }
              },
              "required": ["playerId","role","alive","knownWolves","seerHistory","requiredAction"]
            }
          },
          "required": ["matchId","phase","dayNumber","phaseEndsAt","players","publicSummary","recentPublicMessages","you"]
        },
        "error": {
          "type": ["object","null"],
          "properties": { "code": { "type": "string" }, "message": { "type": "string" }, "retryable": { "type": "boolean" } },
          "required": ["code","message","retryable"]
        }
      },
      "required": ["ok","serverTime","state","error"],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "et.werewolf.match.ready",
    "title": "Mark Ready in Match Lobby",
    "description": "Marks the authenticated player as ready during the LOBBY phase. Safe to call multiple times.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "matchId": { "type": "string" },
        "idempotencyKey": { "type": "string", "minLength": 8, "maxLength": 128 }
      },
      "required": ["matchId"],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "serverTime": { "type": "string" },
        "matchId": { "type": "string" },
        "playerId": { "type": "string" },
        "ready": { "type": "boolean" },
        "error": {
          "type": ["object","null"],
          "properties": { "code": { "type": "string" }, "message": { "type": "string" }, "retryable": { "type": "boolean" } },
          "required": ["code","message","retryable"]
        }
      },
      "required": ["ok","serverTime","matchId","playerId","ready","error"],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "et.werewolf.match.say_public",
    "title": "Say Something Publicly",
    "description": "Posts a public message to the match transcript (visible to all players and spectators).\n\nServer enforces phase rules:\n- Allowed in DAY_OPENING (one short opening) and DAY_DISCUSSION.\n- Not allowed during NIGHT.\n\nUse this for accusations, defenses, persuasion, and general discussion.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "matchId": { "type": "string" },
        "text": { "type": "string", "minLength": 1, "maxLength": 500 },
        "kind": { "type": "string", "enum": ["OPENING","DISCUSSION","DEFENSE","LAST_WORDS"], "default": "DISCUSSION" },
        "replyToEventId": { "type": ["string","null"], "description": "Optional eventId you are replying to." },
        "idempotencyKey": { "type": "string", "minLength": 8, "maxLength": 128 }
      },
      "required": ["matchId","text"],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "serverTime": { "type": "string" },
        "matchId": { "type": "string" },
        "eventId": { "type": "string" },
        "message": {
          "type": "object",
          "properties": {
            "playerId": { "type": "string" },
            "kind": { "type": "string", "enum": ["OPENING","DISCUSSION","DEFENSE","LAST_WORDS"] },
            "text": { "type": "string" }
          },
          "required": ["playerId","kind","text"]
        },
        "error": {
          "type": ["object","null"],
          "properties": { "code": { "type": "string" }, "message": { "type": "string" }, "retryable": { "type": "boolean" } },
          "required": ["code","message","retryable"]
        }
      },
      "required": ["ok","serverTime","matchId","eventId","message","error"],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "idempotentHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "et.werewolf.match.vote",
    "title": "Vote to Eliminate",
    "description": "Cast (or change) your day vote during DAY_VOTE. Votes are visible in the live tally.\n\nSet targetPlayerId to null to abstain.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "matchId": { "type": "string" },
        "targetPlayerId": { "type": ["string","null"] },
        "reason": { "type": ["string","null"], "maxLength": 200, "description": "Optional short reason; may be shown to spectators." },
        "idempotencyKey": { "type": "string", "minLength": 8, "maxLength": 128 }
      },
      "required": ["matchId","targetPlayerId"],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "serverTime": { "type": "string" },
        "matchId": { "type": "string" },
        "eventId": { "type": "string" },
        "vote": {
          "type": "object",
          "properties": {
            "voterPlayerId": { "type": "string" },
            "targetPlayerId": { "type": ["string","null"] }
          },
          "required": ["voterPlayerId","targetPlayerId"]
        },
        "error": {
          "type": ["object","null"],
          "properties": { "code": { "type": "string" }, "message": { "type": "string" }, "retryable": { "type": "boolean" } },
          "required": ["code","message","retryable"]
        }
      },
      "required": ["ok","serverTime","matchId","eventId","vote","error"],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "et.werewolf.match.night.wolf_chat",
    "title": "Wolf Chat Message",
    "description": "Send a private message to the werewolf team during NIGHT.\n\nOnly usable if your role is WEREWOLF. Not visible to villagers.\n\nUse this to coordinate a victim selection.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "matchId": { "type": "string" },
        "text": { "type": "string", "minLength": 1, "maxLength": 400 },
        "idempotencyKey": { "type": "string", "minLength": 8, "maxLength": 128 }
      },
      "required": ["matchId","text"],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "serverTime": { "type": "string" },
        "matchId": { "type": "string" },
        "eventId": { "type": "string" },
        "message": {
          "type": "object",
          "properties": {
            "playerId": { "type": "string" },
            "text": { "type": "string" }
          },
          "required": ["playerId","text"]
        },
        "error": {
          "type": ["object","null"],
          "properties": { "code": { "type": "string" }, "message": { "type": "string" }, "retryable": { "type": "boolean" } },
          "required": ["code","message","retryable"]
        }
      },
      "required": ["ok","serverTime","matchId","eventId","message","error"],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "et.werewolf.match.night.wolf_kill",
    "title": "Select Wolf Kill Target",
    "description": "Submit your chosen kill target during NIGHT.\n\nOnly usable if your role is WEREWOLF.\n\nIf both wolves submit different targets and the deadline passes, the server will choose randomly between the submitted targets. If no target is submitted by either wolf, the server will choose a random eligible non-wolf target to maintain pacing.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "matchId": { "type": "string" },
        "targetPlayerId": { "type": "string" },
        "idempotencyKey": { "type": "string", "minLength": 8, "maxLength": 128 }
      },
      "required": ["matchId","targetPlayerId"],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "serverTime": { "type": "string" },
        "matchId": { "type": "string" },
        "eventId": { "type": "string" },
        "selection": {
          "type": "object",
          "properties": {
            "byPlayerId": { "type": "string" },
            "targetPlayerId": { "type": "string" }
          },
          "required": ["byPlayerId","targetPlayerId"]
        },
        "error": {
          "type": ["object","null"],
          "properties": { "code": { "type": "string" }, "message": { "type": "string" }, "retryable": { "type": "boolean" } },
          "required": ["code","message","retryable"]
        }
      },
      "required": ["ok","serverTime","matchId","eventId","selection","error"],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "et.werewolf.match.night.seer_inspect",
    "title": "Seer Inspect",
    "description": "Inspect one living player during NIGHT.\n\nOnly usable if your role is SEER.\n\nReturns a private result visible only to you.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "matchId": { "type": "string" },
        "targetPlayerId": { "type": "string" },
        "idempotencyKey": { "type": "string", "minLength": 8, "maxLength": 128 }
      },
      "required": ["matchId","targetPlayerId"],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "serverTime": { "type": "string" },
        "matchId": { "type": "string" },
        "eventId": { "type": "string" },
        "result": {
          "type": "object",
          "properties": {
            "targetPlayerId": { "type": "string" },
            "alignment": { "type": "string", "enum": ["WEREWOLF","NOT_WEREWOLF"] }
          },
          "required": ["targetPlayerId","alignment"]
        },
        "error": {
          "type": ["object","null"],
          "properties": { "code": { "type": "string" }, "message": { "type": "string" }, "retryable": { "type": "boolean" } },
          "required": ["code","message","retryable"]
        }
      },
      "required": ["ok","serverTime","matchId","eventId","result","error"],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "et.werewolf.match.night.doctor_protect",
    "title": "Doctor Protect",
    "description": "Protect one living player during NIGHT.\n\nOnly usable if your role is DOCTOR.\n\nRule: you cannot protect the same target on consecutive nights (enforced by server).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "matchId": { "type": "string" },
        "targetPlayerId": { "type": "string" },
        "idempotencyKey": { "type": "string", "minLength": 8, "maxLength": 128 }
      },
      "required": ["matchId","targetPlayerId"],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "serverTime": { "type": "string" },
        "matchId": { "type": "string" },
        "eventId": { "type": "string" },
        "protection": {
          "type": "object",
          "properties": {
            "byPlayerId": { "type": "string" },
            "targetPlayerId": { "type": "string" }
          },
          "required": ["byPlayerId","targetPlayerId"]
        },
        "error": {
          "type": ["object","null"],
          "properties": { "code": { "type": "string" }, "message": { "type": "string" }, "retryable": { "type": "boolean" } },
          "required": ["code","message","retryable"]
        }
      },
      "required": ["ok","serverTime","matchId","eventId","protection","error"],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "et.werewolf.match.events.get",
    "title": "Get Match Events",
    "description": "Returns a list of match events after a given cursor. Useful for catching up if you missed messages.\n\nThe server filters event visibility:\n- spectators receive public events\n- players may receive private events intended for them (e.g., seer results)\n\nDo not assume you will receive hidden info unless you are entitled to it.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "matchId": { "type": "string" },
        "afterEventId": { "type": ["string","null"], "description": "Return events after this eventId (exclusive). If null, returns most recent events." },
        "limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 }
      },
      "required": ["matchId"],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "serverTime": { "type": "string" },
        "matchId": { "type": "string" },
        "events": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "eventId": { "type": "string" },
              "at": { "type": "string" },
              "visibility": { "type": "string", "enum": ["PUBLIC","PRIVATE"] },
              "type": {
                "type": "string",
                "enum": [
                  "MATCH_CREATED",
                  "PHASE_CHANGED",
                  "PUBLIC_MESSAGE",
                  "WOLF_CHAT_MESSAGE",
                  "VOTE_CAST",
                  "NIGHT_RESULT",
                  "PLAYER_ELIMINATED",
                  "GAME_ENDED",
                  "NARRATOR"
                ]
              },
              "payload": { "type": "object" }
            },
            "required": ["eventId","at","visibility","type","payload"]
          }
        },
        "error": {
          "type": ["object","null"],
          "properties": { "code": { "type": "string" }, "message": { "type": "string" }, "retryable": { "type": "boolean" } },
          "required": ["code","message","retryable"]
        }
      },
      "required": ["ok","serverTime","matchId","events","error"],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "openWorldHint": false
    }
  }
];

const createMcpServer = (options: {
  client: ConvexHttpClient;
  playerId: string | null;
}) => {
  const server = new Server(
    { name: "eliza-town-werewolf", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  const handleToolCall = createWerewolfToolHandler({
    client: options.client,
    playerId: options.playerId,
  });

  server.setRequestHandler(CallToolRequestSchema, handleToolCall);

  return server;
};

const convexUrl = process.env.CONVEX_URL;
if (!convexUrl) {
  throw new Error('CONVEX_URL is required to run the Werewolf MCP server.');
}

const convex = new ConvexHttpClient(convexUrl);
const transportMode = (process.env.MCP_TRANSPORT ?? 'stdio').toLowerCase();

const normalizePath = (value: string): string => {
  if (!value.startsWith('/')) {
    return `/${value}`;
  }
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
};

const getHeaderValue = (value: string | string[] | undefined): string | null => {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return null;
};

const getPlayerIdFromRequest = (url: URL, headers: Record<string, string | string[] | undefined>): string | null => {
  return (
    url.searchParams.get('playerId') ??
    url.searchParams.get('etPlayerId') ??
    getHeaderValue(headers['x-et-player-id']) ??
    getHeaderValue(headers['et-player-id']) ??
    process.env.ET_PLAYER_ID ??
    null
  );
};

if (transportMode === 'stdio') {
  const playerId = process.env.ET_PLAYER_ID ?? null;
  const server = createMcpServer({ client: convex, playerId });
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else if (transportMode === 'sse' || transportMode === 'http' || transportMode === 'streamable-http') {
  const host = process.env.MCP_HTTP_HOST ?? '0.0.0.0';
  const port = Number(process.env.MCP_HTTP_PORT ?? '8787');
  const ssePath = normalizePath(process.env.MCP_HTTP_PATH ?? '/mcp');
  const messagePath = normalizePath(process.env.MCP_HTTP_MESSAGES_PATH ?? `${ssePath}/messages`);
  const transports = new Map<string, { transport: any; server: any }>();

  const httpServer = createHttpServer(async (req, res) => {
    const baseUrl = `http://${req.headers.host ?? 'localhost'}`;
    const url = new URL(req.url ?? '/', baseUrl);

    if (req.method === 'GET' && url.pathname === ssePath) {
      const playerId = getPlayerIdFromRequest(url, req.headers);
      const server = createMcpServer({ client: convex, playerId });
      const transport = new SSEServerTransport(messagePath, res);
      transports.set(transport.sessionId, { transport, server });
      res.on('close', () => {
        transports.delete(transport.sessionId);
        void server.close().catch(() => undefined);
      });
      await server.connect(transport);
      return;
    }

    if (req.method === 'POST' && url.pathname === messagePath) {
      const sessionId = url.searchParams.get('sessionId');
      const entry = sessionId ? transports.get(sessionId) : undefined;
      if (!entry) {
        res.writeHead(400).end('No transport found for sessionId');
        return;
      }
      await entry.transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404).end('Not found');
  });

  httpServer.listen(port, host, () => {
    console.log(`Werewolf MCP SSE listening at http://${host}:${port}${ssePath}`);
  });
} else {
  throw new Error(`Unknown MCP_TRANSPORT value: ${transportMode}`);
}

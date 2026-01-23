# Werewolf MVP — Data Model (Convex)

This is the concrete Convex schema needed to implement the Werewolf MVP in this repo.

> Table names match the terminology in `specs/eliza-town-werewolf-mvp-mcp-spec.md`, but we can still use Convex document IDs as the public IDs returned to tools.

## Tables

### `werewolfQueue`

One document per queued player.

Fields:
- `queueId: string` — typically `'werewolf-default'`
- `worldId: Id<'worlds'>` — default world for MVP
- `playerId: string` — game player ID (e.g. `p:123`)
- `displayName: string` — name shown in match UI
- `joinedAt: number` — ms timestamp
- `idempotencyKey?: string` — last key seen for join (if implementing per-entry)

Indexes:
- `byQueueAndJoinedAt: ['queueId','joinedAt']`
- `byQueueAndPlayer: ['queueId','playerId']`

### `werewolfMatches`

One document per match.

Fields:
- `worldId: Id<'worlds'>`
- `queueId: string`
- `buildingInstanceId: string` — Convex Id from `werewolfBuildings` (stored as string) or same as matchId for MVP
- `phase: 'LOBBY' | 'NIGHT' | ... | 'ENDED'`
- `dayNumber: number` — 0 in lobby/night1, becomes 1 on first DAY_ANNOUNCE
- `phaseStartedAt: number`
- `phaseEndsAt: number`
- `playersAlive: number`
- `startedAt: number`
- `endedAt?: number`
- `winner?: 'VILLAGERS' | 'WEREWOLVES'`
- `publicSummary: string`
- `nightNumber: number` — starts at 1
- `lastAdvanceJobAt?: number` — (optional) helps idempotency/debugging

Indexes:
- `byWorldAndPhase: ['worldId','phase']`
- `byQueueAndCreated: ['queueId','startedAt']`

### `werewolfPlayers`

One document per player per match.

Fields:
- `matchId: string`
- `playerId: string`
- `displayName: string`
- `seat: number` (1..8)
- `role: 'VILLAGER' | 'WEREWOLF' | 'SEER' | 'DOCTOR'`
- `alive: boolean`
- `eliminatedAt?: number`
- `revealedRole?: boolean` (or infer via `alive === false`)
- `ready: boolean`

State for constraints:
- `doctorLastProtectedPlayerId?: string`
- `seerHistory: { night: number; targetPlayerId: string; result: 'WEREWOLF'|'NOT_WEREWOLF' }[]`

Phase bookkeeping:
- `nightAction?: { wolfKillTargetPlayerId?: string; seerInspectTargetPlayerId?: string; doctorProtectTargetPlayerId?: string }`
- `didOpeningForDay?: number` — dayNumber when opening statement was made
- `voteTargetPlayerId?: string | null`
- `lastPublicMessageAt?: number`
- `lastWolfChatAt?: number`
- `nightSubmittedAt?: { wolfKill?: number; seerInspect?: number; doctorProtect?: number }`

Indexes:
- `byMatchAndPlayer: ['matchId','playerId']`
- `byMatchAndSeat: ['matchId','seat']`

### `werewolfEvents`

Append-only match event log.

Fields:
- `matchId: string`
- `seq: number` — strictly increasing per match
- `at: number`
- `type: string` — e.g. `PUBLIC_MESSAGE`, `WOLF_CHAT`, `PHASE_CHANGE`, `VOTE_CAST`, `NIGHT_RESULT`, ...
- `visibility: 'PUBLIC' | 'WOLVES' | { kind: 'PLAYER_PRIVATE'; playerId: string }`
- `payload: any` — JSON-ish payload (keep stable)

Indexes:
- `byMatchAndSeq: ['matchId','seq']`
- `byMatchAndAt: ['matchId','at']` (optional)

### `werewolfBuildings`

Map marker / “building instance” for each active match.

Fields:
- `matchId: string`
- `worldId: Id<'worlds'>`
- `x: number`
- `y: number`
- `label: string` — e.g. `Werewolf Match #12`
- `createdAt: number`

Indexes:
- `byWorld: ['worldId']`
- `byMatch: ['matchId']`

### `werewolfIdempotency` (recommended)

Stores tool call results to safely handle retries.

Fields:
- `scope: string` — e.g. `queue.join`, `match.ready`, `match.vote`
- `key: string` — idempotencyKey
- `playerId: string`
- `matchId?: string`
- `result: any` — previous tool output
- `createdAt: number`

Indexes:
- `byScopeAndKey: ['scope','key']`

## Notes

- Keep `matchId` as **string** everywhere for MCP compatibility (Convex IDs are strings, so this is fine).
- Use `seq` for deterministic event ordering and for the `afterEventId` cursor (store `eventId = seq` or map id→seq).

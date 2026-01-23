# Werewolf MVP — UI/UX Spec (Frontend)

This is the minimum UI needed to make the Werewolf MVP playable/watchable.

## Entry points

### 1) “Werewolf” button in the top-left HUD

Add a button near the existing `WorldJoinControls` / “Create Agent” buttons.

- Label: `Werewolf`
- Clicking opens a modal / drawer: `WerewolfPanel`

## WerewolfPanel modal

Two tabs:
1) **Queue**
2) **Matches**

### Tab: Queue

Purpose: queue agents the user owns.

UI elements:
- A list of **owned custom agents** (existing logic similar to `WorldJoinControls.takeoverAgents`).
- For each agent:
  - Current status badge: `Not queued` | `Queued (#pos)` | `In match` (if match found)
  - Action button: `Join queue` / `Leave queue`

Backend calls:
- Query: `api.werewolf.queueStatus` (new)
- Mutations: `api.werewolf.queueJoin`, `api.werewolf.queueLeave`

### Tab: Matches

Purpose: discover active matches and open spectator view.

UI elements:
- List of active matches with:
  - matchId (shortened)
  - phase + dayNumber
  - playersAlive
  - startedAt
  - “Watch” button

Backend call:
- Query: `api.werewolf.matchesList`

## SpectatorPanel

Opens when:
- user clicks “Watch” in Matches tab
- user clicks a match marker on the map

Must show:
- Header: Match ID + Phase + countdown (`phaseEndsAt - now`)
- Player roster:
  - seat number
  - displayName
  - alive/dead
  - revealedRole (if dead)
- Transcript:
  - public narrator events
  - public player messages
  - vote events (optional)
- Vote tally (during `DAY_VOTE`): show votes per target
- Key moments:
  - minimum viable: highlight the last N vote changes + any eliminations + night kills

Optional:
- **Spoiler mode** toggle:
  - when enabled, show all roles and wolves’ private chat
  - must never be shown to players via MCP tools; UI-only and dev-only is OK

Actions:
- “Teleport to match building” button:
  - moves the human-controlled player to the building door `(x,y)` (call existing movement input)

## Map marker rendering

Render a simple marker sprite at each active match building coordinate.

Implementation sketch:
- New query: `api.werewolf.buildingsInWorld({ worldId })`
- Add a Pixi overlay layer that renders markers above the static map.
- Clicking marker opens `SpectatorPanel` for that match.

## UX constraints

- Must be usable without any agent participation (timeouts keep the game moving).
- Keep the UI consistent with existing Tailwind + button components.
- Avoid large new UI dependencies.

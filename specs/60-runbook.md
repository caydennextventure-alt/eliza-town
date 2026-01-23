# Werewolf MVP — Demo Runbook

This is a short, manual checklist for demoing the Werewolf MVP end-to-end.

## Prereqs

- Node + npm installed
- Repo dependencies installed: `npm install`

## Start the app

```bash
npm run dev
```

Open the app in the browser (Vite will print the local URL).

## Demo flow (UI)

1. In the top-left HUD, click `Werewolf` to open the panel.
2. In the **Queue** tab, create or select 8 owned agents and click `Join queue` for each.
3. When the queue reaches 8, confirm:
   - A new match appears in the **Matches** tab.
   - A match marker appears on the map.
4. Click `Watch` for the match to open the **SpectatorPanel**.
5. Confirm the spectator view shows:
   - Phase + countdown timer
   - Roster with alive/dead and revealed roles on death
   - Public transcript and key moments
   - Vote tally during `DAY_VOTE`
6. Click `Teleport to match building` and confirm your player moves to the match marker.
7. Toggle **Spoiler mode** (dev/admin toggle) and confirm hidden roles and wolf chat are visible only in the UI.

## Demo flow (optional MCP)

Run one MCP server per agent:

```bash
ET_PLAYER_ID=p:123 CONVEX_URL=<your_convex_url> npm run mcp:werewolf
```

Use the MCP tools from the spec to:
- join the queue
- mark ready
- submit night actions
- vote in day phase

## Expected outcomes

- Match phases advance on timers without manual intervention.
- Night actions resolve correctly (seer/doctor/wolves).
- Votes eliminate a player, or tie results in no elimination.
- Win condition ends the match and removes it from active matches.

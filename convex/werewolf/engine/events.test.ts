import {
  createNightResultEvent,
  createPhaseChangedEvent,
  createPlayerEliminatedEvent,
} from './events';

describe('werewolf engine events', () => {
  it('creates a phase change event payload', () => {
    const event = createPhaseChangedEvent({
      at: 1_700_000_000_000,
      from: 'LOBBY',
      to: 'NIGHT',
      dayNumber: 0,
      phaseEndsAt: 1_700_000_030_000,
    });

    expect(event).toEqual({
      type: 'PHASE_CHANGED',
      visibility: 'PUBLIC',
      at: 1_700_000_000_000,
      payload: {
        from: 'LOBBY',
        to: 'NIGHT',
        dayNumber: 0,
        phaseEndsAt: 1_700_000_030_000,
      },
    });
  });

  it('creates a player eliminated event payload', () => {
    const event = createPlayerEliminatedEvent({
      at: 1_700_000_100_000,
      playerId: 'p:3',
      roleRevealed: 'SEER',
    });

    expect(event).toEqual({
      type: 'PLAYER_ELIMINATED',
      visibility: 'PUBLIC',
      at: 1_700_000_100_000,
      payload: {
        playerId: 'p:3',
        roleRevealed: 'SEER',
      },
    });
  });

  it('creates a night result event payload', () => {
    const prevented = createNightResultEvent({
      at: 1_700_000_200_000,
      wolfKillTargetPlayerId: 'p:5',
      eliminatedPlayerId: undefined,
    });

    expect(prevented).toEqual({
      type: 'NIGHT_RESULT',
      visibility: 'PUBLIC',
      at: 1_700_000_200_000,
      payload: {
        killedPlayerId: null,
        savedByDoctor: true,
      },
    });

    const killed = createNightResultEvent({
      at: 1_700_000_300_000,
      wolfKillTargetPlayerId: 'p:5',
      eliminatedPlayerId: 'p:5',
    });

    expect(killed).toEqual({
      type: 'NIGHT_RESULT',
      visibility: 'PUBLIC',
      at: 1_700_000_300_000,
      payload: {
        killedPlayerId: 'p:5',
        savedByDoctor: false,
      },
    });
  });
});

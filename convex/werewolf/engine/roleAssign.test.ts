import { assignRoles } from './roleAssign';

const players = ['p:1', 'p:2', 'p:3', 'p:4', 'p:5', 'p:6', 'p:7', 'p:8'];

describe('assignRoles', () => {
  it('assigns the required role distribution', () => {
    const assignments = assignRoles(players);

    expect(assignments).toHaveLength(8);
    expect(assignments.map((assignment) => assignment.playerId).sort()).toEqual([...players].sort());

    const roleCounts = assignments.reduce<Record<string, number>>((counts, assignment) => {
      counts[assignment.role] = (counts[assignment.role] ?? 0) + 1;
      return counts;
    }, {});

    expect(roleCounts).toEqual({
      WEREWOLF: 2,
      SEER: 1,
      DOCTOR: 1,
      VILLAGER: 4,
    });
  });

  it('is deterministic for the same input ordering', () => {
    const first = assignRoles(players);
    const second = assignRoles(players);

    expect(second).toEqual(first);
  });

  it('rejects non-8 player lists', () => {
    expect(() => assignRoles(players.slice(0, 7))).toThrow();
  });
});

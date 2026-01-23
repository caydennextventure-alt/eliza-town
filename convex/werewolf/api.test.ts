import {
  matchEventsGet,
  matchGetState,
  matchReady,
  matchSayPublic,
  matchDoctorProtect,
  matchSeerInspect,
  matchVote,
  matchWolfKill,
  matchWolfChat,
  matchesList,
  queueJoin,
  queueLeave,
  queueStatus,
} from '../werewolf';
import { queueJoin as queueJoinImpl, queueLeave as queueLeaveImpl, queueStatus as queueStatusImpl } from './queue';
import {
  matchEventsGet as matchEventsGetFn,
  matchGetState as matchGetStateFn,
  matchesList as matchesListFn,
} from './queries';
import {
  matchReady as matchReadyFn,
  matchSayPublic as matchSayPublicFn,
  matchDoctorProtect as matchDoctorProtectFn,
  matchSeerInspect as matchSeerInspectFn,
  matchVote as matchVoteFn,
  matchWolfKill as matchWolfKillFn,
  matchWolfChat as matchWolfChatFn,
} from './match';

describe('werewolf api exports', () => {
  it('re-exports queue and match functions at the top-level module', () => {
    expect(queueJoin).toBe(queueJoinImpl);
    expect(queueLeave).toBe(queueLeaveImpl);
    expect(queueStatus).toBe(queueStatusImpl);
    expect(matchesList).toBe(matchesListFn);
    expect(matchGetState).toBe(matchGetStateFn);
    expect(matchEventsGet).toBe(matchEventsGetFn);
    expect(matchReady).toBe(matchReadyFn);
    expect(matchSayPublic).toBe(matchSayPublicFn);
    expect(matchDoctorProtect).toBe(matchDoctorProtectFn);
    expect(matchSeerInspect).toBe(matchSeerInspectFn);
    expect(matchVote).toBe(matchVoteFn);
    expect(matchWolfKill).toBe(matchWolfKillFn);
    expect(matchWolfChat).toBe(matchWolfChatFn);
  });
});

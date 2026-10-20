import assert from 'assert';
import {
  NFL_PRO_TEAMS_BYE_WEEKS_2024,
  NFL_ABBREV_BYE_WEEKS_2024,
  NFL_PRO_TEAMS_BYE_WEEKS_2025,
  NFL_ABBREV_BYE_WEEKS_2025,
  getNflByeWeek,
  sanitizeLeagueByeWeeks,
  normalizeEspnData,
  createMockLeague,
  NFL_PRO_TEAMS,
} from '../src/lib/espn';
import {
  createInitialServerState,
  toClientLeagueView,
  saveServerLeagueSnapshot,
  getServerLeagueState,
} from '../src/lib/serverLeagueStore';
import { League, Player } from '../src/types/fantasy';

export async function runByeWeekTests() {
  console.log('========================================================');
  console.log('--- Starting NFL Player Bye Weeks Verification Suite ---');
  console.log('========================================================\n');

  // Test 1: Verify all 32 NFL Teams have valid bye weeks in 2024 (Weeks 4-14)
  console.log('[Test 1] Verifying all 32 NFL Pro Teams have valid 2024 bye weeks...');
  const proTeamIds = Object.keys(NFL_PRO_TEAMS).map(Number);
  assert.strictEqual(proTeamIds.length, 32, 'Must have exactly 32 official NFL pro teams');

  for (const id of proTeamIds) {
    const abbrev = NFL_PRO_TEAMS[id];
    const byeById = NFL_PRO_TEAMS_BYE_WEEKS_2024[id];
    const byeByAbbrev = NFL_ABBREV_BYE_WEEKS_2024[abbrev];

    assert.ok(
      typeof byeById === 'number' && byeById >= 4 && byeById <= 14,
      `Team ID ${id} (${abbrev}) must have a valid 2024 bye week between 4 and 14 (got ${byeById})`
    );
    assert.strictEqual(
      byeById,
      byeByAbbrev,
      `Bye week by ID (${byeById}) must match bye week by Abbreviation (${byeByAbbrev}) for ${abbrev}`
    );
  }
  console.log('✓ Test 1 Passed: All 32 NFL pro teams have consistent, valid 2024 bye weeks.');

  // Test 2: Specific high-profile player team bye week checks
  console.log('\n[Test 2] Testing specific team bye weeks (Ladd McConkey LAC, Gainwell PHI/TB, etc.)...');
  // Ladd McConkey (LAC: Pro Team 24) -> Week 5 (Previously buggy: Week 10)
  assert.strictEqual(getNflByeWeek(24, 'LAC', '2024'), 5, 'LAC (Chargers) 2024 bye must be Week 5');
  assert.notStrictEqual(getNflByeWeek(24, 'LAC', '2024'), 10, 'LAC must NOT have buggy Week 10');

  // Kenny Gainwell (PHI: Pro Team 21 / TB: Pro Team 27)
  assert.strictEqual(getNflByeWeek(21, 'PHI', '2024'), 5, 'PHI (Eagles) 2024 bye must be Week 5');
  assert.strictEqual(getNflByeWeek(27, 'TB', '2024'), 11, 'TB (Buccaneers) 2024 bye must be Week 11');

  // Rico Dowdle (DAL: Pro Team 6 / PIT: Pro Team 23)
  assert.strictEqual(getNflByeWeek(6, 'DAL', '2024'), 7, 'DAL (Cowboys) 2024 bye must be Week 7');
  assert.strictEqual(getNflByeWeek(23, 'PIT', '2024'), 9, 'PIT (Steelers) 2024 bye must be Week 9');

  // Baltimore Ravens (BAL: Pro Team 33) -> Week 14
  assert.strictEqual(getNflByeWeek(33, 'BAL', '2024'), 14, 'BAL (Ravens) 2024 bye must be Week 14');

  // Kansas City Chiefs (KC: Pro Team 12) -> Week 6
  assert.strictEqual(getNflByeWeek(12, 'KC', '2024'), 6, 'KC (Chiefs) 2024 bye must be Week 6');

  // Detroit Lions (DET: Pro Team 8) -> Week 5
  assert.strictEqual(getNflByeWeek(8, 'DET', '2024'), 5, 'DET (Lions) 2024 bye must be Week 5');
  console.log('✓ Test 2 Passed: Specific team bye weeks match official NFL 2024 schedule.');

  // Test 3: Free agents and invalid teams return 0
  console.log('\n[Test 3] Testing Free Agent and invalid team fallback...');
  assert.strictEqual(getNflByeWeek(0, 'FA', '2024'), 0, 'Free Agent must have byeWeek 0');
  assert.strictEqual(getNflByeWeek(undefined, undefined, '2024'), 0, 'Undefined team must return 0');
  console.log('✓ Test 3 Passed: Free agents correctly return 0 without throwing.');

  // Test 4: 2025 season mappings
  console.log('\n[Test 4] Testing 2025 season bye week resolution...');
  assert.strictEqual(getNflByeWeek(24, 'LAC', '2025'), 12, 'LAC 2025 bye must be Week 12');
  assert.strictEqual(getNflByeWeek(1, 'ATL', '2025'), 5, 'ATL 2025 bye must be Week 5');
  assert.strictEqual(getNflByeWeek(2, 'BUF', '2025'), 7, 'BUF 2025 bye must be Week 7');
  console.log('✓ Test 4 Passed: 2025 season resolution verified.');

  // Test 5: normalizeEspnData resolves accurate bye weeks from raw ESPN payload
  console.log('\n[Test 5] Testing normalizeEspnData bye week resolution from raw ESPN roster...');
  const fakeRawEspnData = {
    settings: { isPublic: true },
    members: [{ id: 'm1', displayName: 'Manager 1' }],
    teams: [
      {
        id: 1,
        name: 'Thunder Bolts',
        roster: {
          entries: [
            {
              playerId: 101,
              playerPoolEntry: {
                player: {
                  id: 101,
                  fullName: 'Ladd McConkey',
                  defaultPositionId: 3, // WR
                  proTeamId: 24, // LAC
                  jersey: '15',
                },
              },
            },
            {
              playerId: 102,
              playerPoolEntry: {
                player: {
                  id: 102,
                  fullName: 'Rico Dowdle',
                  defaultPositionId: 2, // RB
                  proTeamId: 6, // DAL
                  jersey: '23',
                },
              },
            },
            {
              playerId: 103,
              playerPoolEntry: {
                player: {
                  id: 103,
                  fullName: 'Kenneth Gainwell',
                  defaultPositionId: 2, // RB
                  proTeamId: 21, // PHI
                  jersey: '14',
                },
              },
            },
            {
              playerId: 104,
              playerPoolEntry: {
                player: {
                  id: 104,
                  fullName: 'Patrick Mahomes',
                  defaultPositionId: 1, // QB
                  proTeamId: 12, // KC
                  jersey: '15',
                },
              },
            },
          ],
        },
      },
    ],
  };

  const normalized = normalizeEspnData(fakeRawEspnData, '99887766', '2024');
  const normalizedRoster = normalized.teams[0].roster;

  const ladd = normalizedRoster.find((p) => p.fullName === 'Ladd McConkey');
  assert.ok(ladd, 'Ladd McConkey must exist in normalized roster');
  assert.strictEqual(ladd.byeWeek, 5, 'Ladd McConkey must have LAC byeWeek 5 (not buggy 10)');

  const rico = normalizedRoster.find((p) => p.fullName === 'Rico Dowdle');
  assert.ok(rico, 'Rico Dowdle must exist in normalized roster');
  assert.strictEqual(rico.byeWeek, 7, 'Rico Dowdle must have DAL byeWeek 7 (not buggy 9)');

  const kenny = normalizedRoster.find((p) => p.fullName === 'Kenneth Gainwell');
  assert.ok(kenny, 'Kenneth Gainwell must exist in normalized roster');
  assert.strictEqual(kenny.byeWeek, 5, 'Kenneth Gainwell must have PHI byeWeek 5 (not buggy 9)');

  const mahomes = normalizedRoster.find((p) => p.fullName === 'Patrick Mahomes');
  assert.ok(mahomes, 'Patrick Mahomes must exist in normalized roster');
  assert.strictEqual(mahomes.byeWeek, 6, 'Patrick Mahomes must have KC byeWeek 6');
  console.log('✓ Test 5 Passed: normalizeEspnData correctly sets real NFL bye weeks without placeholder corruption.');

  // Test 6: sanitizeLeagueByeWeeks repairs legacy leagues with corrupt bye weeks
  console.log('\n[Test 6] Testing sanitizeLeagueByeWeeks repairing corrupt league snapshots...');
  const corruptLeague: League = {
    id: 'league_corrupt',
    espnLeagueId: '55443322',
    name: 'Corrupt Bye Weeks League',
    isPrivate: false,
    lastSyncedAt: new Date().toISOString(),
    teams: [
      {
        id: 't1',
        espnTeamId: '1',
        name: 'Team 1',
        ownerName: 'Owner 1',
        roster: [
          {
            id: 'p1',
            espnPlayerId: '1',
            fullName: 'Ladd McConkey',
            position: 'WR',
            nflTeam: 'LAC',
            headshotUrl: '',
            projectedPoints: 10,
            seasonAvgPoints: 10,
            opponentDifficulty: 'normal',
            nextOpponent: '',
            byeWeek: 10, // Corrupt/fake bye week
            injuryStatus: 'ACTIVE',
          },
          {
            id: 'p2',
            espnPlayerId: '2',
            fullName: 'Derrick Henry',
            position: 'RB',
            nflTeam: 'BAL',
            headshotUrl: '',
            projectedPoints: 15,
            seasonAvgPoints: 15,
            opponentDifficulty: 'normal',
            nextOpponent: '',
            byeWeek: 9, // Corrupt/fake bye week (7 + 2 = 9)
            injuryStatus: 'ACTIVE',
          },
        ],
      },
    ],
  };

  const repaired = sanitizeLeagueByeWeeks(corruptLeague);
  assert.strictEqual(
    repaired.teams[0].roster[0].byeWeek,
    5,
    'Corrupt LAC player byeWeek must be repaired from 10 to 5'
  );
  assert.strictEqual(
    repaired.teams[0].roster[1].byeWeek,
    14,
    'Corrupt BAL player byeWeek must be repaired from 9 to 14'
  );
  console.log('✓ Test 6 Passed: sanitizeLeagueByeWeeks flawlessly repairs corrupted player bye weeks.');

  // Test 7: toClientLeagueView ensures client always receives sanitized bye weeks
  console.log('\n[Test 7] Testing toClientLeagueView sanitization...');
  const serverState = createInitialServerState(corruptLeague, '55443322');
  const clientView = toClientLeagueView(serverState, 't1');
  assert.strictEqual(
    clientView.league.teams[0].roster[0].byeWeek,
    5,
    'Client view must receive repaired LAC byeWeek 5'
  );
  assert.strictEqual(
    clientView.league.teams[0].roster[1].byeWeek,
    14,
    'Client view must receive repaired BAL byeWeek 14'
  );
  console.log('✓ Test 7 Passed: toClientLeagueView guarantees accurate bye weeks on the wire.');

  // Test 8: All mock players in createMockLeague have accurate bye weeks
  console.log('\n[Test 8] Testing all mock league players in createMockLeague()...');
  const mockLeague = createMockLeague();
  for (const team of mockLeague.teams) {
    for (const player of team.roster) {
      const accurateBye = getNflByeWeek(undefined, player.nflTeam, mockLeague.seasonId);
      assert.strictEqual(
        player.byeWeek,
        accurateBye,
        `Mock player ${player.fullName} (${player.nflTeam}) byeWeek must be accurate (expected ${accurateBye}, got ${player.byeWeek})`
      );
    }
  }
  console.log('✓ Test 8 Passed: All 13 mock league players have 100% accurate bye weeks.');

  console.log('\n=============================================');
  console.log('ALL NFL BYE WEEK VERIFICATION TESTS PASSED! 🎉');
  console.log('=============================================');
}

// Direct execution support
if (require.main === module) {
  runByeWeekTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}

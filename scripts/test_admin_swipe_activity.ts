import assert from 'assert';
import path from 'path';

process.env.DATA_DIR = path.join(__dirname, '..', '.data_test_admin_swipes');

import {
  createUser,
  loginUser,
  clearAllServerUsers,
  ensureSuperUserAccount,
} from '@/lib/serverUserStore';

import {
  getServerLeagueState,
  saveServerLeagueSnapshot,
  getLeagueSwipeActivity,
  clearAllServerLeagues,
  recordServerSwipe,
} from '@/lib/serverLeagueStore';

import { GET, POST } from '@/app/api/admin/route';

export const testPromise = (async function runAdminSwipeActivityTests() {
  console.log('========================================================');
  console.log('--- Starting Admin Swipe Activity Test Suite ---');
  console.log('========================================================\n');

  try {
    clearAllServerUsers();
    clearAllServerLeagues();

    const superu = ensureSuperUserAccount();
    const superuLogin = loginUser('superu', 'thanos');
    assert(superuLogin?.token, 'Superuser login must return token');
    const superToken = superuLogin.token;

    const normalUser = createUser('fantasyfan', 'password123');
    const normalLogin = loginUser('fantasyfan', 'password123');
    assert(normalLogin?.token, 'Normal user login must return token');
    const normalToken = normalLogin.token;

    // [Test 1] Null safety on invalid league ID
    console.log('[Test 1] Testing getLeagueSwipeActivity on non-existent league...');
    const nonExistent = getLeagueSwipeActivity('non_existent_9999');
    assert.strictEqual(nonExistent, null, 'Non-existent league should return null');
    console.log('✓ Test 1 Passed: Returns null for non-existent league.');

    // [Test 2] Demo sandbox league swipe activity
    console.log('[Test 2] Testing getLeagueSwipeActivity on Demo Sandbox League (12345678)...');
    const demoActivity = getLeagueSwipeActivity('12345678');
    assert(demoActivity, 'Demo league should exist and return activity');
    assert.strictEqual(demoActivity.espnLeagueId, '12345678');
    assert(demoActivity.totalSwipesCount > 0, 'Demo league should have seed swipes');
    assert(demoActivity.swipes.length === demoActivity.totalSwipesCount, 'Swipes array matches count');
    assert(demoActivity.teams.length === 3, 'Demo league has 3 teams');

    // Check enriched details on seed swipes
    for (const swipe of demoActivity.swipes) {
      assert(swipe.id, 'Swipe must have ID');
      assert(swipe.teamId, 'Swipe must have initiating teamId');
      assert(swipe.teamName, 'Swipe must have initiating teamName');
      assert(swipe.tradeType, 'Swipe must have tradeType');
      assert(Array.isArray(swipe.offeredPlayers), 'Swipe offeredPlayers must be array');
      assert(Array.isArray(swipe.targetPlayers), 'Swipe targetPlayers must be array');
      assert(swipe.offeredPlayers.length > 0, 'Swipe offeredPlayers must not be empty');
      assert(swipe.targetPlayers.length > 0, 'Swipe targetPlayers must not be empty');
      assert(swipe.offeredPlayers[0].fullName, 'Player object must have fullName');
      assert(swipe.offeredPlayers[0].position, 'Player object must have position');
      assert(swipe.offeredPlayers[0].nflTeam, 'Player object must have nflTeam');
    }
    console.log(`✓ Test 2 Passed: Demo league has ${demoActivity.totalSwipesCount} enriched swipes with full player data.`);

    // [Test 3] Custom league with Wants, Passes, and Reciprocal Matches
    console.log('[Test 3] Creating custom league with multi-team swipes & match...');
    const customLeagueId = 'custom_test_league_99';
    const mockLeagueState = {
      league: {
        id: customLeagueId,
        espnLeagueId: customLeagueId,
        name: 'SuperAdmin Test Championship',
        season: 2024,
        currentWeek: 8,
        totalWeeks: 14,
        totalRosters: 2,
        teams: [
          {
            id: 'team_alpha',
            espnTeamId: '1',
            name: 'Alpha Wolves',
            ownerName: 'Alice',
            logoUrl: 'https://example.com/alpha.png',
            isClaimed: true,
            claimedBy: 'alice_superstar',
            roster: [
              {
                id: 'p_101',
                espnPlayerId: '101',
                fullName: 'Patrick Mahomes',
                position: 'QB',
                nflTeam: 'KC',
                headshotUrl: 'https://example.com/mahomes.png',
                projectedPoints: 21.5,
                seasonAvgPoints: 20.2,
                opponentDifficulty: 'normal',
                nextOpponent: 'LV',
                byeWeek: 6,
                injuryStatus: 'ACTIVE',
              },
              {
                id: 'p_102',
                espnPlayerId: '102',
                fullName: 'Travis Kelce',
                position: 'TE',
                nflTeam: 'KC',
                headshotUrl: 'https://example.com/kelce.png',
                projectedPoints: 14.2,
                seasonAvgPoints: 13.8,
                opponentDifficulty: 'easy',
                nextOpponent: 'LV',
                byeWeek: 6,
                injuryStatus: 'ACTIVE',
              },
            ],
          },
          {
            id: 'team_beta',
            espnTeamId: '2',
            name: 'Beta Bears',
            ownerName: 'Bob',
            logoUrl: 'https://example.com/beta.png',
            isClaimed: true,
            claimedBy: 'bob_the_builder',
            roster: [
              {
                id: 'p_201',
                espnPlayerId: '201',
                fullName: 'CeeDee Lamb',
                position: 'WR',
                nflTeam: 'DAL',
                headshotUrl: 'https://example.com/lamb.png',
                projectedPoints: 19.8,
                seasonAvgPoints: 18.5,
                opponentDifficulty: 'normal',
                nextOpponent: 'SF',
                byeWeek: 7,
                injuryStatus: 'ACTIVE',
              },
              {
                id: 'p_202',
                espnPlayerId: '202',
                fullName: 'Derrick Henry',
                position: 'RB',
                nflTeam: 'BAL',
                headshotUrl: 'https://example.com/henry.png',
                projectedPoints: 18.1,
                seasonAvgPoints: 17.9,
                opponentDifficulty: 'hard',
                nextOpponent: 'CLE',
                byeWeek: 14,
                injuryStatus: 'ACTIVE',
              },
            ],
          },
        ],
      },
      swipes: [],
      matches: [],
      deletedMatches: [],
      lastUpdated: new Date().toISOString(),
    };

    saveServerLeagueSnapshot(mockLeagueState.league as any, customLeagueId);

    // Swipe 1: Team Alpha WANT Lamb for Mahomes (1-for-1)
    recordServerSwipe(customLeagueId, {
      teamId: 'team_alpha',
      targetTeamId: 'team_beta',
      tradeType: '1-for-1',
      offeredPlayerIds: ['p_101'],
      targetPlayerIds: ['p_201'],
      isInterested: true,
    });

    // Swipe 2: Team Alpha PASS Henry for Mahomes
    recordServerSwipe(customLeagueId, {
      teamId: 'team_alpha',
      targetTeamId: 'team_beta',
      tradeType: '1-for-1',
      offeredPlayerIds: ['p_101'],
      targetPlayerIds: ['p_202'],
      isInterested: false,
    });

    // Check activity before Team Beta reciprocates
    let activity = getLeagueSwipeActivity(customLeagueId);
    assert(activity);
    assert.strictEqual(activity.totalSwipesCount, 2);
    assert.strictEqual(activity.wantsCount, 1);
    assert.strictEqual(activity.passesCount, 1);
    assert.strictEqual(activity.matchesCount, 0);
    assert.strictEqual(activity.wantRate, 50);

    const wantSwipe = activity.swipes.find((s) => s.isInterested);
    assert(wantSwipe);
    assert.strictEqual(wantSwipe.teamName, 'Alpha Wolves');
    assert.strictEqual(wantSwipe.claimedBy, 'alice_superstar');
    assert.strictEqual(wantSwipe.targetTeamName, 'Beta Bears');
    assert.strictEqual(wantSwipe.targetClaimedBy, 'bob_the_builder');
    assert.strictEqual(wantSwipe.isMatched, false);
    assert.strictEqual(wantSwipe.hasTargetResponded, false);
    assert.strictEqual(wantSwipe.targetResponse, 'none');

    // Swipe 3: Team Beta reciprocates WANT Mahomes for Lamb (creates a MATCH!)
    const betaReciprocal = recordServerSwipe(customLeagueId, {
      teamId: 'team_beta',
      targetTeamId: 'team_alpha',
      tradeType: '1-for-1',
      offeredPlayerIds: ['p_201'],
      targetPlayerIds: ['p_101'],
      isInterested: true,
    });
    assert(betaReciprocal.matchFound, 'Reciprocal swipe should create mutual match');

    // Verify updated swipe activity
    activity = getLeagueSwipeActivity(customLeagueId);
    assert(activity);
    assert.strictEqual(activity.totalSwipesCount, 3);
    assert.strictEqual(activity.wantsCount, 2);
    assert.strictEqual(activity.passesCount, 1);
    assert.strictEqual(activity.matchesCount, 1);
    assert.strictEqual(activity.wantRate, 67);

    // Both swipes should now be marked isMatched: true
    const alphaMatched = activity.swipes.find(
      (s) => s.teamId === 'team_alpha' && s.offeredPlayerIds.includes('p_101') && s.isInterested
    );
    assert(alphaMatched?.isMatched, 'Alpha want swipe should now be marked as matched');
    assert.strictEqual(alphaMatched?.hasTargetResponded, true);
    assert.strictEqual(alphaMatched?.targetResponse, 'want');

    const betaMatched = activity.swipes.find((s) => s.teamId === 'team_beta');
    assert(betaMatched?.isMatched, 'Beta swipe should now be marked as matched');
    assert.strictEqual(betaMatched?.hasTargetResponded, true);
    assert.strictEqual(betaMatched?.targetResponse, 'want');

    console.log('✓ Test 3 Passed: Multi-team swipes, claim attribution, want rate, and mutual match reciprocity verified.');

    // [Test 4] API Security & GET /api/admin?leagueId=...
    console.log('[Test 4] Testing GET /api/admin endpoint security & response shape...');
    // Unauthenticated GET
    const unauthReq = new Request(`http://localhost:6969/api/admin?leagueId=${customLeagueId}`);
    const unauthRes = await GET(unauthReq as any);
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');

    // Non-superuser GET
    const normalReq = new Request(`http://localhost:6969/api/admin?leagueId=${customLeagueId}`, {
      headers: { Authorization: `Bearer ${normalToken}` },
    });
    const normalRes = await GET(normalReq as any);
    assert.strictEqual(normalRes.status, 403, 'Normal user must be forbidden 403');

    // Superuser GET
    const superReq = new Request(`http://localhost:6969/api/admin?leagueId=${customLeagueId}`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const superRes = await GET(superReq as any);
    assert.strictEqual(superRes.status, 200, 'Superuser request must return 200 OK');
    const superData = await superRes.json();
    assert.strictEqual(superData.success, true);
    assert.strictEqual(superData.espnLeagueId, customLeagueId);
    assert.strictEqual(superData.totalSwipesCount, 3);
    assert.strictEqual(superData.wantsCount, 2);
    assert.strictEqual(superData.passesCount, 1);
    assert.strictEqual(superData.matchesCount, 1);
    assert.strictEqual(superData.swipes.length, 3);
    console.log('✓ Test 4 Passed: GET /api/admin?leagueId=... strictly enforced and returns full payload.');

    // [Test 5] POST /api/admin action: "get_league_swipes"
    console.log('[Test 5] Testing POST /api/admin with action: "get_league_swipes"...');
    const postReq = new Request('http://localhost:6969/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superToken}`,
      },
      body: JSON.stringify({
        action: 'get_league_swipes',
        leagueId: customLeagueId,
      }),
    });
    const postRes = await POST(postReq as any);
    assert.strictEqual(postRes.status, 200, 'POST action get_league_swipes should succeed with 200');
    const postData = await postRes.json();
    assert.strictEqual(postData.success, true);
    assert.strictEqual(postData.espnLeagueId, customLeagueId);
    assert.strictEqual(postData.totalSwipesCount, 3);
    console.log('✓ Test 5 Passed: POST /api/admin action get_league_swipes works identically.');

    console.log('\n========================================================');
    console.log('ALL ADMIN SWIPE ACTIVITY TESTS PASSED! 🎉');
    console.log('========================================================\n');
  } catch (err) {
    console.error('Test failed with error:', err);
    throw err;
  }
})();

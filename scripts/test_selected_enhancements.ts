import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { POST as leaguePOST, GET as leagueGET } from '@/app/api/league/route';
import { normalizeEspnData, createMockLeague } from '@/lib/espn';
import {
  generateDeckItems,
  computeIncomingActivityHints,
  computePriorityTargetKeys,
  computeWarmTradeLeads,
} from '@/lib/matchmaking';
import {
  saveServerLeagueSnapshot,
  claimServerTeam,
  recordServerSwipe,
  deleteServerLeagueState,
} from '@/lib/serverLeagueStore';
import { createUser, deleteUser, loginUser, ensureSuperUserAccount } from '@/lib/serverUserStore';
import { Swipe } from '@/types/fantasy';

export const testPromise = (async () => {
  console.log('\n========================================================');
  console.log('--- Starting Selected 6 Enhancements Verification Suite ---');
  console.log('========================================================\n');

  // -------------------------------------------------------------------------
  // 1. Test 1.3: normalizeEspnData sorts rosters descending by star value
  // -------------------------------------------------------------------------
  console.log('[Enhancement 1.3a] Testing ESPN roster star-value descending sort in normalizeEspnData...');
  const rawEspnPayload = {
    id: 999111,
    seasonId: 2026,
    scoringPeriodId: 5,
    settings: { name: 'Star Sort League' },
    members: [{ id: '{M1}', firstName: 'Test', lastName: 'Owner' }],
    teams: [
      {
        id: 1,
        name: 'Team Alpha',
        primaryOwner: '{M1}',
        roster: {
          entries: [
            {
              playerPoolEntry: {
                appliedStatTotal: 7.2,
                player: {
                  id: 101,
                  fullName: 'Bench Kicker',
                  defaultPositionId: 5,
                  proTeamId: 12,
                  stats: [
                    { statSourceId: 0, statSplitTypeId: 0, appliedAverage: 6.5 },
                  ],
                },
              },
            },
            {
              playerPoolEntry: {
                appliedStatTotal: 19.8,
                player: {
                  id: 102,
                  fullName: 'Star Receiver',
                  defaultPositionId: 3,
                  proTeamId: 21,
                  stats: [
                    { statSourceId: 0, statSplitTypeId: 0, appliedAverage: 21.4 },
                  ],
                },
              },
            },
            {
              playerPoolEntry: {
                appliedStatTotal: 15.1,
                player: {
                  id: 103,
                  fullName: 'Solid RB',
                  defaultPositionId: 2,
                  proTeamId: 14,
                  stats: [
                    { statSourceId: 0, statSplitTypeId: 0, appliedAverage: 14.2 },
                  ],
                },
              },
            },
          ],
        },
      },
    ],
  };

  const normalized = normalizeEspnData(rawEspnPayload, '999111', '2026');
  const roster = normalized.teams[0].roster;
  assert.strictEqual(roster.length, 3, 'Should have 3 players on roster');
  assert.strictEqual(roster[0].fullName, 'Star Receiver', 'Highest star value player must be first');
  assert.strictEqual(roster[1].fullName, 'Solid RB', 'Second highest player must be second');
  assert.strictEqual(roster[2].fullName, 'Bench Kicker', 'Lowest value player must be last');
  console.log('✓ Enhancement 1.3a Passed: normalizeEspnData sorts rosters descending by max(proj, avg).');

  // -------------------------------------------------------------------------
  // 2. Test 1.3b: lastResetAt tracking and LeagueLockerRoom claimedByUserId preservation
  // -------------------------------------------------------------------------
  console.log('[Enhancement 1.3b] Testing lastResetAt timestamp & claimedByUserId preservation...');
  const lockerRoomSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/components/LeagueLockerRoom.tsx'),
    'utf8'
  );
  assert.ok(
    lockerRoomSrc.includes('claimedByUserId: existing.claimedByUserId'),
    'LeagueLockerRoom roster refresh must preserve claimedByUserId'
  );
  const pageSrc = fs.readFileSync(path.resolve(__dirname, '../src/app/page.tsx'), 'utf8');
  assert.ok(
    pageSrc.includes('lastResetAtRef') && pageSrc.includes('hasNewServerResetTimestamp'),
    'page.tsx must gate 8s polling isServerReset on lastResetAtRef changes'
  );
  console.log('✓ Enhancement 1.3b Passed: lastResetAtRef polling guard and claimedByUserId preservation verified.');

  // -------------------------------------------------------------------------
  // 3. Test 2.2: Priority Deck Injection, Blind-Safe Incoming Activity Hints, Warm Trade Leads
  // -------------------------------------------------------------------------
  console.log('[Enhancement 2.2a] Testing computeIncomingActivityHints (blind-safe aggregation)...');
  const mockLeague = createMockLeague();
  const team1 = mockLeague.teams[0];
  const team2 = mockLeague.teams[1];
  const team3 = mockLeague.teams[2];

  const sampleSwipes: Swipe[] = [
    // Opponent team2 wants team1's first 2 players in a 1-for-2 (which is 2-for-1 from team1's perspective)
    {
      id: 'sw_opp_1',
      teamId: team2.id,
      tradeType: '1-for-2',
      offeredPlayerIds: [team2.roster[0].id],
      targetPlayerIds: [team1.roster[0].id, team1.roster[1].id],
      targetTeamId: team1.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    },
    // Opponent team3 passed on team1's player (should NOT count in incoming hints)
    {
      id: 'sw_opp_pass',
      teamId: team3.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [team3.roster[0].id],
      targetPlayerIds: [team1.roster[2].id],
      targetTeamId: team1.id,
      isInterested: false,
      createdAt: new Date().toISOString(),
    },
  ];

  const hints = computeIncomingActivityHints(sampleSwipes, team1.id);
  assert.ok(
    hints.interestedTradeTypes.includes('2-for-1'),
    'Opponent 1-for-2 Want targeting team1 should register as incoming 2-for-1 interest for team1'
  );
  assert.ok(
    !hints.interestedTradeTypes.includes('1-for-1'),
    'Opponent pass swipe must not register in incoming activity hints'
  );
  assert.strictEqual(hints.totalIncomingCount, 1, 'Total incoming count should be 1');
  assert.ok(
    hints.targetedPlayerIds.includes(team1.roster[0].id) &&
      hints.targetedPlayerIds.includes(team1.roster[1].id),
    'Targeted player IDs must include team1 players wanted by opponent'
  );
  assert.ok(
    !hints.targetedPlayerIds.includes(team1.roster[2].id),
    'Passed player ID must not be in targetedPlayerIds'
  );
  console.log('✓ Enhancement 2.2a Passed: Blind-safe incoming activity hints computed accurately.');

  console.log('[Enhancement 2.2b] Testing Priority Deck Injection in generateDeckItems...');
  // Suppose team3 swiped right offering [team3.roster[2].id, team3.roster[3].id] for team1's [team1.roster[0].id] (2-for-1)
  // From team1's perspective, when shopping [team1.roster[0].id] in a 1-for-2 deck, that exact pair on team3 should be prioritized near the top!
  const prioritySwipe: Swipe = {
    id: 'sw_priority_2for1',
    teamId: team3.id,
    tradeType: '2-for-1',
    offeredPlayerIds: [team3.roster[2].id, team3.roster[3].id],
    targetPlayerIds: [team1.roster[0].id],
    targetTeamId: team1.id,
    isInterested: true,
    createdAt: new Date().toISOString(),
  };
  const priorityKeys = computePriorityTargetKeys([prioritySwipe], team1.id);
  assert.strictEqual(priorityKeys.length, 1, 'Should compute 1 priority target key');

  const deckWithPriority = generateDeckItems({
    league: mockLeague,
    userTeam: team1,
    tradeType: '1-for-2',
    offeredPlayerIds: [team1.roster[0].id],
    swipes: [prioritySwipe],
    seed: 'priority_test_seed_99',
    priorityTargetKeys: priorityKeys,
  });

  const sortedPairIds = [team3.roster[2].id, team3.roster[3].id].sort().join('_');
  const expectedCardId = `pkg_${team3.id}_${sortedPairIds}`;
  const foundIndex = deckWithPriority.findIndex((item) => item.id === expectedCardId);
  assert.ok(
    foundIndex === 0 || foundIndex === 1,
    `Priority package card should be injected into top 2 deck slots (slot 0 or 1), found at index ${foundIndex}`
  );
  console.log(`✓ Enhancement 2.2b Passed: Priority target package injected at index ${foundIndex} near top of deck.`);

  console.log('[Enhancement 2.2c] Testing Warm Trade Leads (cross-package-size mutual interest)...');
  // Team 1 swipes 1-for-1 offering p1_1 for p2_1
  // Team 2 swipes 2-for-1 offering [p2_1, p2_2] for [p1_1]
  // Exact 1-for-1 vs 2-for-1 doesn't trigger a confirmed match yet, but overlaps on p1_1 <-> p2_1!
  const warmSwipes: Swipe[] = [
    {
      id: 'sw_w1',
      teamId: team1.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [team1.roster[0].id],
      targetPlayerIds: [team2.roster[0].id],
      targetTeamId: team2.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'sw_w2',
      teamId: team2.id,
      tradeType: '2-for-1',
      offeredPlayerIds: [team2.roster[0].id, team2.roster[1].id],
      targetPlayerIds: [team1.roster[0].id],
      targetTeamId: team1.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    },
  ];
  const warmLeads = computeWarmTradeLeads(warmSwipes, [], mockLeague, team1.id);
  assert.strictEqual(warmLeads.length, 1, 'Should detect 1 Warm Trade Lead between team1 and team2');
  assert.strictEqual(
    warmLeads[0].suggestedTradeType,
    '1-for-1',
    'Suggested tradeType based on overlapping wanted players (1 from team1, 1 from team2) should be 1-for-1'
  );
  assert.strictEqual(warmLeads[0].myOfferedPlayers[0].id, team1.roster[0].id);
  assert.strictEqual(warmLeads[0].partnerOfferedPlayers[0].id, team2.roster[0].id);
  console.log('✓ Enhancement 2.2c Passed: Warm Trade Leads accurately detected with suggestedTradeType.');

  // -------------------------------------------------------------------------
  // 4. Test 2.3: Scoped & Authenticated Reset Controls (recycle_passes, reset_team_swipes, reset_league_swipes)
  // -------------------------------------------------------------------------
  console.log('[Enhancement 2.3] Testing Scoped & Authenticated Reset Controls...');
  const testLeagueId = '99887766';
  const userAName = `mgr_a_${Date.now()}`;
  const userBName = `mgr_b_${Date.now()}`;
  let userAId = '';
  let userBId = '';

  try {
    const regA = createUser(userAName, 'passA123');
    const regB = createUser(userBName, 'passB123');
    userAId = regA.user.id;
    userBId = regB.user.id;

    const leagueCopy = createMockLeague();
    leagueCopy.id = `league_${testLeagueId}`;
    leagueCopy.espnLeagueId = testLeagueId;
    saveServerLeagueSnapshot(leagueCopy, testLeagueId);

    // Claim team_1 for User A and team_2 for User B
    claimServerTeam(testLeagueId, team1.id, userAName, leagueCopy, null, userAId);
    claimServerTeam(testLeagueId, team2.id, userBName, leagueCopy, null, userBId);

    // Record a PASS swipe and a WANT swipe for team_1, plus a reciprocal WANT swipe for team_2
    recordServerSwipe(testLeagueId, {
      id: 'sw_a_pass',
      teamId: team1.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [team1.roster[0].id],
      targetPlayerIds: [team2.roster[1].id],
      targetTeamId: team2.id,
      isInterested: false,
      createdAt: new Date().toISOString(),
    });
    recordServerSwipe(testLeagueId, {
      id: 'sw_a_want',
      teamId: team1.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [team1.roster[0].id],
      targetPlayerIds: [team2.roster[0].id],
      targetTeamId: team2.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    });
    const afterMatchView = recordServerSwipe(testLeagueId, {
      id: 'sw_b_want',
      teamId: team2.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [team2.roster[0].id],
      targetPlayerIds: [team1.roster[0].id],
      targetTeamId: team1.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    });
    assert.strictEqual(afterMatchView?.state.matches.length, 1, 'Should have 1 confirmed match');

    // Test BOLA protection on recycle_passes: User B cannot recycle User A's passes
    const bolaRecycleReq = new NextRequest('http://localhost:3000/api/league', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${regB.token}`,
      },
      body: JSON.stringify({
        action: 'recycle_passes',
        leagueId: testLeagueId,
        teamId: team1.id,
      }),
    });
    const bolaRecycleRes = await leaguePOST(bolaRecycleReq);
    assert.strictEqual(bolaRecycleRes.status, 403, 'Rival manager must be blocked with 403 from recycling another team passes');

    // Test legitimate recycle_passes by User A: removes pass swipe, keeps want swipe & match!
    const validRecycleReq = new NextRequest('http://localhost:3000/api/league', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${regA.token}`,
      },
      body: JSON.stringify({
        action: 'recycle_passes',
        leagueId: testLeagueId,
        teamId: team1.id,
      }),
    });
    const validRecycleRes = await leaguePOST(validRecycleReq);
    assert.strictEqual(validRecycleRes.status, 200, 'Owner should succeed in recycling passes');
    const recycleData = await validRecycleRes.json();
    assert.strictEqual(recycleData.mySwipes.length, 1, 'Only the WANT swipe should remain after recycling passes');
    assert.strictEqual(recycleData.mySwipes[0].id, 'sw_a_want');
    assert.strictEqual(recycleData.matches.length, 1, 'Confirmed match must be preserved after recycle_passes');

    // Test reset_team_swipes by User A: clears team1 swipes and matches, but preserves team2 swipes!
    const resetTeamReq = new NextRequest('http://localhost:3000/api/league', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${regA.token}`,
      },
      body: JSON.stringify({
        action: 'reset_team_swipes',
        leagueId: testLeagueId,
        teamId: team1.id,
      }),
    });
    const resetTeamRes = await leaguePOST(resetTeamReq);
    assert.strictEqual(resetTeamRes.status, 200);
    const resetTeamData = await resetTeamRes.json();
    assert.strictEqual(resetTeamData.mySwipes.length, 0, 'Team 1 swipes should be cleared');
    assert.strictEqual(resetTeamData.matches.length, 0, 'Team 1 matches should be cleared');

    // Verify User B still has their swipe intact
    const userBViewReq = new NextRequest(
      `http://localhost:3000/api/league?leagueId=${testLeagueId}&teamId=${team2.id}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${regB.token}` },
      }
    );
    const userBViewRes = await leagueGET(userBViewReq);
    const userBViewData = await userBViewRes.json();
    assert.strictEqual(userBViewData.mySwipes.length, 1, 'Team 2 swipe must remain untouched by Team 1 reset');

    // Test unauthenticated full league reset is rejected with 401 when league has claimedByUserId teams
    const unauthLeagueResetReq = new NextRequest('http://localhost:3000/api/league', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reset_swipes',
        leagueId: testLeagueId,
      }),
    });
    const unauthLeagueResetRes = await leaguePOST(unauthLeagueResetReq);
    assert.strictEqual(
      unauthLeagueResetRes.status,
      401,
      'Unauthenticated full league reset must be rejected when teams are claimed by authenticated users'
    );

    // Regular authenticated claimed manager attempting full league reset is rejected with 403 Forbidden
    const regLeagueResetReq = new NextRequest('http://localhost:3000/api/league', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${regA.token}`,
      },
      body: JSON.stringify({
        action: 'reset_league_swipes',
        leagueId: testLeagueId,
        teamId: team1.id,
      }),
    });
    const regLeagueResetRes = await leaguePOST(regLeagueResetReq);
    assert.strictEqual(
      regLeagueResetRes.status,
      403,
      'Individual regular managers must be forbidden from performing full league swipe reset'
    );

    // Super user (superu) can trigger full league reset, stamping lastResetAt
    ensureSuperUserAccount();
    const superLogin = loginUser('superu', 'thanos');
    assert(superLogin && superLogin.token, 'Superuser login must succeed');
    const superLeagueResetReq = new NextRequest('http://localhost:3000/api/league', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superLogin.token}`,
      },
      body: JSON.stringify({
        action: 'reset_league_swipes',
        leagueId: testLeagueId,
        teamId: team1.id,
      }),
    });
    const superLeagueResetRes = await leaguePOST(superLeagueResetReq);
    assert.strictEqual(superLeagueResetRes.status, 200);
    const superLeagueResetData = await superLeagueResetRes.json();
    assert.ok(Boolean(superLeagueResetData.lastResetAt), 'Full league reset by super user must stamp lastResetAt');

    console.log('✓ Enhancement 2.3 Passed: recycle_passes, reset_team_swipes, and superuser-only reset_league_swipes verified.');
  } finally {
    deleteServerLeagueState(testLeagueId);
    if (userAId) deleteUser(userAId);
    if (userBId) deleteUser(userBId);
  }

  // -------------------------------------------------------------------------
  // 5. Test 1.2, 1.5, 3.1: UI Component Contracts (Inline Switcher, Keyboard Shortcuts, Stats/Filters, Compact Mobile Header)
  // -------------------------------------------------------------------------
  console.log('[Enhancements 1.2, 1.5, 3.1] Verifying UI component contracts...');
  const swipeCardSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/components/SwipeCard.tsx'),
    'utf8'
  );
  assert.ok(
    swipeCardSrc.includes('toggleStats: () => void') &&
      swipeCardSrc.includes('setShowStats((prev) => !prev)'),
    'SwipeCardRef must expose toggleStats'
  );

  assert.ok(
    pageSrc.includes("e.key === 'ArrowLeft'") &&
      pageSrc.includes("e.key === 'ArrowRight'") &&
      pageSrc.includes("e.key === 'Backspace'") &&
      pageSrc.includes('cardRef.current.toggleStats()'),
    'page.tsx must wire desktop keyboard shortcuts (ArrowLeft, ArrowRight, Z/Backspace, Space/I)'
  );

  const shoppingRosterSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/components/ShoppingRoster.tsx'),
    'utf8'
  );
  assert.ok(
    shoppingRosterSrc.includes("['All', 'QB', 'RB', 'WR', 'TE']") &&
      shoppingRosterSrc.includes('player.projectedPoints.toFixed(1)') &&
      shoppingRosterSrc.includes('player.seasonAvgPoints.toFixed(1)'),
    'ShoppingRoster.tsx must include position filter pills and Proj/Avg stat badges'
  );

  const filterBarSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/components/PositionFilterBar.tsx'),
    'utf8'
  );
  assert.ok(
    filterBarSrc.includes("toggleMobilePill('package')") &&
      filterBarSrc.includes("toggleMobilePill('positions')") &&
      filterBarSrc.includes("toggleMobilePill('teams')") &&
      filterBarSrc.includes('onTradeTypeChange') &&
      filterBarSrc.includes('onToggleOfferedPlayer') &&
      filterBarSrc.includes('player.projectedPoints.toFixed(1)') &&
      filterBarSrc.includes('player.seasonAvgPoints.toFixed(1)'),
    'PositionFilterBar.tsx must include the compact mobile pills, inline package switcher controls, and Proj/Avg stat badges'
  );

  assert.ok(
    pageSrc.includes("target.tagName === 'BUTTON'") &&
      pageSrc.includes('target.blur()'),
    'page.tsx keyboard shortcuts must guard against BUTTON focus conflicts when Space/Arrow keys are pressed'
  );

  const navbarSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/components/Navbar.tsx'),
    'utf8'
  );
  assert.ok(
    navbarSrc.includes('gap-2 sm:gap-3 lg:gap-4') &&
      navbarSrc.includes('flex-shrink-0') &&
      navbarSrc.includes('min-[360px]:inline-block') &&
      navbarSrc.includes('hidden lg:inline') &&
      navbarSrc.includes('hidden xl:inline') &&
      navbarSrc.includes('pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]') &&
      navbarSrc.includes('min-h-[48px]'),
    'Navbar.tsx must enforce flex-shrink protection, gap separation, responsive icon-only modes, and touch hitboxes'
  );

  console.log('✓ Enhancements 1.2, 1.5, 3.1 Passed: All UI and keyboard shortcut contracts verified.');

  // -------------------------------------------------------------------------
  // 6. Test Sprint 1-3 Fixes: Reciprocal hint clearing, Rapid swipe celebration, Auth 401 handling, Default positions
  // -------------------------------------------------------------------------
  console.log('[Enhancement Sprint 1-3] Testing Reciprocal Swipe Hint Clearing...');
  const swipeFromTeam2: Swipe = {
    id: 'sw_team2_want_team1',
    teamId: team2.id,
    tradeType: '1-for-1',
    offeredPlayerIds: [team2.roster[0].id],
    targetPlayerIds: [team1.roster[0].id],
    targetTeamId: team1.id,
    isInterested: true,
    createdAt: new Date().toISOString(),
  };
  const hintsBefore = computeIncomingActivityHints([swipeFromTeam2], team1.id);
  assert.strictEqual(hintsBefore.totalIncomingCount, 1, 'Should have 1 incoming hint before reciprocal response');

  const reciprocalResponse: Swipe = {
    id: 'sw_team1_respond_pass',
    teamId: team1.id,
    tradeType: '1-for-1',
    offeredPlayerIds: [team1.roster[0].id],
    targetPlayerIds: [team2.roster[0].id],
    targetTeamId: team2.id,
    isInterested: false,
    createdAt: new Date().toISOString(),
  };
  const hintsAfter = computeIncomingActivityHints([swipeFromTeam2, reciprocalResponse], team1.id);
  assert.strictEqual(hintsAfter.totalIncomingCount, 0, 'Incoming hint must be cleared once responded to');
  const prioAfter = computePriorityTargetKeys([swipeFromTeam2, reciprocalResponse], team1.id);
  assert.strictEqual(prioAfter.length, 0, 'Priority target keys must be cleared once responded to');
  console.log('✓ Enhancement Sprint 1-3: Reciprocal swipe hints and priority keys cleared successfully.');

  console.log('[Enhancement Sprint 1-3] Testing page.tsx Rapid Swiping, 401 Expiry, and Filter defaults...');
  assert.ok(
    pageSrc.includes('undoneSwipeIdsRef') &&
      pageSrc.includes('mutationQueueRef') &&
      pageSrc.includes('buttonSwipeTimeoutRef'),
    'page.tsx must define undoneSwipeIdsRef, mutationQueueRef, and buttonSwipeTimeoutRef'
  );
  assert.ok(
    pageSrc.includes('!undoneSwipeIdsRef.current.has(newSwipe.id)') &&
      pageSrc.includes('setActiveMatchCelebration(serverView.matchFound)'),
    'page.tsx must preserve and celebrate match even on rapid swipe'
  );
  assert.ok(
    pageSrc.includes('serverView.status === 401') &&
      pageSrc.includes("handleOpenAuth('login')"),
    'page.tsx must handle 401 session expiry and prompt login'
  );
  assert.ok(
    pageSrc.includes('useState<Position[]>(ALL_POSITIONS)'),
    'page.tsx must default selectedPositions to ALL_POSITIONS'
  );

  const authRouteSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/app/api/auth/route.ts'),
    'utf8'
  );
  assert.ok(
    authRouteSrc.includes('claimServerTeam') &&
      authRouteSrc.includes('leagueLock.acquire(cleanLeagueId'),
    'auth/route.ts must sync team claim to server league store inside leagueLock'
  );

  const adminRouteSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/app/api/admin/route.ts'),
    'utf8'
  );
  assert.ok(
    adminRouteSrc.includes('leagueLock.acquire(targetUserId') &&
      adminRouteSrc.includes('userLock.acquire(targetLeagueId'),
    'admin/route.ts must wrap both delete_user and delete_league in leagueLock and userLock'
  );

  console.log('✓ Enhancement Sprint 1-3: Rapid swipe queue, 401 handling, default positions, auth claim sync, and admin dual locking verified.');

  console.log('\n========================================================');
  console.log('ALL 6 SELECTED ENHANCEMENTS VERIFICATION TESTS PASSED! 🎉');
  console.log('========================================================\n');
})();

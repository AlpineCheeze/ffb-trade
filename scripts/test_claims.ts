import assert from 'assert';
import { claimServerTeam, getServerLeagueState } from '@/lib/serverLeagueStore';

async function runClaimTests() {
  console.log('--- Starting Team Claim Logic Verification Suite ---');

  const leagueId = 'claim-test-league-' + Date.now();
  // Initialize mock state with 12345678 demo league data structure
  const baseState = getServerLeagueState('12345678');
  assert(baseState, 'Base state for 12345678 should exist');

  // Deep clone to our isolated test league
  const isolatedLeague = JSON.parse(JSON.stringify(baseState.league));
  isolatedLeague.id = leagueId;
  isolatedLeague.espnLeagueId = leagueId;
  isolatedLeague.teams.forEach((t: any) => {
    t.isClaimed = false;
    t.claimedBy = undefined;
    t.claimedByUserId = undefined;
  });

  const { saveServerLeagueState } = await import('@/lib/serverLeagueStore');
  saveServerLeagueState({
    ...baseState,
    league: isolatedLeague,
  });

  try {
    console.log('[Test 1] Authenticated claim sets user details...');
    const team1 = isolatedLeague.teams[0].id;
    const team2 = isolatedLeague.teams[1].id;

    const res1 = claimServerTeam(leagueId, team1, 'User Alpha', undefined, undefined, 'user-123');
    assert(res1, 'Claim should succeed');
    const claimedTeam1 = res1.league.teams.find((t: any) => t.id === team1);
    assert.strictEqual(claimedTeam1?.isClaimed, true);
    assert.strictEqual(claimedTeam1?.claimedBy, 'User Alpha');
    assert.strictEqual(claimedTeam1?.claimedByUserId, 'user-123');
    console.log('✓ Test 1 Passed: Authenticated claim succeeds.');

    console.log('[Test 2] Unauthenticated claim cannot overwrite authenticated claim...');
    const res2 = claimServerTeam(leagueId, team1, 'Intruder');
    const stillTeam1 = res2?.league.teams.find((t: any) => t.id === team1);
    assert.strictEqual(stillTeam1?.claimedBy, 'User Alpha');
    assert.strictEqual(stillTeam1?.claimedByUserId, 'user-123');
    console.log('✓ Test 2 Passed: Unauthenticated claim blocked.');

    console.log('[Test 3] Different authenticated user cannot overwrite claimed team...');
    const res3 = claimServerTeam(leagueId, team1, 'User Beta', undefined, undefined, 'user-456');
    const stillAlpha = res3?.league.teams.find((t: any) => t.id === team1);
    assert.strictEqual(stillAlpha?.claimedBy, 'User Alpha');
    assert.strictEqual(stillAlpha?.claimedByUserId, 'user-123');
    console.log('✓ Test 3 Passed: Different authenticated user blocked.');

    console.log('[Test 4] Switching teams with cleanUserId releases previous team...');
    const res4 = claimServerTeam(leagueId, team2, 'User Alpha', undefined, team1, 'user-123');
    const releasedTeam1 = res4?.league.teams.find((t: any) => t.id === team1);
    const newTeam2 = res4?.league.teams.find((t: any) => t.id === team2);
    assert.strictEqual(releasedTeam1?.isClaimed, false);
    assert.strictEqual(releasedTeam1?.claimedBy, undefined);
    assert.strictEqual(releasedTeam1?.claimedByUserId, undefined);
    assert.strictEqual(newTeam2?.isClaimed, true);
    assert.strictEqual(newTeam2?.claimedBy, 'User Alpha');
    assert.strictEqual(newTeam2?.claimedByUserId, 'user-123');
    console.log('✓ Test 4 Passed: Previous team released upon team switch.');

    console.log('[Test 5] Loose name matching does NOT unclaim another manager team...');
    // Claim team1 as unauthenticated 'Manager'
    claimServerTeam(leagueId, team1, 'Manager');
    const stateAfterTeam1 = getServerLeagueState(leagueId);
    const team1Claimed = stateAfterTeam1?.league.teams.find((t: any) => t.id === team1);
    assert.strictEqual(team1Claimed?.isClaimed, true);
    assert.strictEqual(team1Claimed?.claimedBy, 'Manager');

    // Another user claims team 3 also with name 'Manager' (no userId, no previousTeamId)
    const team3 = isolatedLeague.teams[2].id;
    const res5 = claimServerTeam(leagueId, team3, 'Manager');
    const team1StillClaimed = res5?.league.teams.find((t: any) => t.id === team1);
    assert.strictEqual(team1StillClaimed?.isClaimed, true, 'Team 1 must not be released by raw name match');
    console.log('✓ Test 5 Passed: Loose claimant name does NOT release other claimed teams.');

    console.log('=============================================');
    console.log('ALL CLAIM LOGIC TESTS PASSED! 🎉');
    console.log('=============================================');
  } finally {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(process.cwd(), '.data', 'leagues', `${leagueId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

export const testPromise = runClaimTests().catch((err) => {
  console.error('Claim test failed:', err);
  process.exit(1);
});

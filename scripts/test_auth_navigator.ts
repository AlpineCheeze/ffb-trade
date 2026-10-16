import assert from 'assert';
import path from 'path';
import fs from 'fs';

process.env.DATA_DIR = path.join(__dirname, '..', '.data_test_auth_nav');

import {
  createUser,
  loginUser,
  getUserByToken,
  getUserById,
  linkUserTeamClaim,
  unlinkUserTeamClaim,
  clearAllServerUsers,
} from '@/lib/serverUserStore';

import {
  getServerLeagueState,
  clearAllServerLeagues,
} from '@/lib/serverLeagueStore';

import { UserAccount, UserClaimedLeagueSummary } from '@/types/fantasy';

export const testPromise = (async function runAuthNavigatorTests() {
  console.log('--- Starting Auth Navigator & Claimed Teams Test Suite ---\n');

  try {
    clearAllServerUsers();
    clearAllServerLeagues();

    // 1. Create a user
    console.log('[Test 1] User registration & initial claim state...');
    const { user, token } = createUser('TouchdownHero', 'securePass123');
    assert.strictEqual(user.username, 'TouchdownHero');
    assert(token && token.startsWith('tok_'));
    assert.deepStrictEqual(user.claimedTeams, {});
    console.log('✓ Test 1 Passed: User created with empty claims.');

    // 2. Claim a team in demo league 12345678
    console.log('[Test 2] Claiming a team in a league and linking to user account...');
    const demoState = getServerLeagueState('12345678');
    assert(demoState && demoState.league);
    const targetTeam = demoState.league.teams[0];

    // Link team claim to user
    const updatedUser = linkUserTeamClaim(user.id, '12345678', targetTeam.id);
    assert(updatedUser, 'Expected updatedUser to be non-null');
    assert.strictEqual(updatedUser.claimedTeams['12345678'], targetTeam.id);
    console.log('✓ Test 2 Passed: User claim linked in serverUserStore.');

    // 3. Test enrichment helper logic (same logic as in /api/auth/route.ts)
    console.log('[Test 3] Verifying claimedLeaguesDetails enrichment...');
    function enrichUser(u: UserAccount): UserAccount {
      const details: UserClaimedLeagueSummary[] = [];
      for (const [leagueId, teamId] of Object.entries(u.claimedTeams || {})) {
        const state = getServerLeagueState(leagueId);
        if (state && state.league) {
          const team = state.league.teams.find((t) => t.id === teamId || t.espnTeamId === teamId);
          details.push({
            leagueId,
            leagueName: state.league.name,
            seasonId: state.league.seasonId,
            teamId,
            teamName: team?.name || `Team ${teamId}`,
            teamLogo: team?.logoUrl || null,
            ownerName: team?.ownerName || u.username,
            starPlayers: team?.roster?.slice(0, 4) || [],
            totalTeams: state.league.teams.length,
            matchesCount: state.matches.filter((m) => m.teamAId === teamId || m.teamBId === teamId).length,
          });
        }
      }
      return { ...u, claimedLeaguesDetails: details };
    }

    const enriched = enrichUser(updatedUser);
    assert.strictEqual(enriched.claimedLeaguesDetails?.length, 1);
    const summary = enriched.claimedLeaguesDetails![0];
    assert.strictEqual(summary.leagueId, '12345678');
    assert.strictEqual(summary.teamId, targetTeam.id);
    assert.strictEqual(summary.teamName, targetTeam.name);
    assert(Array.isArray(summary.starPlayers));
    console.log(`✓ Test 3 Passed: Claimed league details enriched: ${summary.leagueName} -> ${summary.teamName} (${summary.starPlayers.length} star players)`);

    // 4. Test unlinking claim
    console.log('[Test 4] Unlinking claim...');
    const unlinkedUser = unlinkUserTeamClaim(user.id, '12345678');
    assert(unlinkedUser, 'Expected unlinkedUser to be non-null');
    assert.strictEqual(unlinkedUser.claimedTeams['12345678'], undefined);
    const enrichedUnlinked = enrichUser(unlinkedUser);
    assert.strictEqual(enrichedUnlinked.claimedLeaguesDetails?.length, 0);
    console.log('✓ Test 4 Passed: Unlinked claim successfully cleared from details.');

    // Clean up test dir
    if (fs.existsSync(process.env.DATA_DIR)) {
      fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
    }

    console.log('\n=============================================');
    console.log('ALL AUTH NAVIGATOR TESTS PASSED! 🎉');
    console.log('=============================================\n');
  } catch (err) {
    console.error('Test Suite Failed:', err);
    if (fs.existsSync(process.env.DATA_DIR)) {
      fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
    }
    process.exit(1);
  }
})();

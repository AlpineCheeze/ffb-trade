import assert from 'assert';
import path from 'path';
import fs from 'fs';

process.env.DATA_DIR = path.join(__dirname, '..', '.data_test_superuser');

import {
  createUser,
  loginUser,
  getUserByToken,
  getUserById,
  getAllUsers,
  deleteUser,
  linkUserTeamClaim,
  unlinkUserTeamClaim,
  unlinkAllUserClaimsForLeague,
  clearAllServerUsers,
  ensureSuperUserAccount,
} from '@/lib/serverUserStore';

import {
  getServerLeagueState,
  saveServerLeagueSnapshot,
  getAllServerLeagues,
  superDeleteLeague,
  superAssignTeam,
  superUnassignTeam,
  unclaimAllTeamsForUser,
  clearAllServerLeagues,
} from '@/lib/serverLeagueStore';

export const testPromise = (async function runSuperUserTests() {
  console.log('--- Starting Super User Verification Suite ---\n');

  try {
    clearAllServerUsers();
    clearAllServerLeagues();

    // 1. Root Super User creation and authentication
    console.log('[Test 1] Testing superu auto-creation and authentication...');
    const superu = ensureSuperUserAccount();
    assert.strictEqual(superu.username, 'superu');
    assert.strictEqual(superu.isSuperUser, true);

    const loginRes = loginUser('superu', 'thanos');
    assert(loginRes && loginRes.token);
    assert.strictEqual(loginRes.user.username, 'superu');
    assert.strictEqual(loginRes.user.isSuperUser, true);

    assert.throws(() => {
      loginUser('superu', 'wrongpassword');
    }, /Invalid username or password/);

    const tokenUser = getUserByToken(loginRes.token);
    assert(tokenUser);
    assert.strictEqual(tokenUser.username, 'superu');
    assert.strictEqual(tokenUser.isSuperUser, true);
    console.log('✓ Test 1 Passed: superu account created with password thanos and isSuperUser: true.');

    // 2. View all leagues and users
    console.log('[Test 2] Testing viewing all users and leagues...');
    const { user: testUser1 } = createUser('ManagerOne', 'pass1234');
    const { user: testUser2 } = createUser('ManagerTwo', 'pass5678');

    const allUsers = getAllUsers();
    assert(allUsers.length >= 3);
    assert.strictEqual(allUsers[0].username, 'superu', 'superu should be listed first');
    assert(allUsers.some((u) => u.username === 'ManagerOne'));
    assert(allUsers.some((u) => u.username === 'ManagerTwo'));

    const allLeagues = getAllServerLeagues();
    assert(allLeagues.length >= 1);
    assert(allLeagues.some((l) => l.league.espnLeagueId === '12345678'));
    console.log(`✓ Test 2 Passed: Superuser can view all ${allUsers.length} users and ${allLeagues.length} leagues.`);

    // 3. Superuser assigning user to a team and unassigning
    console.log('[Test 3] Testing superuser assign user to team and unassign...');
    const demoLeague = getServerLeagueState('12345678');
    assert(demoLeague);
    const targetTeam = demoLeague.league.teams[0];

    // Assign ManagerOne to team 0
    const assignedState = superAssignTeam('12345678', targetTeam.id, testUser1.id, testUser1.username);
    assert(assignedState);
    linkUserTeamClaim(testUser1.id, '12345678', targetTeam.id);

    const teamAfterAssign = assignedState.league.teams.find((t) => t.id === targetTeam.id);
    assert(teamAfterAssign);
    assert.strictEqual(teamAfterAssign.isClaimed, true);
    assert.strictEqual(teamAfterAssign.claimedBy, 'ManagerOne');
    assert.strictEqual(teamAfterAssign.claimedByUserId, testUser1.id);

    const userAfterAssign = getUserById(testUser1.id);
    assert(userAfterAssign);
    assert.strictEqual(userAfterAssign.claimedTeams['12345678'], targetTeam.id);

    // Unassign team
    const { state: unassignedState, previousUserId } = superUnassignTeam('12345678', targetTeam.id);
    assert(unassignedState);
    assert.strictEqual(previousUserId, testUser1.id);
    unlinkUserTeamClaim(previousUserId, '12345678');

    const teamAfterUnassign = unassignedState.league.teams.find((t) => t.id === targetTeam.id);
    assert(teamAfterUnassign);
    assert.strictEqual(teamAfterUnassign.isClaimed, false);
    assert.strictEqual(teamAfterUnassign.claimedBy, undefined);

    const userAfterUnassign = getUserById(testUser1.id);
    assert(userAfterUnassign);
    assert.strictEqual(userAfterUnassign.claimedTeams['12345678'], undefined);
    console.log('✓ Test 3 Passed: Superuser can assign and unassign users to/from any team.');

    // 4. Superuser deleting a regular user and protecting root superu
    console.log('[Test 4] Testing user deletion and protection of superu root account...');
    // Re-assign ManagerTwo to a team
    superAssignTeam('12345678', targetTeam.id, testUser2.id, testUser2.username);
    linkUserTeamClaim(testUser2.id, '12345678', targetTeam.id);

    // Delete ManagerTwo
    unclaimAllTeamsForUser(testUser2.id);
    const deleted = deleteUser(testUser2.id);
    assert.strictEqual(deleted, true);

    const allUsersAfterDelete = getAllUsers();
    assert(!allUsersAfterDelete.some((u) => u.id === testUser2.id));

    // Team should now be unassigned
    const demoAfterUserDelete = getServerLeagueState('12345678');
    assert(demoAfterUserDelete);
    const teamAfterUserDelete = demoAfterUserDelete.league.teams.find((t) => t.id === targetTeam.id);
    assert(teamAfterUserDelete);
    assert.strictEqual(teamAfterUserDelete.isClaimed, false);

    // Verify root superu cannot be deleted
    assert.throws(() => {
      deleteUser(superu.id);
    }, /Cannot delete the root super user account/);
    console.log('✓ Test 4 Passed: User deleted, team claims cleaned up, and root superu is protected.');

    // 5. Superuser deleting a league
    console.log('[Test 5] Testing superuser deleting a league...');
    // Create a mock league
    const customLeagueId = '99988877';
    saveServerLeagueSnapshot({
      id: `league_${customLeagueId}`,
      espnLeagueId: customLeagueId,
      name: 'Custom Test League For Deletion',
      seasonId: '2024',
      isPrivate: false,
      teams: [
        {
          id: 'team_del_1',
          espnTeamId: '1',
          name: 'Deletion Team 1',
          ownerName: 'Owner 1',
          roster: [],
        },
      ],
      inviteCode: customLeagueId,
    });

    superAssignTeam(customLeagueId, 'team_del_1', testUser1.id, testUser1.username);
    linkUserTeamClaim(testUser1.id, customLeagueId, 'team_del_1');

    const uBeforeLeagueDelete = getUserById(testUser1.id);
    assert.strictEqual(uBeforeLeagueDelete?.claimedTeams[customLeagueId], 'team_del_1');

    // Superuser deletes league
    superDeleteLeague(customLeagueId);
    unlinkAllUserClaimsForLeague(customLeagueId);

    const leaguesAfterDelete = getAllServerLeagues();
    assert(!leaguesAfterDelete.some((l) => l.league.espnLeagueId === customLeagueId));

    const uAfterLeagueDelete = getUserById(testUser1.id);
    assert.strictEqual(uAfterLeagueDelete?.claimedTeams[customLeagueId], undefined);
    console.log('✓ Test 5 Passed: League deleted and user claims unlinked.');

    // Clean up test dir
    if (fs.existsSync(process.env.DATA_DIR)) {
      fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
    }

    console.log('\n=============================================');
    console.log('ALL SUPER USER VERIFICATION TESTS PASSED! 🎉');
    console.log('=============================================\n');
  } catch (err) {
    console.error('Super User Test Suite Failed:', err);
    if (fs.existsSync(process.env.DATA_DIR)) {
      fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
    }
    process.exit(1);
  }
})();

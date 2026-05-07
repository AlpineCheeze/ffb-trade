# Security Specification: Trade Tinder

## 1. Data Invariants
- A vote cannot exist without a valid trade reference and a verified user.
- A player's ELO can only be incremented or decremented based on a valid swiping action. (Note: In this client-side implementation, we enforce that only `elo` and `votes_count` can be updated on player records).
- Users can only modify their own teams and profiles.

## 2. The "Dirty Dozen" Payloads (Denial Tests)
1. **Identity Spoofing**: Attempt to create a vote for another user.
2. **Resource Poisoning**: Attempt to create a trade with 1MB of junk in `tradeId`.
3. **Privilege Escalation**: Attempt to update a player's `name` or `position`.
4. **State Shortcutting**: Attempt to jump a player's `votes_count` by more than 1.
5. **Orphaned Writes**: Create a vote for a non-existent trade (handled by client logic, rules check ID format).
6. **PII Leak**: Attempt to read another user's profile.
7. **Cross-User Team Mod**: Attempt to update another user's `team_player_ids`.
8. **Vote Spam**: Attempt to update `elo` without a authenticated session.
9. **Invalid Choice**: Create a vote with `choice: 'MAYBE'`.
10. **Trade Bloat**: Create a trade with an empty list of players.
11. **ID Injection**: Use special characters in document IDs to break path matching.
12. **Mass Update**: Attempt to update multiple fields on a player including restricted ones like `team`.

## 3. Test Scenarios (Pseudo-tests)
- `votes.create()` as `uid: A` with `user_id: B` -> DENIED.
- `players.update()` with `incoming().name != existing().name` -> DENIED.
- `users.get()` for `userId: admin` by `user: pleb` -> DENIED.
- `votes.create()` with `choice: 'YES'` and `user_id: A` by `user: A` -> ALLOWED.
